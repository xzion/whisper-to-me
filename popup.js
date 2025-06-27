// Popup script for quick settings

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    apiStatus: document.getElementById('api-status'),
    statusIndicator: document.querySelector('.status-indicator'),
    statusText: document.querySelector('.status-text'),
    voiceSelect: document.getElementById('voice-select'),
    modelSelect: document.getElementById('model-select'),
    instructionsGroup: document.getElementById('instructions-group'),
    instructionsText: document.getElementById('instructions-text'),
    optionsBtn: document.getElementById('options-btn')
  };

  // Load current settings
  async function loadSettings() {
    debug.log('[TTS-Popup] Loading settings');
    const settings = await SecureStorage.getSettings();
    debug.log('[TTS-Popup] Settings loaded:', settings);
    elements.voiceSelect.value = settings.voice;
    elements.modelSelect.value = settings.model;
    elements.instructionsText.value = settings.instructions;
    
    // Update UI based on model selection
    updateModelUI();
  }

  // Update UI based on selected model
  function updateModelUI() {
    const selectedModel = elements.modelSelect.value;
    const isGptModel = selectedModel === 'gpt-4o-mini-tts';
    
    debug.log('[TTS-Popup] Updating UI for model:', selectedModel);
    
    // Show/hide instructions field
    elements.instructionsGroup.style.display = isGptModel ? 'block' : 'none';
    
    // Filter voices based on model
    filterVoiceOptions(isGptModel);
  }

  // Filter voice options based on model
  function filterVoiceOptions(isGptModel) {
    const voiceOptions = elements.voiceSelect.querySelectorAll('option');
    const currentValue = elements.voiceSelect.value;
    
    voiceOptions.forEach(option => {
      const voiceValue = option.value;
      const isGptOnlyVoice = voiceValue === 'ballad' || voiceValue === 'verse';
      
      if (isGptOnlyVoice && !isGptModel) {
        // Hide GPT-only voices for non-GPT models
        option.style.display = 'none';
        option.disabled = true;
      } else {
        // Show all voices for GPT model, or non-GPT voices for other models
        option.style.display = 'block';
        option.disabled = false;
      }
    });
    
    // Reset to default voice if current selection is not available for the model
    if (!isGptModel && (currentValue === 'ballad' || currentValue === 'verse')) {
      elements.voiceSelect.value = 'alloy';
      debug.log('[TTS-Popup] Reset voice to alloy due to model change');
      // Save the reset voice
      SecureStorage.saveSettings({ voice: 'alloy' });
    }
  }

  // Check API key status
  async function checkApiStatus() {
    debug.log('[TTS-Popup] Checking API key status');
    const hasKey = await SecureStorage.hasApiKey();
    debug.log('[TTS-Popup] API key exists:', hasKey);
    
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
    debug.log('[TTS-Popup] Voice changed to:', elements.voiceSelect.value);
    await SecureStorage.saveSettings({ voice: elements.voiceSelect.value });
  });


  elements.modelSelect.addEventListener('change', async () => {
    debug.log('[TTS-Popup] Model changed to:', elements.modelSelect.value);
    await SecureStorage.saveSettings({ model: elements.modelSelect.value });
    updateModelUI();
  });

  elements.instructionsText.addEventListener('input', async () => {
    const instructions = elements.instructionsText.value.trim();
    debug.log('[TTS-Popup] Instructions changed to:', instructions);
    await SecureStorage.saveSettings({ instructions });
  });


  // Open options page
  elements.optionsBtn.addEventListener('click', () => {
    debug.log('[TTS-Popup] Opening options page');
    chrome.runtime.openOptionsPage();
  });

  // Initialize
  await loadSettings();
  await checkApiStatus();

  // Listen for storage changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    debug.log('[TTS-Popup] Storage changed:', changes, 'area:', area);
    if (area === 'sync' && changes.openai_api_key) {
      debug.log('[TTS-Popup] API key changed, rechecking status');
      await checkApiStatus();
    }
  });
});