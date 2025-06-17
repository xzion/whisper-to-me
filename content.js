// Content script for handling text selection and overlay

// Overlay element reference
let overlayElement = null;
let audioContext = null;
let audioSource = null;
let audioQueue = [];
let isPlaying = false;
let isPaused = false;

// Create and inject overlay HTML
function createOverlay() {
  if (overlayElement) return;

  overlayElement = document.createElement('div');
  overlayElement.id = 'whisper-tts-overlay';
  overlayElement.innerHTML = `
    <div class="tts-overlay-container">
      <div class="tts-overlay-header">
        <span class="tts-overlay-title">Whisper to Me</span>
        <button class="tts-overlay-close" aria-label="Close">✕</button>
      </div>
      <div class="tts-overlay-content">
        <div class="tts-overlay-text"></div>
        <div class="tts-overlay-controls">
          <button class="tts-control-btn tts-play-pause" aria-label="Play/Pause">
            <svg class="tts-icon-play" viewBox="0 0 24 24" width="24" height="24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg class="tts-icon-pause" viewBox="0 0 24 24" width="24" height="24" style="display:none;">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>
          <button class="tts-control-btn tts-stop" aria-label="Stop">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M6 6h12v12H6z"/>
            </svg>
          </button>
        </div>
        <div class="tts-overlay-progress">
          <div class="tts-progress-bar"></div>
        </div>
      </div>
      <div class="tts-overlay-status">Preparing audio...</div>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Add event listeners
  const closeBtn = overlayElement.querySelector('.tts-overlay-close');
  const playPauseBtn = overlayElement.querySelector('.tts-play-pause');
  const stopBtn = overlayElement.querySelector('.tts-stop');

  closeBtn.addEventListener('click', hideOverlay);wsl
  playPauseBtn.addEventListener('click', togglePlayPause);
  stopBtn.addEventListener('click', stopPlayback);
}

// Show overlay with text
function showOverlay(text) {
  createOverlay();
  overlayElement.classList.add('visible');
  
  const textElement = overlayElement.querySelector('.tts-overlay-text');
  textElement.textContent = text.length > 100 ? text.substring(0, 100) + '...' : text;
  
  updateStatus('Preparing audio...');
}

// Hide overlay
function hideOverlay() {
  if (overlayElement) {
    overlayElement.classList.remove('visible');
    stopPlayback();
  }
}

// Update status text
function updateStatus(status) {
  if (overlayElement) {
    const statusElement = overlayElement.querySelector('.tts-overlay-status');
    statusElement.textContent = status;
  }
}

// Toggle play/pause
function togglePlayPause() {
  if (!audioContext) return;

  if (isPlaying && !isPaused) {
    audioContext.suspend();
    isPaused = true;
    updatePlayPauseButton(false);
    updateStatus('Paused');
  } else if (isPaused) {
    audioContext.resume();
    isPaused = false;
    updatePlayPauseButton(true);
    updateStatus('Playing...');
  }
}

// Update play/pause button
function updatePlayPauseButton(playing) {
  if (!overlayElement) return;
  
  const playIcon = overlayElement.querySelector('.tts-icon-play');
  const pauseIcon = overlayElement.querySelector('.tts-icon-pause');
  
  if (playing) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  } else {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
}

// Stop playback
function stopPlayback() {
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  audioQueue = [];
  isPlaying = false;
  isPaused = false;
  updatePlayPauseButton(false);
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'stopTTS' });
}

// Initialize audio context
function initAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Process audio chunks
async function processAudioChunk(chunk, isLast) {
  if (!audioContext) {
    initAudioContext();
  }

  if (chunk.length > 0) {
    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(chunk);
    audioQueue.push(uint8Array);
  }

  if (isLast || audioQueue.length > 3) { // Start playing after buffering a few chunks
    if (!isPlaying) {
      startPlayback();
    }
  }

  if (isLast) {
    updateStatus('Playback complete');
  }
}

// Start audio playback
async function startPlayback() {
  if (audioQueue.length === 0) return;

  isPlaying = true;
  updatePlayPauseButton(true);
  updateStatus('Playing...');

  // Combine all chunks into a single buffer
  const totalLength = audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of audioQueue) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode audio data
  try {
    const arrayBuffer = combinedBuffer.buffer;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Create and play audio source
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start();
    
    // Handle playback end
    audioSource.onended = () => {
      isPlaying = false;
      updatePlayPauseButton(false);
      updateStatus('Playback complete');
    };
    
  } catch (error) {
    console.error('Audio decode error:', error);
    updateStatus('Error playing audio');
  }
}

// Show error message
function showError(error) {
  if (!overlayElement) {
    alert(error);
    return;
  }
  
  updateStatus(`Error: ${error}`);
  setTimeout(hideOverlay, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startTTS':
      showOverlay(request.text);
      break;
      
    case 'audioChunk':
      processAudioChunk(request.chunk, request.isLast);
      break;
      
    case 'ttsError':
      showError(request.error);
      break;
      
    case 'stopPlayback':
      stopPlayback();
      break;
      
    case 'showError':
      showError(request.error);
      break;
  }
});