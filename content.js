// Content script for handling text selection and overlay

// Overlay element reference
let overlayElement = null;

// Create overlay immediately when script loads for testing
createOverlay();
let audioContext = null;
let audioSource = null;
let audioQueue = [];
let isPlaying = false;
let isPaused = false;
let currentAudioBuffer = null;
let playbackStartTime = 0;
let pausedAt = 0;
let totalDuration = 0;
let updateTimeInterval = null;

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
        </div>
        <div class="tts-overlay-time">
          <span class="tts-time-display">0s of 0s</span>
        </div>
      </div>
      <div class="tts-overlay-status">Preparing audio...</div>
    </div>
  `;

  document.body.appendChild(overlayElement);

  // Add event listeners
  const closeBtn = overlayElement.querySelector('.tts-overlay-close');
  const playPauseBtn = overlayElement.querySelector('.tts-play-pause');
  const rewindBtn = overlayElement.querySelector('.tts-rewind');

  closeBtn.addEventListener('click', hideOverlay);
  playPauseBtn.addEventListener('click', togglePlayPause);
  rewindBtn.addEventListener('click', rewindAudio);
}

// Show overlay with text
function showOverlay(text) {
  console.log('[TTS-Content] Showing overlay for text length:', text.length);
  
  // Clear any previous audio state
  stopPlayback();
  audioQueue = [];
  
  createOverlay();
  overlayElement.classList.add('visible');
  
  updateStatus('Preparing audio...');
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
  if (!overlayElement || !currentAudioBuffer) return;
  
  let currentTime = 0;
  if (isPlaying && !isPaused) {
    currentTime = audioContext.currentTime - playbackStartTime;
  } else if (isPaused) {
    currentTime = pausedAt;
  } else if (!isPlaying && !isPaused) {
    // When playback is complete, show full duration
    currentTime = totalDuration;
  }
  
  // Ensure current time doesn't exceed total duration
  currentTime = Math.min(currentTime, totalDuration);
  
  const timeDisplay = overlayElement.querySelector('.tts-time-display');
  if (timeDisplay) {
    timeDisplay.textContent = `${formatTime(currentTime)} of ${formatTime(totalDuration)}`;
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
  
  if (isPlaying && !isPaused) {
    // Currently playing - pause it
    console.log('[TTS-Content] Pausing audio');
    pausedAt = audioContext.currentTime - playbackStartTime;
    audioContext.suspend();
    isPaused = true;
    updatePlayPauseButton(false);
    updateStatus('Paused');
    stopTimeUpdates();
  } else if (isPaused) {
    // Currently paused - resume it
    console.log('[TTS-Content] Resuming audio');
    audioContext.resume();
    playbackStartTime = audioContext.currentTime - pausedAt;
    isPaused = false;
    updatePlayPauseButton(true);
    updateStatus('Playing...');
    startTimeUpdates();
  } else if (!isPlaying && audioQueue.length > 0) {
    // Playback completed but we have audio chunks - replay from beginning
    console.log('[TTS-Content] Replaying audio from beginning');
    startPlayback();
  }
}

// Rewind audio by 5 seconds
function rewindAudio() {
  console.log('[TTS-Content] Rewind button clicked');
  
  if (!currentAudioBuffer) {
    console.log('[TTS-Content] No audio buffer available for rewind');
    return;
  }

  // Remember if we were paused before rewinding
  const wasPaused = isPaused;
  const wasPlaybackComplete = !isPlaying && !isPaused;

  // Calculate current playback position
  let currentTime = 0;
  if (isPlaying && !isPaused) {
    currentTime = audioContext.currentTime - playbackStartTime;
  } else if (isPaused) {
    currentTime = pausedAt;
  } else if (wasPlaybackComplete) {
    // If playback is complete, start from 5 seconds before the end
    currentTime = totalDuration;
  }
  
  // Rewind by 5 seconds, but don't go below 0
  let newTime;
  if (wasPlaybackComplete) {
    // When playback is complete, set to 5 seconds from end (but not past beginning)
    newTime = Math.max(0, totalDuration - 5);
    console.log('[TTS-Content] Playback was complete, setting position to 5s from end:', newTime.toFixed(2), 'seconds');
  } else {
    newTime = Math.max(0, currentTime - 5);
    console.log('[TTS-Content] Rewinding from', currentTime.toFixed(2), 'to', newTime.toFixed(2), 'seconds');
  }
  
  // Stop current playback
  if (audioSource) {
    audioSource.onended = null; // Remove the ended handler to prevent state change
    audioSource.stop();
    audioSource = null;
  }
  
  // Create new audio context if needed
  if (!audioContext || audioContext.state === 'closed') {
    initAudioContext();
  }
  
  // Start playback from new position
  audioSource = audioContext.createBufferSource();
  audioSource.buffer = currentAudioBuffer;
  audioSource.connect(audioContext.destination);
  audioSource.start(0, newTime);
  
  // Update timing variables
  playbackStartTime = audioContext.currentTime - newTime;
  
  if (wasPaused || wasPlaybackComplete) {
    // If we were paused or playback was complete, set to paused state
    pausedAt = newTime;
    audioContext.suspend();
    isPlaying = true;
    isPaused = true;
    updatePlayPauseButton(false);
    updateStatus('Paused');
    updateTimeDisplay();
    if (wasPlaybackComplete) {
      console.log('[TTS-Content] Rewind from completed playback, now paused at', newTime.toFixed(2), 'seconds');
    } else {
      console.log('[TTS-Content] Rewind completed, staying paused at', newTime.toFixed(2), 'seconds');
    }
  } else {
    // If we were playing, continue playing
    pausedAt = 0;
    isPlaying = true;
    isPaused = false;
    updatePlayPauseButton(true);
    updateStatus('Playing...');
    startTimeUpdates();
    console.log('[TTS-Content] Rewind completed, continuing playback');
  }
  
  // Handle playback end
  audioSource.onended = () => {
    console.log('[TTS-Content] Audio playback ended');
    isPlaying = false;
    updatePlayPauseButton(false);
    updateStatus('Playback complete');
  };
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
  console.log('[TTS-Content] Stopping playback');
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
    console.log('[TTS-Content] Audio source stopped');
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
    console.log('[TTS-Content] Audio context closed');
  }
  
  stopTimeUpdates();
  audioQueue = [];
  currentAudioBuffer = null;
  isPlaying = false;
  isPaused = false;
  playbackStartTime = 0;
  pausedAt = 0;
  totalDuration = 0;
  updatePlayPauseButton(false);
  
  // Notify background script
  console.log('[TTS-Content] Notifying background script to stop TTS');
  chrome.runtime.sendMessage({ action: 'stopTTS' });
}

// Initialize audio context
function initAudioContext() {
  console.log('[TTS-Content] Initializing audio context');
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  console.log('[TTS-Content] Audio context created, state:', audioContext.state);
}

// Process audio chunks
async function processAudioChunk(chunk, isLast) {
  console.log('[TTS-Content] Processing audio chunk, size:', chunk.length, 'isLast:', isLast);
  if (!audioContext) {
    initAudioContext();
  }

  if (chunk.length > 0) {
    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(chunk);
    audioQueue.push(uint8Array);
    console.log('[TTS-Content] Added chunk to queue, total chunks:', audioQueue.length);
  }

  // Only start playback when we have received the last chunk
  if (isLast) {
    if (!isPlaying) {
      console.log('[TTS-Content] Starting playback with', audioQueue.length, 'chunks buffered');
      startPlayback();
    }
  }

  if (isLast) {
    console.log('[TTS-Content] Last chunk received, total chunks:', audioQueue.length);
  }
}

// Start audio playback
async function startPlayback() {
  console.log('[TTS-Content] Starting audio playback with', audioQueue.length, 'chunks');
  if (audioQueue.length === 0) {
    console.log('[TTS-Content] No audio chunks to play');
    return;
  }

  // Create new audio context if needed (for replay scenarios)
  if (!audioContext || audioContext.state === 'closed') {
    initAudioContext();
  }

  isPlaying = true;
  isPaused = false;
  pausedAt = 0;
  updatePlayPauseButton(true);
  updateStatus('Playing...');

  // Combine all chunks into a single buffer
  const totalLength = audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log('[TTS-Content] Combining', audioQueue.length, 'chunks into buffer of', totalLength, 'bytes');
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of audioQueue) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  console.log('[TTS-Content] Audio buffer combined successfully');

  // Decode audio data
  try {
    console.log('[TTS-Content] Decoding audio data');
    const arrayBuffer = combinedBuffer.buffer;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('[TTS-Content] Audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
    
    // Store audio buffer and duration for rewind and time display
    currentAudioBuffer = audioBuffer;
    totalDuration = audioBuffer.duration;
    
    // Create and play audio source
    console.log('[TTS-Content] Creating audio source and starting playback');
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start();
    playbackStartTime = audioContext.currentTime;
    startTimeUpdates();
    console.log('[TTS-Content] Audio playback started');
    
    // Handle playback end
    audioSource.onended = () => {
      console.log('[TTS-Content] Audio playback ended');
      stopTimeUpdates();
      isPlaying = false;
      updatePlayPauseButton(false);
      updateStatus('Playback complete');
      updateTimeDisplay(); // Final time update
    };
    
  } catch (error) {
    console.error('[TTS-Content] Audio decode error:', error);
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