// Background service worker for handling API calls and context menu

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'whisperToMe',
    title: 'Whisper to me',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'whisperToMe' && info.selectionText) {
    const text = info.selectionText.trim();
    console.log('[TTS] Context menu clicked, text length:', text.length);
    
    // Check text length (OpenAI limit is 4096 characters)
    if (text.length > 4096) {
      console.log('[TTS] Text too long:', text.length, 'characters');
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        error: 'Selected text is too long. Maximum 4096 characters allowed.'
      });
      return;
    }

    // Get settings and API key
    console.log('[TTS] Retrieving settings and API key');
    const settings = await SecureStorage.getSettings();
    const apiKey = await SecureStorage.getApiKey();
    console.log('[TTS] Settings retrieved:', { voice: settings.voice, speed: settings.speed, model: settings.model });
    
    if (!apiKey) {
      console.log('[TTS] No API key configured');
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        error: 'Please configure your OpenAI API key in the extension settings.'
      });
      return;
    }

    // Send message to content script to show overlay
    console.log('[TTS] Sending startTTS message to content script');
    chrome.tabs.sendMessage(tab.id, {
      action: 'startTTS',
      text: text,
      settings: settings
    });

    // Start TTS process
    console.log('[TTS] Starting TTS process');
    startTextToSpeech(text, settings, apiKey, tab.id);
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

// Test voice functionality
async function handleTestVoice(text, settings) {
  console.log('[TTS] Testing voice with settings:', settings);
  const apiKey = await SecureStorage.getApiKey();
  if (!apiKey) {
    console.log('[TTS] No API key for voice test');
    return { error: 'No API key configured' };
  }

  try {
    console.log('[TTS] Making test API request to OpenAI');
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.model || 'tts-1',
        input: text,
        voice: settings.voice || 'alloy',
        speed: settings.speed || 1.0
      })
    });

    if (!response.ok) {
      console.log('[TTS] Test API request failed with status:', response.status);
      const error = await response.json();
      return { error: error.error?.message || 'API request failed' };
    }

    // For test, we'll just validate the response
    console.log('[TTS] Voice test successful');
    return { success: true };
  } catch (error) {
    console.log('[TTS] Voice test error:', error);
    return { error: error.message };
  }
}

// Start text-to-speech with streaming
async function startTextToSpeech(text, settings, apiKey, tabId) {
  console.log('[TTS] Starting TTS API request for', text.length, 'characters');
  currentTabId = tabId;
  
  try {
    console.log('[TTS] Making API request to OpenAI with settings:', {
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
        model: settings.model || 'tts-1',
        input: text,
        voice: settings.voice || 'alloy',
        speed: settings.speed || 1.0,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      console.log('[TTS] API request failed with status:', response.status);
      const error = await response.json();
      console.log('[TTS] API error details:', error);
      chrome.tabs.sendMessage(tabId, {
        action: 'ttsError',
        error: error.error?.message || 'API request failed'
      });
      return;
    }

    // Stream the audio data
    console.log('[TTS] API request successful, starting audio stream');
    currentAudioStream = response.body;
    currentReader = response.body.getReader();
    const chunks = [];
    let chunkCount = 0;

    // Read stream chunks
    while (true) {
      const { done, value } = await currentReader.read();
      
      if (done) {
        console.log('[TTS] Stream reading complete, received', chunkCount, 'chunks');
        break;
      }
      
      chunkCount++;
      chunks.push(value);
      console.log('[TTS] Received chunk', chunkCount, 'size:', value.length, 'bytes');
      
      // Send chunk to content script for playback
      chrome.tabs.sendMessage(tabId, {
        action: 'audioChunk',
        chunk: Array.from(value), // Convert Uint8Array to regular array for messaging
        isLast: false
      });
    }

    // Signal completion
    console.log('[TTS] Sending completion signal to content script');
    chrome.tabs.sendMessage(tabId, {
      action: 'audioChunk',
      chunk: [],
      isLast: true
    });

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
  console.log('[TTS] Stopping current TTS');
  if (currentReader) {
    currentReader.cancel();
    currentReader = null;
    console.log('[TTS] Audio stream reader cancelled');
  }
  
  if (currentAudioStream) {
    currentAudioStream = null;
  }
  
  if (currentTabId) {
    console.log('[TTS] Sending stop signal to content script');
    chrome.tabs.sendMessage(currentTabId, {
      action: 'stopPlayback'
    });
    currentTabId = null;
  }
}

// Load storage utility
importScripts('utils/storage.js');