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
    optionsBtn: document.getElementById('options-btn')
  };

  // Load current settings
  async function loadSettings() {
    const settings = await SecureStorage.getSettings();
    elements.voiceSelect.value = settings.voice;
    elements.speedSlider.value = settings.speed;
    elements.speedValue.textContent = `${settings.speed}x`;
    elements.modelSelect.value = settings.model;
  }

  // Check API key status
  async function checkApiStatus() {
    const hasKey = await SecureStorage.hasApiKey();
    
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
    await SecureStorage.saveSettings({ voice: elements.voiceSelect.value });
  });

  elements.speedSlider.addEventListener('input', async () => {
    const speed = parseFloat(elements.speedSlider.value);
    elements.speedValue.textContent = `${speed}x`;
    await SecureStorage.saveSettings({ speed });
  });

  elements.modelSelect.addEventListener('change', async () => {
    await SecureStorage.saveSettings({ model: elements.modelSelect.value });
  });

  // Open options page
  elements.optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Initialize
  await loadSettings();
  await checkApiStatus();

  // Listen for storage changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync' && changes.openai_api_key) {
      await checkApiStatus();
    }
  });
});