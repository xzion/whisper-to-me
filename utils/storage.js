// Storage utility for secure settings management

const STORAGE_KEYS = {
  API_KEY: 'openai_api_key',
  VOICE: 'voice_preference',
  SPEED: 'speed_preference',
  MODEL: 'model_preference'
};

const DEFAULT_SETTINGS = {
  voice: 'alloy',
  speed: 1.0,
  model: 'tts-1'
};

class SecureStorage {
  // Encrypt API key before storing (basic obfuscation)
  static async encryptApiKey(apiKey) {
    // In a real app, use a more secure encryption method
    // This is basic obfuscation to prevent casual inspection
    return btoa(apiKey).split('').reverse().join('');
  }

  // Decrypt API key after retrieval
  static async decryptApiKey(encrypted) {
    if (!encrypted) return null;
    try {
      return atob(encrypted.split('').reverse().join(''));
    } catch (e) {
      console.error('Failed to decrypt API key:', e);
      return null;
    }
  }

  // Save API key securely
  static async saveApiKey(apiKey) {
    const encrypted = await this.encryptApiKey(apiKey);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [STORAGE_KEYS.API_KEY]: encrypted }, resolve);
    });
  }

  // Get API key
  static async getApiKey() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(STORAGE_KEYS.API_KEY, async (result) => {
        const decrypted = await this.decryptApiKey(result[STORAGE_KEYS.API_KEY]);
        resolve(decrypted);
      });
    });
  }

  // Save all settings
  static async saveSettings(settings) {
    const dataToSave = {};
    
    if (settings.voice !== undefined) {
      dataToSave[STORAGE_KEYS.VOICE] = settings.voice;
    }
    if (settings.speed !== undefined) {
      dataToSave[STORAGE_KEYS.SPEED] = settings.speed;
    }
    if (settings.model !== undefined) {
      dataToSave[STORAGE_KEYS.MODEL] = settings.model;
    }

    return new Promise((resolve) => {
      chrome.storage.sync.set(dataToSave, resolve);
    });
  }

  // Get all settings
  static async getSettings() {
    return new Promise((resolve) => {
      const keys = [STORAGE_KEYS.VOICE, STORAGE_KEYS.SPEED, STORAGE_KEYS.MODEL];
      chrome.storage.sync.get(keys, (result) => {
        resolve({
          voice: result[STORAGE_KEYS.VOICE] || DEFAULT_SETTINGS.voice,
          speed: result[STORAGE_KEYS.SPEED] || DEFAULT_SETTINGS.speed,
          model: result[STORAGE_KEYS.MODEL] || DEFAULT_SETTINGS.model
        });
      });
    });
  }

  // Clear all stored data
  static async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.clear(resolve);
    });
  }

  // Check if API key exists
  static async hasApiKey() {
    const apiKey = await this.getApiKey();
    return !!apiKey;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecureStorage;
}