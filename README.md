# Whisper To Me

A Chrome extension that converts selected text to natural-sounding speech using OpenAI's Text-to-Speech API. Simply select text on any webpage, right-click, and choose "Whisper to me" to hear it read aloud with progressive streaming for immediate playback.

## Features

- **Context Menu Integration**: Right-click selected text to instantly convert to speech
- **11 Natural Voices**: Choose from alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer, plus exclusive GPT voices (ballad, verse)
- **Three Quality Models**: 
  - `tts-1` for faster generation
  - `tts-1-hd` for higher quality audio
  - `gpt-4o-mini-tts` for best quality with advanced voice customization
- **Voice Instructions**: Customize voice characteristics with natural language instructions (GPT-4o Mini TTS only)
- **Progressive Audio Streaming**: Audio begins playing immediately while still generating using MediaSource API
- **Advanced Playback Controls**: 
  - Variable speed control (0.2x to 3.0x with pitch preservation)
  - Rewind 5 seconds functionality
  - Play, pause, stop controls
  - Real-time speed adjustment during playback
- **Audio Download**: Save generated audio as MP3 files with timestamps
- **Secure API Key Storage**: Your OpenAI API key is encrypted and stored locally
- **Smart UI**: Interface adapts based on selected model and capabilities

## Installation

### Prerequisites
- Chrome browser
- OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))

### Install the Extension

1. **Download or Clone**
   ```bash
   git clone https://github.com/xzion/whisper-to-me.git
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `whisper-to-me` folder

3. **Configure API Key**
   - Click the extension icon in Chrome toolbar
   - Click "Full Settings" or right-click the icon and select "Options"
   - Enter your OpenAI API key
   - Test with voice preview and save settings

## Usage

### Basic Usage
1. **Select Text**: Highlight any text on a webpage
2. **Right-Click**: Choose "Whisper to me" from context menu
3. **Listen**: Audio player overlay appears and begins progressive playback

### Audio Controls
The overlay provides comprehensive playback controls:
- **Play/Pause**: Click the play button in the overlay
- **Speed Control**: Use +/- buttons to adjust speed (0.2x - 3.0x)
- **Rewind**: Click to go back 5 seconds
- **Stop**: Click stop to end playback
- **Download**: Save the generated audio as an MP3 file (available after streaming completes)
- **Time Display**: Shows current position and total duration

### Settings

#### Quick Settings (Popup)
Click the extension icon for quick access to:
- **Voice Selection**: Choose from available voices
- **Model Selection**: Switch between TTS models
- **Voice Instructions**: Add custom instructions (GPT-4o Mini TTS only)

#### Full Settings (Options Page)
Access comprehensive settings by:
- Clicking "Full Settings" in popup
- Right-clicking the extension icon → "Options"

Configure:
- **Voice**: Choose from 11 available voices (voice availability adapts to selected model)
- **Model**: Select between speed, quality, and advanced customization
- **Voice Instructions**: Detailed voice characteristic customization
- **API Key**: Update your OpenAI API key with validation
- **Voice Preview**: Test different voices and settings before use

### Advanced Features

#### Voice Instructions (GPT-4o Mini TTS)
When using the GPT-4o Mini TTS model, you can provide natural language instructions to customize voice characteristics:
- Example: "Speak with enthusiasm and excitement"
- Example: "Use a calm, soothing tone"
- Example: "Sound professional and authoritative"

#### Progressive Streaming
- Audio begins playing immediately as it's generated
- Uses MediaSource API for optimal performance
- Real-time buffering with status indicators
- Fallback to traditional playback if MediaSource unavailable

#### Pitch-Preserving Speed Control
- Adjust playback speed without affecting voice pitch
- Real-time speed changes during playback
- Wide range from 0.2x (very slow) to 3.0x (very fast)
- Uses modern HTML5 audio APIs for high-quality speed adjustment

## Supported Text Length
- Maximum: 4,096 characters per request
- Longer text will be truncated automatically with user notification

## Pricing
OpenAI TTS API pricing (updated 2024):
- **tts-1**: $0.015 per 1,000 characters
- **tts-1-hd**: $0.030 per 1,000 characters
- **gpt-4o-mini-tts**: $0.60 per 1M input tokens + $12.00 per 1M output tokens (approx. $0.030 per minute of audio)

## Privacy & Security
- API key is encrypted and stored locally in Chrome
- No text or audio data is stored by the extension
- All processing happens through OpenAI's secure API
- Settings sync across devices using Chrome's secure storage

## Technical Features

### Progressive Audio Streaming
- **MediaSource API**: Real-time audio streaming for immediate playback
- **Buffer Management**: Sophisticated buffering system with configurable thresholds
- **Chunk Processing**: Memory-efficient streaming with progressive loading
- **Fallback Support**: Automatic fallback to blob-based playback if needed

### Smart UI Adaptation
- **Model-Based Voice Filtering**: Only shows compatible voices for selected model
- **Conditional Features**: Instructions field appears only for GPT models
- **Real-Time Updates**: Settings sync immediately across popup and options pages
- **Visual Feedback**: Status indicators, progress displays, and user notifications

## Troubleshooting

### Common Issues

**Extension not working**
- Ensure you're in Developer mode at `chrome://extensions/`
- Click refresh button next to the extension

**No audio playback**
- Check your OpenAI API key is valid
- Verify you have API credits available
- Try a shorter text selection
- Check browser audio permissions

**Audio streaming issues**
- Ensure stable internet connection
- Try refreshing the page and selecting text again
- Check browser console for MediaSource API support

**Context menu not appearing**
- Make sure text is selected before right-clicking
- Refresh the webpage and try again
- Verify extension is enabled and loaded

### Debug Information
- **Popup issues**: Right-click extension icon → "Inspect popup"
- **Content issues**: Use Chrome DevTools (F12) on the webpage
- **Background issues**: Go to `chrome://extensions/` and click "service worker"
- **Audio issues**: Check browser console for MediaSource or audio-related errors

## Development

### File Structure
```
whisper-to-me/
├── manifest.json          # Extension manifest
├── popup.html/js          # Quick settings popup
├── options.html/js        # Full settings page
├── content.js             # Text selection and audio streaming
├── background.js          # OpenAI API integration
├── overlay.css            # Audio player overlay styles
├── utils/storage.js       # Secure storage utility
└── icons/                 # Extension icons
```

### Architecture

#### Audio Streaming Pipeline
1. **Text Selection**: Content script captures selected text
2. **API Request**: Background script calls OpenAI with conditional parameters
3. **Progressive Streaming**: Chunks streamed to content script via messaging
4. **MediaSource Processing**: BufferManager handles real-time audio buffering
5. **Playback Control**: Advanced overlay provides comprehensive audio controls

#### Model-Specific Features
- **Parameter Conditioning**: API requests include appropriate parameters based on model
- **Voice Filtering**: UI dynamically shows/hides voices based on model capabilities
- **Instructions Processing**: Natural language instructions sent only to GPT models

### Local Development
1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click refresh button for the extension
4. Test changes on any webpage
5. Use browser DevTools for debugging streaming and audio issues

### Key APIs Used
- **Chrome Extensions**: Context menus, storage, tabs, runtime messaging
- **MediaSource API**: Progressive audio streaming
- **HTML5 Audio**: Pitch-preserving playback speed control
- **OpenAI TTS API**: Text-to-speech generation with streaming

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in Chrome (especially audio streaming features)
5. Submit a pull request

### Testing Guidelines
- Test across different models (tts-1, tts-1-hd, gpt-4o-mini-tts)
- Verify voice filtering works correctly
- Test progressive streaming on various network conditions
- Validate instruction parameter functionality
- Check speed control accuracy and pitch preservation

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- Open an issue on GitHub
- Check the troubleshooting section above
- Verify your OpenAI API key and credits
- Test with different models and voice settings