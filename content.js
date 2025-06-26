// Content script for handling text selection and overlay

// Overlay element reference
let overlayElement = null;
let audioElement = null;
let audioQueue = [];
let isPlaying = false;
let isPaused = false;
let updateTimeInterval = null;
let isStreamingComplete = false;
let currentPlaybackSpeed = 1.0; // Current playback speed

// Create overlay immediately when script loads for testing
createOverlay();

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
        <div class="tts-overlay-controls">
          <button class="tts-control-btn tts-rewind" aria-label="Rewind 5s">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          <button class="tts-control-btn tts-play-pause" aria-label="Play/Pause">
            <svg class="tts-icon-play" viewBox="0 0 24 24" width="24" height="24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg class="tts-icon-pause" viewBox="0 0 24 24" width="24" height="24" style="display:none;">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>
          <div class="tts-speed-controls">
            <button class="tts-control-btn tts-speed-down" aria-label="Decrease speed">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M19 13H5v-2h14v2z"/>
              </svg>
            </button>
            <span class="tts-speed-display">1.0x</span>
            <button class="tts-control-btn tts-speed-up" aria-label="Increase speed">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="tts-overlay-time">
          <div class="tts-time-display">
            <span class="tts-time-text">0s of ...</span>
          </div>
          <button class="tts-download-btn" aria-label="Download audio">Download</button>
        </div>
      </div>
      <div class="tts-overlay-status">Preparing audio...</div>
      <audio class="tts-hidden-audio" preload="auto" style="display: none;"></audio>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Get reference to audio element
  audioElement = overlayElement.querySelector('.tts-hidden-audio');
  
  // Configure audio element for pitch-preserving speed control
  if (audioElement) {
    audioElement.preservesPitch = true;
    audioElement.playbackRate = currentPlaybackSpeed;
  }

  // Add event listeners
  const closeBtn = overlayElement.querySelector('.tts-overlay-close');
  const playPauseBtn = overlayElement.querySelector('.tts-play-pause');
  const rewindBtn = overlayElement.querySelector('.tts-rewind');
  const downloadBtn = overlayElement.querySelector('.tts-download-btn');
  const speedUpBtn = overlayElement.querySelector('.tts-speed-up');
  const speedDownBtn = overlayElement.querySelector('.tts-speed-down');

  closeBtn.addEventListener('click', hideOverlay);
  playPauseBtn.addEventListener('click', togglePlayPause);
  rewindBtn.addEventListener('click', rewindAudio);
  downloadBtn.addEventListener('click', downloadAudio);
  speedUpBtn.addEventListener('click', increaseSpeed);
  speedDownBtn.addEventListener('click', decreaseSpeed);
}

// Show overlay with text
async function showOverlay(text) {
  console.log('[TTS-Content] Showing overlay for text length:', text.length);
  
  // Clear any previous audio state completely
  stopPlayback();
  
  // Load user's preferred playback speed
  const settings = await SecureStorage.getSettings();
  currentPlaybackSpeed = settings.playbackSpeed || 1.0;
  
  // Ensure all state is properly reset for new session
  audioQueue = [];
  isPlaying = false;
  isPaused = false;
  isStreamingComplete = false;
  
  // Reset audio element
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    if (audioElement.src) {
      URL.revokeObjectURL(audioElement.src);
      audioElement.src = '';
    }
  }
  
  // Reset UI state for new session
  updatePlayPauseButton(false);
  updateRewindButton(false); // Start disabled since we'll be streaming
  updateDownloadButton(false); // Start disabled until streaming is complete
  stopTimeUpdates();
  
  createOverlay();
  overlayElement.classList.add('visible');
  
  // Update speed display with user's preference
  updateSpeedDisplay();
  
  updateStatus('Preparing audio...');
  updateTimeDisplay(); // Reset time display to "0s of ..."
}

// Hide overlay
function hideOverlay() {
  console.log('[TTS-Content] Hiding overlay');
  if (overlayElement) {
    overlayElement.classList.remove('visible');
    stopPlayback();
  }
}

// Update status text
function updateStatus(status) {
  console.log('[TTS-Content] Status update:', status);
  if (overlayElement) {
    const statusElement = overlayElement.querySelector('.tts-overlay-status');
    statusElement.textContent = status;
  }
}

// Format time in seconds to readable format
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  
  if (mins > 0) {
    return `${mins}m${secs.toString().padStart(2, '0')}s`;
  } else {
    return `${secs}s`;
  }
}

// Update time display
function updateTimeDisplay() {
  if (!overlayElement) return;
  
  const timeText = overlayElement.querySelector('.tts-time-text');
  if (!timeText) return;
  
  // Use audio element if available
  if (audioElement && audioElement.src) {
    const currentTime = audioElement.currentTime || 0;
    const duration = audioElement.duration || 0;
    
    if (duration > 0) {
      timeText.textContent = `${formatTime(currentTime)} of ${formatTime(duration)}`;
    } else {
      timeText.textContent = `${formatTime(currentTime)} of ...`;
    }
  } else {
    // No audio loaded yet, show initial state
    timeText.textContent = '0s of ...';
  }
}

// Start time update interval
function startTimeUpdates() {
  if (updateTimeInterval) {
    clearInterval(updateTimeInterval);
  }
  updateTimeInterval = setInterval(updateTimeDisplay, 100); // Update every 100ms
}

// Stop time update interval
function stopTimeUpdates() {
  if (updateTimeInterval) {
    clearInterval(updateTimeInterval);
    updateTimeInterval = null;
  }
}

// Toggle play/pause
function togglePlayPause() {
  console.log('[TTS-Content] Toggle play/pause, current state - playing:', isPlaying, 'paused:', isPaused);
  
  if (audioElement && audioElement.src) {
    if (audioElement.paused) {
      console.log('[TTS-Content] Playing audio element');
      audioElement.play();
      isPlaying = true;
      isPaused = false;
      updatePlayPauseButton(true);
      updateStatus('Playing...');
      startTimeUpdates();
    } else {
      console.log('[TTS-Content] Pausing audio element');
      audioElement.pause();
      isPlaying = false;
      isPaused = true;
      updatePlayPauseButton(false);
      updateStatus('Paused');
      stopTimeUpdates();
    }
  } else if (!isPlaying && audioQueue.length > 0) {
    // Playback completed but we have audio chunks - replay from beginning
    console.log('[TTS-Content] Replaying audio from beginning');
    startPlayback();
  }
}

// Rewind audio by 5 seconds
function rewindAudio() {
  console.log('[TTS-Content] Rewind button clicked');
  
  if (audioElement && audioElement.src) {
    console.log('[TTS-Content] Rewinding audio element by 5 seconds');
    const newTime = Math.max(0, audioElement.currentTime - 5);
    audioElement.currentTime = newTime;
    console.log('[TTS-Content] Audio element rewound to', newTime.toFixed(2), 'seconds');
    updateTimeDisplay();
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

// Update rewind button enabled/disabled state
function updateRewindButton(enabled) {
  if (!overlayElement) return;
  
  const rewindBtn = overlayElement.querySelector('.tts-rewind');
  if (rewindBtn) {
    rewindBtn.disabled = !enabled;
    rewindBtn.style.opacity = enabled ? '1' : '0.5';
    rewindBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
}

// Update download button enabled/disabled state
function updateDownloadButton(enabled) {
  if (!overlayElement) return;
  
  const downloadBtn = overlayElement.querySelector('.tts-download-btn');
  if (downloadBtn) {
    downloadBtn.disabled = !enabled;
    downloadBtn.style.opacity = enabled ? '1' : '0.5';
    downloadBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
}

// Increase playback speed
function increaseSpeed() {
  console.log('[TTS-Content] Increase speed button clicked');
  
  // Increment by 0.25x, max 2.0x
  const newSpeed = Math.min(2.0, currentPlaybackSpeed + 0.25);
  if (newSpeed !== currentPlaybackSpeed) {
    currentPlaybackSpeed = newSpeed;
    updateSpeedDisplay();
    applySpeedChange();
    
    // Save the new speed preference
    SecureStorage.saveSettings({ playbackSpeed: currentPlaybackSpeed });
  }
}

// Decrease playback speed
function decreaseSpeed() {
  console.log('[TTS-Content] Decrease speed button clicked');
  
  // Decrement by 0.25x, min 0.5x
  const newSpeed = Math.max(0.5, currentPlaybackSpeed - 0.25);
  if (newSpeed !== currentPlaybackSpeed) {
    currentPlaybackSpeed = newSpeed;
    updateSpeedDisplay();
    applySpeedChange();
    
    // Save the new speed preference
    SecureStorage.saveSettings({ playbackSpeed: currentPlaybackSpeed });
  }
}

// Update speed display
function updateSpeedDisplay() {
  if (!overlayElement) return;
  
  const speedDisplay = overlayElement.querySelector('.tts-speed-display');
  if (speedDisplay) {
    speedDisplay.textContent = `${currentPlaybackSpeed.toFixed(1)}x`;
  }
}

// Apply speed change to audio processing
function applySpeedChange() {
  console.log('[TTS-Content] Applying speed change to:', currentPlaybackSpeed);
  
  // Update HTML audio element playback rate
  if (audioElement && audioElement.src) {
    try {
      console.log('[TTS-Content] Updating audio element playbackRate in real-time');
      audioElement.playbackRate = currentPlaybackSpeed;
      console.log('[TTS-Content] Real-time speed change applied successfully');
    } catch (error) {
      console.warn('[TTS-Content] Audio element playbackRate update failed:', error);
    }
  }
}

// Download audio as MP3 file
async function downloadAudio() {
  console.log('[TTS-Content] Download button clicked');
  
  if (!isStreamingComplete || audioQueue.length === 0) {
    console.log('[TTS-Content] Cannot download - streaming not complete or no audio data');
    return;
  }
  
  try {
    console.log('[TTS-Content] Creating MP3 blob from audio chunks');
    
    const blob = createAudioBlob();
    console.log('[TTS-Content] Created blob with size:', blob.size, 'bytes');
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
    a.download = `whisper-tts-${timestamp}.mp3`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up blob URL
    URL.revokeObjectURL(url);
    
    console.log('[TTS-Content] Audio download initiated:', a.download);
    updateStatus('Audio saved successfully!');
    
    // Reset status after 2 seconds
    setTimeout(() => {
      if (isPlaying) {
        updateStatus('Playing...');
      } else if (isPaused) {
        updateStatus('Paused');
      } else {
        updateStatus('Playback complete');
      }
    }, 2000);
    
  } catch (error) {
    console.error('[TTS-Content] Download error:', error);
    updateStatus('Error downloading audio');
    setTimeout(() => {
      if (isPlaying) {
        updateStatus('Playing...');
      } else if (isPaused) {
        updateStatus('Paused');
      } else {
        updateStatus('Playback complete');
      }
    }, 3000);
  }
}

// Stop playback
function stopPlayback() {
  console.log('[TTS-Content] Stopping playback');
  
  // Stop HTML audio element
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
    if (audioElement.src) {
      URL.revokeObjectURL(audioElement.src);
      audioElement.src = '';
    }
  }
  
  stopTimeUpdates();
  audioQueue = [];
  isPlaying = false;
  isPaused = false;
  isStreamingComplete = false;
  updatePlayPauseButton(false);
  updateRewindButton(true);
  updateDownloadButton(false);
  
  // Notify background script
  console.log('[TTS-Content] Notifying background script to stop TTS');
  chrome.runtime.sendMessage({ action: 'stopTTS' });
}


// Create MP3 blob from audio chunks
function createAudioBlob() {
  const totalLength = audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of audioQueue) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  return new Blob([combinedBuffer], { type: 'audio/mpeg' });
}

// Set up audio element for playback
function setupAudioForPlayback() {
  console.log('[TTS-Content] Setting up audio element for playback');
  
  if (!audioElement) {
    throw new Error('Audio element not available');
  }
  
  if (audioQueue.length === 0) {
    throw new Error('No audio chunks available');
  }
  
  const blob = createAudioBlob();
  const url = URL.createObjectURL(blob);
  
  console.log('[TTS-Content] Created audio blob with size:', blob.size, 'bytes');
  
  // Set audio source and configure
  audioElement.src = url;
  audioElement.playbackRate = currentPlaybackSpeed;
  audioElement.preservesPitch = true;
  
  console.log('[TTS-Content] Audio element configured - playbackRate:', currentPlaybackSpeed, 'preservesPitch: true');
}


// Process audio chunks
async function processAudioChunk(chunk, isLast) {
  console.log('[TTS-Content] Processing audio chunk, size:', chunk.length, 'isLast:', isLast);

  if (chunk.length > 0) {
    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(chunk);
    audioQueue.push(uint8Array);
    console.log('[TTS-Content] Added chunk to queue, total chunks:', audioQueue.length);
  }

  // When streaming is complete, start playback
  if (isLast) {
    isStreamingComplete = true;
    console.log('[TTS-Content] Last chunk received, total chunks:', audioQueue.length);
    
    // Enable download button now that streaming is complete
    updateDownloadButton(true);
    
    // Start playback with all chunks
    startPlayback();
  }
}




// Start playback using HTML audio element
async function startPlayback() {
  console.log('[TTS-Content] Starting playback with', audioQueue.length, 'chunks');
  if (audioQueue.length === 0) {
    console.log('[TTS-Content] No audio chunks to play');
    return;
  }

  try {
    // Set up audio element and start playback
    setupAudioForPlayback();
    audioElement.play();
    
    isPlaying = true;
    isPaused = false;
    updatePlayPauseButton(true);
    updateRewindButton(true);
    updateStatus('Playing...');
    startTimeUpdates();
    
    console.log('[TTS-Content] Audio playback started');
    
    // Handle playback end
    audioElement.onended = () => {
      console.log('[TTS-Content] Audio playback ended');
      stopTimeUpdates();
      isPlaying = false;
      updatePlayPauseButton(false);
      updateStatus('Playback complete');
      updateTimeDisplay();
    };
    
  } catch (error) {
    console.error('[TTS-Content] Audio playback error:', error);
    updateStatus('Error playing audio');
  }
}

// Show error message
function showError(error) {
  console.log('[TTS-Content] Showing error:', error);
  if (!overlayElement) {
    alert(error);
    return;
  }
  
  updateStatus(`Error: ${error}`);
  setTimeout(hideOverlay, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[TTS-Content] Received message:', request.action);
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