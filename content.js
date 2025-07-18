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

// Drag functionality variables
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialX = 0;
let initialY = 0;

// Progressive buffering system
class BufferManager {
  constructor() {
    this.chunks = [];
    this.chunkCount = 0;
    this.appendedChunkCount = 0; // Track how many chunks have been appended to MediaSource
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.appendingChunk = false;
    this.minBufferThreshold = 5; // Minimum chunks before starting playback
    this.bufferReady = false;
    this.mediaSourceReady = false;
    this.setupInProgress = false;
  }

  reset() {
    this.chunks = [];
    this.chunkCount = 0;
    this.appendedChunkCount = 0;
    this.bufferReady = false;
    this.mediaSourceReady = false;
    this.appendingChunk = false;
    
    // Don't reset MediaSource if setup is in progress
    if (this.setupInProgress) {
      debug.log('[BufferManager] Skipping MediaSource reset - setup in progress');
      return;
    }
    
    if (this.sourceBuffer) {
      try {
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
          this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        }
      } catch (error) {
        debug.warn('[BufferManager] Error removing source buffer:', error);
      }
      this.sourceBuffer = null;
    }
    
    if (this.mediaSource) {
      try {
        if (this.mediaSource.readyState === 'open') {
          this.mediaSource.endOfStream();
        }
      } catch (error) {
        debug.warn('[BufferManager] Error ending stream:', error);
      }
    }
    this.mediaSource = null;
  }

  // Create MediaSource immediately and set up audio element
  setupMediaSource() {
    if (!window.MediaSource || !MediaSource.isTypeSupported('audio/mpeg')) {
      debug.log('[BufferManager] MediaSource not supported');
      return false;
    }

    this.setupInProgress = true;
    debug.log('[BufferManager] Creating MediaSource...');
    this.mediaSource = new MediaSource();
    const objectURL = URL.createObjectURL(this.mediaSource);
    debug.log('[BufferManager] MediaSource URL created:', objectURL);
    debug.log('[BufferManager] MediaSource readyState:', this.mediaSource.readyState);
    
    this.mediaSource.addEventListener('sourceopen', () => {
      debug.log('[BufferManager] MediaSource opened');
      try {
        // Check if MediaSource is still valid (not reset)
        if (!this.mediaSource || this.mediaSource.readyState !== 'open') {
          debug.warn('[BufferManager] MediaSource no longer valid during sourceopen');
          return;
        }
        
        // Check if SourceBuffer already exists to prevent multiple creation
        if (this.sourceBuffer) {
          debug.log('[BufferManager] SourceBuffer already exists, skipping creation');
          return;
        }
        
        this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/mpeg');
        this.sourceBuffer.addEventListener('updateend', () => {
          this.appendingChunk = false;
          
          // Check if streaming is complete and all chunks are appended - finalize before trying to append more
          if (isStreamingComplete && this.appendedChunkCount >= this.chunkCount && this.chunkCount > 0) {
            debug.log('[BufferManager] All chunks appended after streaming complete, calling finalize()');
            this.finalize();
            return; // Don't try to append more chunks after finalizing
          }
          
          this.appendNextPendingChunk(); // Try to append next chunk
        });
        this.sourceBuffer.addEventListener('error', (e) => {
          debug.error('[BufferManager] SourceBuffer error:', e);
          this.appendingChunk = false;
          this.appendNextPendingChunk(); // Try to append next chunk even after error
        });
        this.mediaSourceReady = true;
        this.setupInProgress = false; // Setup complete
        debug.log('[BufferManager] SourceBuffer ready for chunks');
      } catch (error) {
        debug.error('[BufferManager] Error setting up source buffer:', error);
        this.setupInProgress = false;
      }
    });

    this.mediaSource.addEventListener('sourceclose', () => {
      debug.log('[BufferManager] MediaSource closed');
      this.sourceBuffer = null;
      this.mediaSourceReady = false;
      this.setupInProgress = false;
    });

    this.mediaSource.addEventListener('error', (e) => {
      debug.error('[BufferManager] MediaSource error:', e);
      this.sourceBuffer = null;
      this.mediaSourceReady = false;
      this.setupInProgress = false;
    });

    // Set audio element source after a small delay to ensure DOM is ready
    setTimeout(() => {
      if (audioElement && this.mediaSource) {
        debug.log('[BufferManager] Setting audio element source...');
        debug.log('[BufferManager] Audio element state - paused:', audioElement.paused, 'readyState:', audioElement.readyState);
        audioElement.src = objectURL;
        audioElement.playbackRate = currentPlaybackSpeed;
        audioElement.preservesPitch = true;
        debug.log('[BufferManager] Audio element source set, MediaSource readyState:', this.mediaSource.readyState);
        debug.log('[BufferManager] Audio element playbackRate set to:', currentPlaybackSpeed);
        
        // Force load to trigger sourceopen
        audioElement.load();
        debug.log('[BufferManager] Audio element load() called');
      } else {
        debug.error('[BufferManager] Audio element or MediaSource not available!');
        this.setupInProgress = false;
      }
    }, 50);

    return true;
  }

  // Try to append next pending chunk to MediaSource
  appendNextPendingChunk() {
    if (!this.mediaSourceReady || !this.sourceBuffer || this.sourceBuffer.updating || this.appendingChunk) {
      return; // Can't append right now
    }
    
    // Check if there are pending chunks to append
    if (this.appendedChunkCount < this.chunks.length) {
      const chunkIndex = this.appendedChunkCount;
      const chunk = this.chunks[chunkIndex];
      
      try {
        this.appendingChunk = true;
        this.sourceBuffer.appendBuffer(chunk);
        this.appendedChunkCount++;
        debug.log('[BufferManager] Appended pending chunk', chunkIndex + 1, 'to MediaSource');
      } catch (error) {
        debug.error('[BufferManager] Error appending pending chunk:', error);
        this.appendingChunk = false;
      }
    }
  }

  // Add chunk and append to MediaSource immediately
  addChunk(chunk) {
    if (chunk.length === 0) return false;
    
    this.chunks.push(chunk);
    this.chunkCount++;
    
    debug.log('[BufferManager] Added chunk', this.chunkCount, ', size:', chunk.length);
    
    // Try to append this chunk to MediaSource if ready
    this.appendNextPendingChunk();
    
    // Check if we have enough buffer to start playback
    if (!this.bufferReady && this.chunkCount >= this.minBufferThreshold) {
      this.bufferReady = true;
      debug.log('[BufferManager] Buffer threshold reached, ready for playback');
      return true; // Signal that playback can start
    }
    
    return false;
  }

  finalize() {
    debug.log('[BufferManager] finalize() called - MediaSource readyState:', this.mediaSource?.readyState);
    debug.log('[BufferManager] finalize() - SourceBuffer updating:', this.sourceBuffer?.updating);
    debug.log('[BufferManager] finalize() - Chunks appended:', this.appendedChunkCount, '/', this.chunkCount);
    
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        if (!this.sourceBuffer || !this.sourceBuffer.updating) {
          debug.log('[BufferManager] Calling endOfStream() immediately');
          this.mediaSource.endOfStream();
          debug.log('[BufferManager] endOfStream() completed successfully');
        } else {
          debug.log('[BufferManager] SourceBuffer is updating, waiting for updateend event');
          this.sourceBuffer.addEventListener('updateend', () => {
            debug.log('[BufferManager] updateend event fired, now calling endOfStream()');
            if (this.mediaSource && this.mediaSource.readyState === 'open') {
              this.mediaSource.endOfStream();
              debug.log('[BufferManager] endOfStream() completed successfully after updateend');
            }
          }, { once: true });
        }
      } catch (error) {
        debug.log('[BufferManager] Error finalizing stream:', error);
      }
    } else {
      debug.log('[BufferManager] Cannot finalize - MediaSource not open, readyState:', this.mediaSource?.readyState);
    }
  }

  createFallbackBlob() {
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of this.chunks) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new Blob([combinedBuffer], { type: 'audio/mpeg' });
  }
}

let bufferManager = new BufferManager();

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
    debug.log('[TTS-Content] Audio element configured with playbackRate:', currentPlaybackSpeed);
  }

  // Add event listeners
  const closeBtn = overlayElement.querySelector('.tts-overlay-close');
  const playPauseBtn = overlayElement.querySelector('.tts-play-pause');
  const rewindBtn = overlayElement.querySelector('.tts-rewind');
  const downloadBtn = overlayElement.querySelector('.tts-download-btn');
  const speedUpBtn = overlayElement.querySelector('.tts-speed-up');
  const speedDownBtn = overlayElement.querySelector('.tts-speed-down');
  const header = overlayElement.querySelector('.tts-overlay-header');

  closeBtn.addEventListener('click', hideOverlay);
  playPauseBtn.addEventListener('click', togglePlayPause);
  rewindBtn.addEventListener('click', rewindAudio);
  downloadBtn.addEventListener('click', downloadAudio);
  speedUpBtn.addEventListener('click', increaseSpeed);
  speedDownBtn.addEventListener('click', decreaseSpeed);

  // Add drag functionality to header
  setupDragFunctionality(header);
}

// Show overlay with text
async function showOverlay(text) {
  debug.log('[TTS-Content] Showing overlay for text length:', text.length);
  
  // Clear any previous audio state completely
  stopPlayback();
  
  // Load user's preferred playback speed
  const settings = await SecureStorage.getSettings();
  currentPlaybackSpeed = settings.playbackSpeed || 1.0;
  
  // Ensure all state is properly reset for new session
  audioQueue = [];
  bufferManager.reset();
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
  
  // Setup MediaSource immediately for progressive streaming
  if (bufferManager.setupMediaSource()) {
    debug.log('[TTS-Content] MediaSource setup initiated');
    updateStatus('Preparing for audio streaming...');
  } else {
    debug.log('[TTS-Content] MediaSource not supported, will use fallback');
    updateStatus('Buffering audio...');
  }
  
  updateTimeDisplay(); // Reset time display to "0s of ..."
}

// Hide overlay
function hideOverlay() {
  debug.log('[TTS-Content] Hiding overlay');
  if (overlayElement) {
    overlayElement.classList.remove('visible');
    stopPlayback();
  }
}

// Setup drag functionality for header
function setupDragFunctionality(header) {
  header.addEventListener('mousedown', startDrag);
  
  function startDrag(e) {
    // Only allow dragging by clicking on the title or header background, not the close button
    if (e.target.classList.contains('tts-overlay-close')) {
      return;
    }
    
    isDragging = true;
    
    // Get current position of overlay
    const rect = overlayElement.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    
    // Store mouse position relative to overlay
    dragStartX = e.clientX - initialX;
    dragStartY = e.clientY - initialY;
    
    // Add visual feedback
    header.style.cursor = 'grabbing';
    overlayElement.style.userSelect = 'none';
    
    // Add event listeners for mouse move and up
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
    
    e.preventDefault();
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    // Calculate new position
    const newX = e.clientX - dragStartX;
    const newY = e.clientY - dragStartY;
    
    // Get viewport dimensions
    const maxX = window.innerWidth - overlayElement.offsetWidth;
    const maxY = window.innerHeight - overlayElement.offsetHeight;
    
    // Constrain to viewport
    const constrainedX = Math.max(0, Math.min(newX, maxX));
    const constrainedY = Math.max(0, Math.min(newY, maxY));
    
    // Update overlay position
    overlayElement.style.position = 'fixed';
    overlayElement.style.left = constrainedX + 'px';
    overlayElement.style.top = constrainedY + 'px';
    overlayElement.style.right = 'auto';
    overlayElement.style.transform = 'none';
    
    e.preventDefault();
  }
  
  function stopDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Remove visual feedback
    header.style.cursor = 'grab';
    overlayElement.style.userSelect = '';
    
    // Remove event listeners
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }
  
  // Set initial cursor style
  header.style.cursor = 'grab';
}

// Update status text
function updateStatus(status) {
  debug.log('[TTS-Content] Status update:', status);
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
    const rawCurrentTime = audioElement.currentTime || 0;
    const rawDuration = audioElement.duration || 0;
    
    // Calculate speed-adjusted times
    const adjustedCurrentTime = rawCurrentTime / currentPlaybackSpeed;
    const adjustedDuration = rawDuration / currentPlaybackSpeed;
    
    // Show "..." if duration is invalid or streaming is not complete
    if (rawDuration > 0 && isFinite(rawDuration) && isStreamingComplete) {
      timeText.textContent = `${formatTime(adjustedCurrentTime)} of ${formatTime(adjustedDuration)}`;
    } else {
      timeText.textContent = `${formatTime(adjustedCurrentTime)} of ...`;
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
async function togglePlayPause() {
  debug.log('[TTS-Content] Toggle play/pause, current state - playing:', isPlaying, 'paused:', isPaused);
  
  if (audioElement && audioElement.src) {
    if (audioElement.paused) {
      debug.log('[TTS-Content] Playing audio element');
      audioElement.play();
      isPlaying = true;
      isPaused = false;
      updatePlayPauseButton(true);
      // Only show "Playing..." if streaming is complete, otherwise keep showing "Buffering..."
      if (isStreamingComplete) {
        updateStatus('Playing...');
      } else {
        updateStatus('Buffering...');
      }
      startTimeUpdates();
    } else {
      debug.log('[TTS-Content] Pausing audio element');
      audioElement.pause();
      isPlaying = false;
      isPaused = true;
      updatePlayPauseButton(false);
      updateStatus('Paused');
      stopTimeUpdates();
    }
  } else if (!isPlaying && (audioQueue.length > 0 || bufferManager.chunks.length > 0)) {
    // Playback completed but we have audio chunks - replay from beginning
    debug.log('[TTS-Content] Replaying audio from beginning');
    if (bufferManager.bufferReady) {
      await startSimplePlayback();
    } else {
      startPlayback();
    }
  }
}

// Rewind audio by 5 seconds
function rewindAudio() {
  debug.log('[TTS-Content] Rewind button clicked');
  
  if (audioElement && audioElement.src) {
    debug.log('[TTS-Content] Rewinding audio element by 5 seconds');
    const newTime = Math.max(0, audioElement.currentTime - 5);
    audioElement.currentTime = newTime;
    debug.log('[TTS-Content] Audio element rewound to', newTime.toFixed(2), 'seconds');
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
  debug.log('[TTS-Content] Increase speed button clicked');
  
  // Increment by 0.1x, max 3.0x
  const newSpeed = Math.min(3.0, currentPlaybackSpeed + 0.1);
  if (newSpeed !== currentPlaybackSpeed) {
    currentPlaybackSpeed = newSpeed;
    updateSpeedDisplay();
    applySpeedChange();
    updateTimeDisplay(); // Update time display immediately
    
    // Save the new speed preference
    SecureStorage.saveSettings({ playbackSpeed: currentPlaybackSpeed });
  }
}

// Decrease playback speed
function decreaseSpeed() {
  debug.log('[TTS-Content] Decrease speed button clicked');
  
  // Decrement by 0.1x, min 0.2x
  const newSpeed = Math.max(0.2, currentPlaybackSpeed - 0.1);
  if (newSpeed !== currentPlaybackSpeed) {
    currentPlaybackSpeed = newSpeed;
    updateSpeedDisplay();
    applySpeedChange();
    updateTimeDisplay(); // Update time display immediately
    
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
  debug.log('[TTS-Content] Applying speed change to:', currentPlaybackSpeed);
  
  // Update HTML audio element playback rate
  if (audioElement && audioElement.src) {
    try {
      debug.log('[TTS-Content] Updating audio element playbackRate in real-time');
      audioElement.playbackRate = currentPlaybackSpeed;
      debug.log('[TTS-Content] Real-time speed change applied successfully');
    } catch (error) {
      debug.warn('[TTS-Content] Audio element playbackRate update failed:', error);
    }
  }
}

// Download audio as MP3 file
async function downloadAudio() {
  debug.log('[TTS-Content] Download button clicked');
  
  if (!isStreamingComplete || audioQueue.length === 0) {
    debug.log('[TTS-Content] Cannot download - streaming not complete or no audio data');
    return;
  }
  
  try {
    debug.log('[TTS-Content] Creating MP3 blob from audio chunks');
    
    const blob = createAudioBlob();
    debug.log('[TTS-Content] Created blob with size:', blob.size, 'bytes');
    
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
    
    debug.log('[TTS-Content] Audio download initiated:', a.download);
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
    debug.error('[TTS-Content] Download error:', error);
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
  debug.log('[TTS-Content] Stopping playback');
  
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
  bufferManager.reset();
  isPlaying = false;
  isPaused = false;
  isStreamingComplete = false;
  updatePlayPauseButton(false);
  updateRewindButton(true);
  updateDownloadButton(false);
  
  // Notify background script
  debug.log('[TTS-Content] Notifying background script to stop TTS');
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
  debug.log('[TTS-Content] Setting up audio element for playback');
  
  if (!audioElement) {
    throw new Error('Audio element not available');
  }
  
  if (audioQueue.length === 0) {
    throw new Error('No audio chunks available');
  }
  
  const blob = createAudioBlob();
  const url = URL.createObjectURL(blob);
  
  debug.log('[TTS-Content] Created audio blob with size:', blob.size, 'bytes');
  
  // Set audio source and configure
  audioElement.src = url;
  audioElement.playbackRate = currentPlaybackSpeed;
  audioElement.preservesPitch = true;
  
  debug.log('[TTS-Content] Audio element configured - playbackRate:', currentPlaybackSpeed, 'preservesPitch: true');
}


// Process audio chunks with progressive buffering
async function processAudioChunk(chunk, isLast) {
  debug.log('[TTS-Content] Processing audio chunk, size:', chunk.length, 'isLast:', isLast);

  if (chunk.length > 0) {
    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(chunk);
    audioQueue.push(uint8Array);
    
    // Add chunk to buffer manager (this will append to MediaSource automatically)
    const shouldStartPlayback = bufferManager.addChunk(uint8Array);
    
    debug.log('[TTS-Content] Added chunk to queue, total chunks:', audioQueue.length);
    
    // Start playback if buffer threshold reached and not already playing
    if (shouldStartPlayback && !isPlaying && !isPaused) {
      debug.log('[TTS-Content] Buffer threshold reached, starting playback');
      // Don't update status here - let the chunks keep showing "Buffering..." until complete
      await startSimplePlayback();
    }
    
    // Show buffering status while chunks are coming in, but respect paused state
    if (!isStreamingComplete && !isPaused) {
      updateStatus('Buffering...');
    }
  }

  // When streaming is complete
  if (isLast) {
    isStreamingComplete = true;
    debug.log('[TTS-Content] Last chunk received, total chunks:', audioQueue.length);
    
    // Enable download button now that streaming is complete
    updateDownloadButton(true);
    
    // Finalize MediaSource stream
    bufferManager.finalize();
    
    // If we haven't started playback yet (very small file), start now
    if (!isPlaying && !isPaused && audioQueue.length > 0) {
      debug.log('[TTS-Content] Small file, starting playback now');
      await startSimplePlayback();
    }
    
    // Update status now that streaming is complete
    if (isPlaying && !isPaused) {
      updateStatus('Playing...');
    } else if (isPaused) {
      updateStatus('Paused');
    } else if (audioQueue.length === 0) {
      updateStatus('No audio data received');
    } else {
      // Audio is ready but not playing yet
      updateStatus('Ready');
    }
  }
}




// Start simple playback - just trigger the audio element to play
async function startSimplePlayback() {
  debug.log('[TTS-Content] Starting simple playback');
  
  // If MediaSource is ready and audio element has source, use it
  if (bufferManager.mediaSourceReady && audioElement && audioElement.src) {
    debug.log('[TTS-Content] Using MediaSource for progressive playback');
    try {
      // Ensure correct playback rate is set before starting
      audioElement.playbackRate = currentPlaybackSpeed;
      audioElement.preservesPitch = true;
      debug.log('[TTS-Content] Set playback rate to', currentPlaybackSpeed, 'before starting');
      
      // Start playback
      await audioElement.play();
      
      isPlaying = true;
      isPaused = false;
      updatePlayPauseButton(true);
      updateRewindButton(true);
      // Don't update status to "Playing..." here if streaming is still in progress
      if (isStreamingComplete) {
        updateStatus('Playing...');
      }
      startTimeUpdates();
      
      debug.log('[TTS-Content] MediaSource audio playback started');
      
      // Handle playback end
      audioElement.onended = () => {
        debug.log('[TTS-Content] Audio playback ended');
        stopTimeUpdates();
        isPlaying = false;
        updatePlayPauseButton(false);
        updateStatus('Playback complete');
        updateTimeDisplay();
      };
      
      return; // Success, exit early
    } catch (error) {
      debug.error('[TTS-Content] Error starting MediaSource playback:', error);
    }
  }

  // If MediaSource not ready or failed, wait a bit and try again, or fall back to blob
  if (!bufferManager.mediaSourceReady) {
    debug.log('[TTS-Content] MediaSource not ready yet, waiting...');
    updateStatus('Preparing playback...');
    
    // Wait up to 2 seconds for MediaSource to be ready
    let attempts = 0;
    const checkReady = async () => {
      attempts++;
      if (bufferManager.mediaSourceReady && audioElement && audioElement.src) {
        debug.log('[TTS-Content] MediaSource now ready, starting playback');
        await startSimplePlayback(); // Retry
        return;
      }
      
      if (attempts < 20) { // 20 attempts * 100ms = 2 seconds max
        setTimeout(checkReady, 100);
      } else {
        debug.log('[TTS-Content] MediaSource timeout, using fallback blob method');
        await startFallbackPlayback();
      }
    };
    
    setTimeout(checkReady, 100);
    return;
  }

  // Fallback to blob method
  debug.log('[TTS-Content] Using fallback blob method');
  await startFallbackPlayback();
}

// Fallback playback method using traditional blob
async function startFallbackPlayback() {
  debug.log('[TTS-Content] Starting fallback playback');
  
  try {
    if (audioElement.src) {
      URL.revokeObjectURL(audioElement.src);
    }
    
    const blob = bufferManager.createFallbackBlob();
    const url = URL.createObjectURL(blob);
    audioElement.src = url;
    audioElement.playbackRate = currentPlaybackSpeed;
    audioElement.preservesPitch = true;
    
    await audioElement.play();
    
    isPlaying = true;
    isPaused = false;
    updatePlayPauseButton(true);
    updateRewindButton(true);
    // Don't update status to "Playing..." here if streaming is still in progress
    if (isStreamingComplete) {
      updateStatus('Playing...');
    }
    startTimeUpdates();
    
    debug.log('[TTS-Content] Fallback audio playback started');
    
  } catch (error) {
    debug.error('[TTS-Content] Fallback playback error:', error);
    updateStatus('Error playing audio');
  }
}

// Start playback using HTML audio element (legacy method)
async function startPlayback() {
  debug.log('[TTS-Content] Starting playback with', audioQueue.length, 'chunks');
  if (audioQueue.length === 0) {
    debug.log('[TTS-Content] No audio chunks to play');
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
    
    debug.log('[TTS-Content] Audio playback started');
    
    // Handle playback end
    audioElement.onended = () => {
      debug.log('[TTS-Content] Audio playback ended');
      stopTimeUpdates();
      isPlaying = false;
      updatePlayPauseButton(false);
      updateStatus('Playback complete');
      updateTimeDisplay();
    };
    
  } catch (error) {
    debug.error('[TTS-Content] Audio playback error:', error);
    updateStatus('Error playing audio');
  }
}

// Show error message
function showError(error) {
  debug.log('[TTS-Content] Showing error:', error);
  if (!overlayElement) {
    alert(error);
    return;
  }
  
  updateStatus(`Error: ${error}`);
  setTimeout(hideOverlay, 3000);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debug.log('[TTS-Content] Received message:', request.action);
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