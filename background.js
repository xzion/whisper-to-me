// Background service worker for handling API calls and context menu

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'whisperToMe',
    title: 'Whisper to me',
    contexts: ['selection']
  });
});

// Split text into segments at sentence boundaries
function splitTextAtSentences(text, maxLength = 4096) {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const segments = [];
  let currentSegment = '';
  let remainingText = text;
  
  while (remainingText.length > 0) {
    if (remainingText.length <= maxLength) {
      // Remaining text fits in one segment
      segments.push(remainingText);
      break;
    }
    
    // Find the portion that fits within the limit
    let segmentText = remainingText.substring(0, maxLength);
    
    // Find the last sentence boundary (period followed by space or end)
    let lastPeriodIndex = -1;
    for (let i = segmentText.length - 1; i >= 0; i--) {
      if (segmentText[i] === '.' && (i === segmentText.length - 1 || segmentText[i + 1] === ' ')) {
        lastPeriodIndex = i;
        break;
      }
    }
    
    if (lastPeriodIndex > 0 && lastPeriodIndex > maxLength * 0.5) {
      // Found a good sentence boundary and it's not too short
      segmentText = segmentText.substring(0, lastPeriodIndex + 1);
    } else {
      // No good sentence boundary found, look for other punctuation
      const punctuation = ['.', '!', '?', ';', ':', ','];
      let lastPuncIndex = -1;
      
      for (let i = segmentText.length - 1; i >= maxLength * 0.5; i--) {
        if (punctuation.includes(segmentText[i])) {
          lastPuncIndex = i;
          break;
        }
      }
      
      if (lastPuncIndex > 0) {
        segmentText = segmentText.substring(0, lastPuncIndex + 1);
      } else {
        // No punctuation found, split at last space
        let lastSpaceIndex = segmentText.lastIndexOf(' ');
        if (lastSpaceIndex > maxLength * 0.5) {
          segmentText = segmentText.substring(0, lastSpaceIndex);
        }
        // If no space found either, we'll use the full maxLength
      }
    }
    
    segments.push(segmentText.trim());
    remainingText = remainingText.substring(segmentText.length).trim();
  }
  
  return segments.filter(segment => segment.length > 0);
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'whisperToMe' && info.selectionText) {
    const text = info.selectionText.trim();
    debug.log('[TTS] Context menu clicked, text length:', text.length);
    
    // Split text into segments if it's too long
    const segments = splitTextAtSentences(text);
    debug.log('[TTS] Text split into', segments.length, 'segments');

    // Get settings and API key
    debug.log('[TTS] Retrieving settings and API key');
    const settings = await SecureStorage.getSettings();
    const apiKey = await SecureStorage.getApiKey();
    debug.log('[TTS] Settings retrieved:', { voice: settings.voice, speed: settings.speed, model: settings.model });
    
    if (!apiKey) {
      debug.log('[TTS] No API key configured');
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        error: 'Please configure your OpenAI API key in the extension settings.'
      });
      return;
    }

    // Send message to content script to show overlay
    debug.log('[TTS] Sending startTTS message to content script');
    chrome.tabs.sendMessage(tab.id, {
      action: 'startTTS',
      text: text,
      settings: settings
    });

    // Start TTS process with segments
    debug.log('[TTS] Starting TTS process with', segments.length, 'segment(s)');
    startTextToSpeechWithSegments(segments, settings, apiKey, tab.id);
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testVoice') {
    handleTestVoice(request.text, request.settings).then(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (request.action === 'stopTTS') {
    stopCurrentTTS();
    sendResponse({ success: true });
  }
});

// Current TTS state
let currentAudioStream = null;
let currentReader = null;
let currentTabId = null;

// Build TTS request body with conditional parameters
function buildTTSRequestBody(settings, text) {
  const body = {
    model: settings.model || 'tts-1',
    input: text,
    voice: settings.voice || 'alloy'
  };

  // Only add instructions for GPT model
  if (settings.model === 'gpt-4o-mini-tts' && settings.instructions) {
    body.instructions = settings.instructions;
  }

  debug.log('[TTS] Built request body:', body);
  return body;
}

// Test voice functionality
async function handleTestVoice(text, settings) {
  debug.log('[TTS] Testing voice with settings:', settings);
  const apiKey = await SecureStorage.getApiKey();
  if (!apiKey) {
    debug.log('[TTS] No API key for voice test');
    return { error: 'No API key configured' };
  }

  try {
    debug.log('[TTS] Making test API request to OpenAI');
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildTTSRequestBody(settings, text))
    });

    if (!response.ok) {
      debug.log('[TTS] Test API request failed with status:', response.status);
      const error = await response.json();
      return { error: error.error?.message || 'API request failed' };
    }

    // For test, we'll just validate the response
    debug.log('[TTS] Voice test successful');
    return { success: true };
  } catch (error) {
    debug.log('[TTS] Voice test error:', error);
    return { error: error.message };
  }
}

// Start text-to-speech with multiple segments
async function startTextToSpeechWithSegments(segments, settings, apiKey, tabId) {
  debug.log('[TTS] Starting TTS with', segments.length, 'segments');
  currentTabId = tabId;
  
  try {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentNumber = i + 1;
      const totalSegments = segments.length;
      
      debug.log(`[TTS] Processing segment ${segmentNumber}/${totalSegments}, length: ${segment.length} characters`);
      
      // Keep showing "Buffering..." for all segments until the last one
      
      // Process this segment
      await startTextToSpeech(segment, settings, apiKey, tabId, segmentNumber, totalSegments);
    }
    
    debug.log('[TTS] All segments processed successfully');
    
  } catch (error) {
    console.error('[TTS] Error processing segments:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'ttsError',
      error: `Error processing text segments: ${error.message}`
    });
  }
}

// Start text-to-speech with streaming
async function startTextToSpeech(text, settings, apiKey, tabId, segmentNumber = 1, totalSegments = 1) {
  debug.log('[TTS] Starting TTS API request for', text.length, 'characters');
  currentTabId = tabId;
  
  try {
    debug.log('[TTS] Making API request to OpenAI with settings:', {
      model: settings.model || 'tts-1',
      voice: settings.voice || 'alloy',
      speed: settings.speed || 1.0
    });
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...buildTTSRequestBody(settings, text),
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      debug.log('[TTS] API request failed with status:', response.status);
      const error = await response.json();
      debug.log('[TTS] API error details:', error);
      chrome.tabs.sendMessage(tabId, {
        action: 'ttsError',
        error: error.error?.message || 'API request failed'
      });
      return;
    }

    // Stream the audio data
    debug.log('[TTS] API request successful, starting audio stream');
    currentAudioStream = response.body;
    currentReader = response.body.getReader();
    const chunks = [];
    let chunkCount = 0;

    // Read stream chunks
    while (true) {
      const { done, value } = await currentReader.read();
      
      if (done) {
        debug.log('[TTS] Stream reading complete, received', chunkCount, 'chunks');
        break;
      }
      
      chunkCount++;
      chunks.push(value);
      debug.log('[TTS] Received chunk', chunkCount, 'size:', value.length, 'bytes');
      
      // Send chunk to content script for playback
      chrome.tabs.sendMessage(tabId, {
        action: 'audioChunk',
        chunk: Array.from(value), // Convert Uint8Array to regular array for messaging
        isLast: false
      });
    }

    // Signal completion - only mark as last if this is the final segment
    const isLastSegment = segmentNumber === totalSegments;
    debug.log(`[TTS] Segment ${segmentNumber}/${totalSegments} complete, isLastSegment: ${isLastSegment}`);
    
    if (isLastSegment) {
      chrome.tabs.sendMessage(tabId, {
        action: 'audioChunk',
        chunk: [],
        isLast: true
      });
    } else {
      // For non-final segments, just indicate this segment is done but more are coming
      debug.log('[TTS] Segment complete, more segments pending...');
    }

  } catch (error) {
    console.error('TTS Error:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'ttsError',
      error: error.message
    });
  }
}

// Stop current TTS
function stopCurrentTTS() {
  debug.log('[TTS] Stopping current TTS');
  if (currentReader) {
    currentReader.cancel();
    currentReader = null;
    debug.log('[TTS] Audio stream reader cancelled');
  }
  
  if (currentAudioStream) {
    currentAudioStream = null;
  }
  
  if (currentTabId) {
    debug.log('[TTS] Sending stop signal to content script');
    chrome.tabs.sendMessage(currentTabId, {
      action: 'stopPlayback'
    });
    currentTabId = null;
  }
}

// Load utilities
importScripts('utils/debug.js', 'utils/storage.js');