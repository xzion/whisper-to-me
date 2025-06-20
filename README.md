# Whisper To Me

A Chrome extension that converts selected text to natural-sounding speech using OpenAI's Text-to-Speech API. Simply select text on any webpage, right-click, and choose "Whisper to me" to hear it read aloud.

## Features

- **Context Menu Integration**: Right-click selected text to instantly convert to speech
- **9 Natural Voices**: Choose from alloy, ash, coral, echo, fable, nova, onyx, sage, and shimmer
- **Adjustable Speed**: Control playback speed from 0.5x to 2x in 0.1 increments
- **Two Quality Models**: 
  - `tts-1` for faster generation
  - `tts-1-hd` for higher quality audio
- **Audio Controls**: Play, pause, stop, and download functionality
- **Secure API Key Storage**: Your OpenAI API key is enc1rypted and stored locally
- **Streaming Playback**: Audio begins playing while still generating for faster response

## Installation

### Prerequisites
- Chrome browser
- OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))

### Install the Extension

1. **Download or Clone**
   ```bash
   git clone https://github.com/yourusername/whisper-to-me.git
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `whisper-to-me` folder

3. **Configure API Key**
   - Click the extension icon in Chrome toolbar
   - Click "Options" or right-click the icon and select "Options"
   - Enter your OpenAI API key
   - Test with voice preview and save settings

## Usage

### Basic Usage
1. **Select Text**: Highlight any text on a webpage
2. **Right-Click**: Choose "Whisper to me" from context menu
3. **Listen**: Audio player overlay appears and begins playback

### Audio Controls
- **Play/Pause**: Click the play button in the overlay
- **Stop**: Click stop to end playback
- **Download**: Save the generated audio as an MP3 file

### Settings
Access settings by:
- Clicking the extension icon → "Options"
- Right-clicking the extension icon → "Options"

Configure:
- **Voice**: Choose from 9 available voices
- **Speed**: Adjust playback speed (0.5x - 2x)
- **Model**: Select quality vs speed preference
- **API Key**: Update your OpenAI API key

### Voice Preview
Test different voices in the options page before selecting text on websites.

## Supported Text Length
- Maximum: 4,096 characters per request
- Longer text will be truncated automatically

## Pricing
OpenAI TTS API pricing (as of 2024):
- **tts-1**: $0.015 per 1,000 characters
- **tts-1-hd**: $0.030 per 1,000 characters

## Privacy & Security
- API key is encrypted and stored locally in Chrome
- No text or audio data is stored by the extension
- All processing happens through OpenAI's secure API

## Troubleshooting

### Common Issues

**Extension not working**
- Ensure you're in Developer mode at `chrome://extensions/`
- Click refresh button next to the extension

**No audio playback**
- Check your OpenAI API key is valid
- Verify you have API credits available
- Try a shorter text selection

**Context menu not appearing**
- Make sure text is selected before right-clicking
- Refresh the webpage and try again

### Debug Information
- **Popup issues**: Right-click extension icon → "Inspect popup"
- **Content issues**: Use Chrome DevTools (F12) on the webpage
- **Background issues**: Go to `chrome://extensions/` and click "service worker"

## Development

### File Structure
```
whisper-to-me/
├── manifest.json          # Extension manifest
├── popup.html/js          # Quick settings popup
├── options.html/js        # Full settings page
├── content.js            # Text selection handling
├── background.js         # OpenAI API integration
├── overlay.css           # Audio player styles
├── utils/storage.js      # Secure storage utility
└── icons/               # Extension icons
```

### Local Development
1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click refresh button for the extension
4. Test changes on any webpage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in Chrome
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Verify your OpenAI API key and credits