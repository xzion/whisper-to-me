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
    const apiKey = await SecureStorage.getApiKey();
    const settings = await SecureStorage.getSettings();

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
    if (isPreviewPlaying) {
      // Stop preview
      chrome.runtime.sendMessage({ action: 'stopTTS' });
      elements.previewBtn.textContent = 'Preview Voice';
      isPreviewPlaying = false;
      return;
    }

    const apiKey = elements.apiKey.value.trim();
    if (!apiKey) {
      showToast('Please enter your API key first', 'error');
      return;
    }

    const settings = {
      voice: elements.voiceSelect.value,
      speed: parseFloat(elements.speedSlider.value),
      model: elements.modelSelect.value
    };

    elements.previewBtn.textContent = 'Stop Preview';
    elements.previewBtn.disabled = true;
    isPreviewPlaying = true;

    try {
      // Create audio element for preview
      const audio = new Audio();
      
      // Make API call directly from options page
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
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      // Create blob from response
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      
      audio.src = audioUrl;
      audio.playbackRate = 1.0; // Speed is already applied by API
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        elements.previewBtn.textContent = 'Preview Voice';
        isPreviewPlaying = false;
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        showToast('Error playing audio', 'error');
        elements.previewBtn.textContent = 'Preview Voice';
        isPreviewPlaying = false;
      };

      await audio.play();
      
    } catch (error) {
      showToast(error.message, 'error');
      elements.previewBtn.textContent = 'Preview Voice';
      isPreviewPlaying = false;
    } finally {
      elements.previewBtn.disabled = false;
    }
  });

  // Save settings
  elements.saveBtn.addEventListener('click', async () => {
    const apiKey = elements.apiKey.value.trim();
    
    if (!apiKey) {
      showToast('Please enter your API key', 'error');
      return;
    }

    // Validate API key format
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      showToast('Invalid API key format', 'error');
      return;
    }

    try {
      // Save API key
      await SecureStorage.saveApiKey(apiKey);

      // Save other settings
      await SecureStorage.saveSettings({
        voice: elements.voiceSelect.value,
        speed: parseFloat(elements.speedSlider.value),
        model: elements.modelSelect.value
      });

      showToast('Settings saved successfully!');
    } catch (error) {
      showToast('Error saving settings', 'error');
      console.error('Save error:', error);
    }
  });

  // Reset to defaults
  elements.resetBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to reset all settings to defaults? This will not clear your API key.')) {
      elements.voiceSelect.value = 'alloy';
      elements.speedSlider.value = '1';
      elements.speedValue.textContent = '1.0x';
      elements.modelSelect.value = 'tts-1';
      elements.previewText.value = 'Welcome to Whisper to Me. This extension uses OpenAI\'s advanced text-to-speech technology to read any selected text aloud with natural, expressive voices.';
      
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