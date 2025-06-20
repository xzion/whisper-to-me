# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## User commands
- When creating git commits, do not include the co-authored by Claude comment

## Project Overview

This is "Whisper To Me", a Chrome extension that uses OpenAI's TTS API to convert selected text to speech. Users can select text on any webpage, right-click, and choose "Whisper to me" to hear it read aloud with natural-sounding voices.

## Key Architecture Components

### Chrome Extension Structure
- **manifest.json**: Chrome extension manifest (v3) with OpenAI API permissions
- **popup.html/popup.js**: Quick settings popup for voice, speed, and model selection
- **options.html/options.js**: Full settings page with API key configuration and voice preview
- **content.js**: Content script for text selection handling and audio overlay
- **background.js**: Service worker for OpenAI API calls and audio streaming
- **overlay.css**: Styles for the TTS player overlay
- **utils/storage.js**: Secure storage utility for API key and settings
- **icons/**: Extension icons (16x16, 48x48, 128x128)

### Core Functionality
1. Context menu integration for selected text ("Whisper to me")
2. OpenAI TTS API integration with streaming support
3. Secure API key storage with basic encryption
4. Real-time audio playback with play/pause/stop controls
5. Voice selection (9 voices: alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer)
6. Speed control (0.5x to 2x in 0.1 increments)
7. Model selection (tts-1 for speed, tts-1-hd for quality)

## OpenAI API Integration

### API Endpoint
```
POST https://api.openai.com/v1/audio/speech
```

### Request Format
```json
{
  "model": "tts-1",
  "input": "text to convert",
  "voice": "alloy",
  "speed": 1.0,
  "response_format": "mp3"
}
```

### Limitations
- Maximum text length: 4,096 characters
- Rate limit: 50 requests per minute (paid accounts)
- Pricing: $0.015/1K chars (tts-1), $0.030/1K chars (tts-1-hd)

## Development Commands

Since this is a Chrome extension, there are no build commands. Development workflow:
1. Load unpacked extension in Chrome: chrome://extensions/ → Developer mode → Load unpacked
2. Reload extension after changes: Click refresh button in chrome://extensions/
3. Debug popup: Right-click extension icon → Inspect popup
4. Debug content script: Use Chrome DevTools on the web page
5. Debug background script: Click "service worker" link in chrome://extensions/

## Chrome APIs Used
- chrome.contextMenus: For right-click menu integration
- chrome.storage.sync: For secure settings storage
- chrome.tabs: For tab communication
- chrome.runtime: For message passing between components
- chrome.scripting: For content script injection

## Audio Streaming Implementation
- Background script handles OpenAI API streaming response
- Chunks are sent to content script via messaging
- Content script uses Web Audio API for playback
- Audio chunks are queued and decoded for smooth playback

## Testing Approach
Manual testing through Chrome extension developer mode:
1. API key validation and storage
2. Context menu functionality on various websites
3. Audio streaming and playback quality
4. Cross-origin content handling
5. Voice preview in options page
6. Overlay controls (play/pause/stop)
7. Error handling for API failures