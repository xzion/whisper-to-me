// Popup script for quick settings

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    apiStatus: document.getElementById('api-status'),
    statusIndicator: document.querySelector('.status-indicator'),
    statusText: document.querySelector('.status-text'),
    voiceSelect: document.getElementById('voice-select'),
    speedSlider: document.getElementById('speed-slider'),
    speedValue: document.getElementById('speed-value'),
    modelSelect: document.getElementById('model-select'),
    playbackSpeedSlider: document.getElementById('playback-speed-slider'),
    playbackSpeedValue: document.getElementById('playback-speed-value'),
    optionsBtn: document.getElementById('options-btn')
  };

  // Load current settings
  async function loadSettings() {
    console.log('[TTS-Popup] Loading settings');
    const settings = await SecureStorage.getSettings();
    console.log('[TTS-Popup] Settings loaded:', settings);
    elements.voiceSelect.value = settings.voice;
    elements.speedSlider.value = settings.speed;
    elements.speedValue.textContent = `${settings.speed}x`;
    elements.modelSelect.value = settings.model;
    elements.playbackSpeedSlider.value = settings.playbackSpeed;
    elements.playbackSpeedValue.textContent = `${settings.playbackSpeed}x`;
  }

  // Check API key status
  async function checkApiStatus() {
    console.log('[TTS-Popup] Checking API key status');
    const hasKey = await SecureStorage.hasApiKey();
    console.log('[TTS-Popup] API key exists:', hasKey);
    
    if (hasKey) {
      elements.statusIndicator.className = 'status-indicator active';
      elements.statusText.textContent = 'API key configured';
    } else {
      elements.statusIndicator.className = 'status-indicator error';
      elements.statusText.textContent = 'No API key - Click Full Settings';
    }
  }

  // Save settings when changed
  elements.voiceSelect.addEventListener('change', async () => {
    console.log('[TTS-Popup] Voice changed to:', elements.voiceSelect.value);
    await SecureStorage.saveSettings({ voice: elements.voiceSelect.value });
  });

  elements.speedSlider.addEventListener('input', async () => {
    const speed = parseFloat(elements.speedSlider.value);
    console.log('[TTS-Popup] Speed changed to:', speed);
    elements.speedValue.textContent = `${speed}x`;
    await SecureStorage.saveSettings({ speed });
  });

  elements.modelSelect.addEventListener('change', async () => {
    console.log('[TTS-Popup] Model changed to:', elements.modelSelect.value);
    await SecureStorage.saveSettings({ model: elements.modelSelect.value });
  });

  elements.playbackSpeedSlider.addEventListener('input', async () => {
    const playbackSpeed = parseFloat(elements.playbackSpeedSlider.value);
    console.log('[TTS-Popup] Playback speed changed to:', playbackSpeed);
    elements.playbackSpeedValue.textContent = `${playbackSpeed}x`;
    await SecureStorage.saveSettings({ playbackSpeed });
  });

  // Open options page
  elements.optionsBtn.addEventListener('click', () => {
    console.log('[TTS-Popup] Opening options page');
    chrome.runtime.openOptionsPage();
  });

  // Initialize
  await loadSettings();
  await checkApiStatus();

  // Listen for storage changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    console.log('[TTS-Popup] Storage changed:', changes, 'area:', area);
    if (area === 'sync' && changes.openai_api_key) {
      console.log('[TTS-Popup] API key changed, rechecking status');
      await checkApiStatus();
    }
  });
});