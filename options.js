// Options page script

let isPreviewPlaying = false;

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    apiKey: document.getElementById('api-key'),
    toggleVisibility: document.getElementById('toggle-visibility'),
    voiceSelect: document.getElementById('voice-select'),
    speedSlider: document.getElementById('speed-slider'),
    speedValue: document.getElementById('speed-value'),
    modelSelect: document.getElementById('model-select'),
    previewText: document.getElementById('preview-text'),
    previewBtn: document.getElementById('preview-voice'),
    saveBtn: document.getElementById('save-btn'),
    resetBtn: document.getElementById('reset-btn'),
    toast: document.getElementById('toast')
  };

  // Load current settings
  async function loadSettings() {
    console.log('[TTS-Options] Loading settings');
    const apiKey = await SecureStorage.getApiKey();
    const settings = await SecureStorage.getSettings();
    console.log('[TTS-Options] Settings loaded:', { hasApiKey: !!apiKey, settings });

    if (apiKey) {
      elements.apiKey.value = apiKey;
    }

    elements.voiceSelect.value = settings.voice;
    elements.speedSlider.value = settings.speed;
    elements.speedValue.textContent = `${settings.speed}x`;
    elements.modelSelect.value = settings.model;
  }

  // Show toast message
  function showToast(message, type = 'success') {
    console.log('[TTS-Options] Showing toast:', message, 'type:', type);
    elements.toast.innerHTML = `
      <span class="toast-message">${message}</span>
      ${type === 'error' ? '<button class="toast-dismiss">✕</button>' : ''}
    `;
    elements.toast.className = `toast ${type} show`;
    
    // Add dismiss button functionality for errors
    if (type === 'error') {
      const dismissBtn = elements.toast.querySelector('.toast-dismiss');
      dismissBtn.addEventListener('click', () => {
        elements.toast.classList.remove('show');
      });
    } else {
      // Auto-hide success messages after 3 seconds
      setTimeout(() => {
        elements.toast.classList.remove('show');
      }, 3000);
    }
  }

  // Toggle API key visibility
  elements.toggleVisibility.addEventListener('click', () => {
    const type = elements.apiKey.type === 'password' ? 'text' : 'password';
    console.log('[TTS-Options] Toggling API key visibility to:', type);
    elements.apiKey.type = type;
    elements.toggleVisibility.textContent = type === 'password' ? '👁️' : '🙈';
  });

  // Update speed value display
  elements.speedSlider.addEventListener('input', () => {
    const speed = parseFloat(elements.speedSlider.value);
    elements.speedValue.textContent = `${speed}x`;
  });

  // Preview voice
  elements.previewBtn.addEventListener('click', async () => {
    console.log('[TTS-Options] Preview button clicked, currently playing:', isPreviewPlaying);
    if (isPreviewPlaying) {
      // Stop preview
      console.log('[TTS-Options] Stopping preview');
      chrome.runtime.sendMessage({ action: 'stopTTS' });
      elements.previewBtn.textContent = 'Preview Voice';
      isPreviewPlaying = false;
      return;
    }

    const apiKey = elements.apiKey.value.trim();
    console.log('[TTS-Options] API key present:', !!apiKey);
    if (!apiKey) {
      showToast('Please enter your API key first', 'error');
      return;
    }

    const settings = {
      voice: elements.voiceSelect.value,
      speed: parseFloat(elements.speedSlider.value),
      model: elements.modelSelect.value
    };
    console.log('[TTS-Options] Starting preview with settings:', settings);

    elements.previewBtn.textContent = 'Stop Preview';
    elements.previewBtn.disabled = true;
    isPreviewPlaying = true;

    try {
      // Create audio element for preview
      const audio = new Audio();
      
      // Make API call directly from options page
      console.log('[TTS-Options] Making API request for preview');
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.model,
          input: elements.previewText.value,
          voice: settings.voice,
          speed: settings.speed
        })
      });

      if (!response.ok) {
        console.log('[TTS-Options] Preview API request failed with status:', response.status);
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      // Create blob from response
      console.log('[TTS-Options] Preview API request successful, creating audio');
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      
      audio.src = audioUrl;
      audio.playbackRate = 1.0; // Speed is already applied by API
      
      audio.onended = () => {
        console.log('[TTS-Options] Preview playback ended');
        URL.revokeObjectURL(audioUrl);
        elements.previewBtn.textContent = 'Preview Voice';
        isPreviewPlaying = false;
      };

      audio.onerror = () => {
        console.log('[TTS-Options] Preview audio error');
        URL.revokeObjectURL(audioUrl);
        showToast('Error playing audio', 'error');
        elements.previewBtn.textContent = 'Preview Voice';
        isPreviewPlaying = false;
      };

      console.log('[TTS-Options] Starting preview audio playback');
      await audio.play();
      
    } catch (error) {
      console.log('[TTS-Options] Preview error:', error);
      showToast(error.message, 'error');
      elements.previewBtn.textContent = 'Preview Voice';
      isPreviewPlaying = false;
    } finally {
      elements.previewBtn.disabled = false;
    }
  });

  // Save settings
  elements.saveBtn.addEventListener('click', async () => {
    console.log('[TTS-Options] Save button clicked');
    const apiKey = elements.apiKey.value.trim();
    
    if (!apiKey) {
      showToast('Please enter your API key', 'error');
      return;
    }

    // Validate API key format
    console.log('[TTS-Options] Validating API key format');
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      console.log('[TTS-Options] Invalid API key format');
      showToast('Invalid API key format', 'error');
      return;
    }

    try {
      console.log('[TTS-Options] Saving API key and settings');
      // Save API key
      await SecureStorage.saveApiKey(apiKey);

      // Save other settings
      const settings = {
        voice: elements.voiceSelect.value,
        speed: parseFloat(elements.speedSlider.value),
        model: elements.modelSelect.value
      };
      console.log('[TTS-Options] Saving settings:', settings);
      await SecureStorage.saveSettings(settings);

      showToast('Settings saved successfully!');
    } catch (error) {
      console.log('[TTS-Options] Save error:', error);
      showToast('Error saving settings', 'error');
      console.error('Save error:', error);
    }
  });

  // Reset to defaults
  elements.resetBtn.addEventListener('click', async () => {
    console.log('[TTS-Options] Reset button clicked');
    if (confirm('Are you sure you want to reset all settings to defaults? This will not clear your API key.')) {
      elements.voiceSelect.value = 'alloy';
      elements.speedSlider.value = '1';
      elements.speedValue.textContent = '1.0x';
      elements.modelSelect.value = 'tts-1';
      elements.previewText.value = 'Welcome to Whisper to Me. This extension uses OpenAI\'s advanced text-to-speech technology to read any selected text aloud with natural, expressive voices.';
      
      console.log('[TTS-Options] Resetting settings to defaults');
      await SecureStorage.saveSettings({
        voice: 'alloy',
        speed: 1.0,
        model: 'tts-1'
      });

      showToast('Settings reset to defaults');
    }
  });

  // Initialize
  await loadSettings();
});