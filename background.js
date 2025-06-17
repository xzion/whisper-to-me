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
    
    // Check text length (OpenAI limit is 4096 characters)
    if (text.length > 4096) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        error: 'Selected text is too long. Maximum 4096 characters allowed.'
      });
      return;
    }

    // Get settings and API key
    const settings = await SecureStorage.getSettings();
    const apiKey = await SecureStorage.getApiKey();
    
    if (!apiKey) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        error: 'Please configure your OpenAI API key in the extension settings.'
      });
      return;
    }

    // Send message to content script to show overlay
    chrome.tabs.sendMessage(tab.id, {
      action: 'startTTS',
      text: text,
      settings: settings
    });

    // Start TTS process
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
let currentTabId = null;

// Test voice functionality
async function handleTestVoice(text, settings) {
  const apiKey = await SecureStorage.getApiKey();
  if (!apiKey) {
    return { error: 'No API key configured' };
  }

  try {
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
      const error = await response.json();
      return { error: error.error?.message || 'API request failed' };
    }

    // For test, we'll just validate the response
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

// Start text-to-speech with streaming
async function startTextToSpeech(text, settings, apiKey, tabId) {
  currentTabId = tabId;
  
  try {
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
      const error = await response.json();
      chrome.tabs.sendMessage(tabId, {
        action: 'ttsError',
        error: error.error?.message || 'API request failed'
      });
      return;
    }

    // Stream the audio data
    currentAudioStream = response.body;
    const reader = response.body.getReader();
    const chunks = [];

    // Read stream chunks
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      
      // Send chunk to content script for playback
      chrome.tabs.sendMessage(tabId, {
        action: 'audioChunk',
        chunk: Array.from(value), // Convert Uint8Array to regular array for messaging
        isLast: false
      });
    }

    // Signal completion
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
  if (currentAudioStream) {
    currentAudioStream.cancel();
    currentAudioStream = null;
  }
  
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, {
      action: 'stopPlayback'
    });
    currentTabId = null;
  }
}

// Load storage utility
importScripts('utils/storage.js');