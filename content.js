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
let hasStartedEarlyPlayback = false;
let isStreamingComplete = false;
let continuationAudioSource = null;
let hasStartedContinuation = false;
let lastProcessedChunkIndex = 0; // Track which chunks have been used for playback
let currentPlaybackOffset = 0; // Track the actual playback position in seconds
const PLAYBACK_START_THRESHOLD = 4; // Start playback after 4 chunks

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
          <div class="tts-time-display">
            <span class="tts-time-text">0s of ...</span>
          </div>
          <button class="tts-download-btn" aria-label="Download audio">Download</button>
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
  const downloadBtn = overlayElement.querySelector('.tts-download-btn');

  closeBtn.addEventListener('click', hideOverlay);
  playPauseBtn.addEventListener('click', togglePlayPause);
  rewindBtn.addEventListener('click', rewindAudio);
  downloadBtn.addEventListener('click', downloadAudio);
}

// Show overlay with text
function showOverlay(text) {
  console.log('[TTS-Content] Showing overlay for text length:', text.length);
  
  // Clear any previous audio state completely
  stopPlayback();
  
  // Ensure all state is properly reset for new session
  audioQueue = [];
  currentAudioBuffer = null;
  isPlaying = false;
  isPaused = false;
  playbackStartTime = 0;
  pausedAt = 0;
  totalDuration = 0;
  hasStartedEarlyPlayback = false;
  isStreamingComplete = false;
  hasStartedContinuation = false;
  lastProcessedChunkIndex = 0;
  currentPlaybackOffset = 0;
  
  // Reset UI state for new session
  updatePlayPauseButton(false);
  updateRewindButton(false); // Start disabled since we'll be streaming
  updateDownloadButton(false); // Start disabled until streaming is complete
  stopTimeUpdates();
  
  createOverlay();
  overlayElement.classList.add('visible');
  
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
  
  // If no audio buffer yet (new session), show initial state
  if (!currentAudioBuffer) {
    timeText.textContent = '0s of ...';
    return;
  }
  
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
  
  // Show "..." while streaming, actual duration once complete
  const durationText = isStreamingComplete ? formatTime(totalDuration) : '...';
  timeText.textContent = `${formatTime(currentTime)} of ${durationText}`;
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

// Download audio as MP3 file
async function downloadAudio() {
  console.log('[TTS-Content] Download button clicked');
  
  if (!isStreamingComplete || audioQueue.length === 0) {
    console.log('[TTS-Content] Cannot download - streaming not complete or no audio data');
    return;
  }
  
  try {
    console.log('[TTS-Content] Creating MP3 blob from audio chunks');
    
    // Combine all audio chunks into a single buffer
    const totalLength = audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of audioQueue) {
      combinedBuffer.set(chunk, offset);
      offset += chunk.length;
    }
    
    // Create blob from the MP3 data (chunks are already in MP3 format from OpenAI)
    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
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
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
    console.log('[TTS-Content] Audio source stopped');
  }
  
  if (continuationAudioSource) {
    continuationAudioSource.stop();
    continuationAudioSource = null;
    console.log('[TTS-Content] Continuation audio source stopped');
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
  hasStartedEarlyPlayback = false;
  isStreamingComplete = false;
  hasStartedContinuation = false;
  lastProcessedChunkIndex = 0;
  currentPlaybackOffset = 0;
  updatePlayPauseButton(false);
  updateRewindButton(true); // Reset rewind button to enabled state
  updateDownloadButton(false); // Reset download button to disabled state
  
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

  // Start early playback when we have enough chunks
  if (!hasStartedEarlyPlayback && audioQueue.length >= PLAYBACK_START_THRESHOLD && !isPlaying) {
    console.log('[TTS-Content] Starting early playback with', audioQueue.length, 'chunks buffered');
    hasStartedEarlyPlayback = true;
    startEarlyPlayback();
  }
  
  // Handle continuation when streaming is complete
  if (isLast) {
    isStreamingComplete = true;
    console.log('[TTS-Content] Last chunk received, total chunks:', audioQueue.length);
    
    // Enable download button now that streaming is complete
    updateDownloadButton(true);
    
    if (hasStartedEarlyPlayback && isPlaying) {
      // Update the total duration now that we have all chunks
      await updateTotalDurationFromCompleteBuffer();
    } else if (!hasStartedEarlyPlayback) {
      // Fallback: start normal playback if early playback never triggered
      console.log('[TTS-Content] Starting fallback playback with', audioQueue.length, 'chunks buffered');
      startPlayback();
    }
  }
}

// Start early playback with initial chunks
async function startEarlyPlayback() {
  console.log('[TTS-Content] Starting early playback with', audioQueue.length, 'chunks');
  
  // Create new audio context if needed
  if (!audioContext || audioContext.state === 'closed') {
    initAudioContext();
  }

  isPlaying = true;
  isPaused = false;
  pausedAt = 0;
  updatePlayPauseButton(true);
  updateRewindButton(false); // Disable rewind during streaming/continuation
  updateStatus('Playing...');

  // Combine available chunks into initial buffer
  const initialChunks = audioQueue.slice(0, PLAYBACK_START_THRESHOLD);
  const totalLength = initialChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log('[TTS-Content] Combining', initialChunks.length, 'initial chunks into buffer of', totalLength, 'bytes');
  
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of initialChunks) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  console.log('[TTS-Content] Initial audio buffer combined successfully');

  try {
    console.log('[TTS-Content] Decoding initial audio data');
    const arrayBuffer = combinedBuffer.buffer;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('[TTS-Content] Initial audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
    
    // Store audio buffer (will be updated when streaming completes)
    currentAudioBuffer = audioBuffer;
    totalDuration = audioBuffer.duration; // Temporary duration, will be updated
    lastProcessedChunkIndex = PLAYBACK_START_THRESHOLD; // Track initial chunks processed
    currentPlaybackOffset = audioBuffer.duration; // Set initial offset for continuations
    
    // Create and play audio source
    console.log('[TTS-Content] Creating audio source and starting early playback');
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start();
    playbackStartTime = audioContext.currentTime;
    startTimeUpdates();
    console.log('[TTS-Content] Early audio playback started');
    
    // Handle early playback end - prepare for continuation
    audioSource.onended = () => {
      console.log('[TTS-Content] Early playback ended, preparing continuation');
      // Check if we have more chunks to process beyond what we've already used
      if (audioQueue.length > lastProcessedChunkIndex) {
        // Need to continue with remaining chunks
        console.log('[TTS-Content] Continuing playback with remaining chunks, processed:', lastProcessedChunkIndex, 'total:', audioQueue.length);
        continuePlayback();
      } else {
        // All chunks processed, normal ending
        console.log('[TTS-Content] All chunks processed, playback complete');
        stopTimeUpdates();
        isPlaying = false;
        updatePlayPauseButton(false);
        updateStatus('Playback complete');
        updateTimeDisplay();
      }
    };
    
    // Fallback: if we have more chunks available immediately, prepare continuation
    if (audioQueue.length > PLAYBACK_START_THRESHOLD) {
      console.log('[TTS-Content] Additional chunks already available, preparing immediate continuation');
      setTimeout(() => {
        if (audioQueue.length > PLAYBACK_START_THRESHOLD && isPlaying && !isStreamingComplete) {
          console.log('[TTS-Content] Fallback: scheduling continuation');
          // Schedule continuation slightly before the current buffer ends
          const bufferEndTime = (audioBuffer.duration * 1000) - 50; // 50ms before end
          setTimeout(() => {
            if (isPlaying && !isStreamingComplete) {
              console.log('[TTS-Content] Fallback continuation triggered');
              continuePlayback();
            }
          }, bufferEndTime);
        }
      }, 100);
    }
    
  } catch (error) {
    console.error('[TTS-Content] Early playback decode error:', error);
    updateStatus('Error playing audio');
    // Fallback to waiting for all chunks
    hasStartedEarlyPlayback = false;
  }
}

// Continue playback with remaining chunks
async function continuePlayback() {
  // Prevent multiple continuation attempts
  if (hasStartedContinuation) {
    console.log('[TTS-Content] Continuation already started, ignoring duplicate call');
    return;
  }
  
  if (audioQueue.length <= lastProcessedChunkIndex) {
    console.log('[TTS-Content] No new chunks to continue playback, processed:', lastProcessedChunkIndex, 'total:', audioQueue.length);
    return;
  }

  hasStartedContinuation = true;
  
  // Determine which chunks to use for this continuation
  const startChunkIndex = lastProcessedChunkIndex;
  const endChunkIndex = isStreamingComplete ? audioQueue.length : Math.min(audioQueue.length, startChunkIndex + PLAYBACK_START_THRESHOLD * 4); // Use larger batches for continuation
  const chunksToProcess = audioQueue.slice(startChunkIndex, endChunkIndex);
  
  console.log('[TTS-Content] Continuing playback from chunk', startChunkIndex, 'to', endChunkIndex - 1, '(', chunksToProcess.length, 'chunks)');
  
  // Stop the current audio source to prevent overlap
  if (audioSource) {
    audioSource.onended = null; // Remove the event handler
    audioSource.stop();
    audioSource = null;
  }
  
  // Create buffer with available chunks
  const totalLength = chunksToProcess.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log('[TTS-Content] Creating continuation buffer with', chunksToProcess.length, 'chunks, total size:', totalLength, 'bytes');
  
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunksToProcess) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    // Create buffer with all chunks up to current point to get proper offset
    const allChunksToHere = audioQueue.slice(0, endChunkIndex);
    const allLength = allChunksToHere.reduce((sum, chunk) => sum + chunk.length, 0);
    const allBuffer = new Uint8Array(allLength);
    let allOffset = 0;
    
    for (const chunk of allChunksToHere) {
      allBuffer.set(chunk, allOffset);
      allOffset += chunk.length;
    }
    
    const allArrayBuffer = allBuffer.buffer;
    const completeAudioBuffer = await audioContext.decodeAudioData(allArrayBuffer);
    console.log('[TTS-Content] Complete audio decoded, total duration so far:', completeAudioBuffer.duration, 'seconds');
    
    // Calculate where we should start playing from
    const startOffset = currentPlaybackOffset;
    
    console.log('[TTS-Content] Starting continuation from offset:', startOffset.toFixed(3), 'seconds');
    
    // Create new audio source with complete buffer but start from offset
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = completeAudioBuffer;
    audioSource.connect(audioContext.destination);
    audioSource.start(0, startOffset); // Start from where previous buffer ended
    
    // Update playback timing to account for the offset
    playbackStartTime = audioContext.currentTime - startOffset;
    
    // Update stored references
    currentAudioBuffer = completeAudioBuffer;
    totalDuration = completeAudioBuffer.duration;
    lastProcessedChunkIndex = endChunkIndex;
    
    // Update current playback offset for next continuation
    // Set to the complete buffer duration as it represents where we'll be when this continuation finishes
    if (isStreamingComplete && lastProcessedChunkIndex >= audioQueue.length) {
      // If this is the final continuation, don't update offset as playback will complete
      console.log('[TTS-Content] Final continuation - keeping currentPlaybackOffset at:', currentPlaybackOffset.toFixed(3));
      // Enable rewind button now that we have the complete audio buffer
      updateRewindButton(true);
    } else {
      currentPlaybackOffset = completeAudioBuffer.duration;
    }
    
    console.log('[TTS-Content] Continuation started from', startOffset.toFixed(3), 's, total duration:', totalDuration.toFixed(3), 's, processed chunks:', lastProcessedChunkIndex);
    
    // Handle end of continuation buffer
    audioSource.onended = () => {
      console.log('[TTS-Content] Continuation buffer ended');
      
      if (isStreamingComplete && lastProcessedChunkIndex >= audioQueue.length) {
        // All chunks processed and streaming complete
        console.log('[TTS-Content] All audio playback complete');
        stopTimeUpdates();
        isPlaying = false;
        updatePlayPauseButton(false);
        updateRewindButton(true); // Enable rewind once final continuation completes
        updateStatus('Playback complete');
        updateTimeDisplay();
      } else {
        // More chunks available or streaming still in progress
        console.log('[TTS-Content] Preparing next continuation, streaming complete:', isStreamingComplete, 'chunks processed:', lastProcessedChunkIndex, 'total chunks:', audioQueue.length);
        hasStartedContinuation = false; // Reset for next continuation
        continuePlayback();
      }
    };
    
  } catch (error) {
    console.error('[TTS-Content] Continuation decode error:', error);
    updateStatus('Error continuing audio');
    hasStartedContinuation = false; // Reset on error
  }
}

// Update total duration when all chunks are received
async function updateTotalDurationFromCompleteBuffer() {
  if (audioQueue.length === 0) return;
  
  console.log('[TTS-Content] Updating total duration from complete buffer');
  
  // Combine all chunks to get accurate total duration
  const totalLength = audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
  const combinedBuffer = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of audioQueue) {
    combinedBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    const arrayBuffer = combinedBuffer.buffer;
    const completeAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Update stored values
    currentAudioBuffer = completeAudioBuffer;
    totalDuration = completeAudioBuffer.duration;
    
    console.log('[TTS-Content] Updated total duration to:', totalDuration, 'seconds');
  } catch (error) {
    console.error('[TTS-Content] Error updating total duration:', error);
  }
}

// Legacy startPlayback function for fallback and replay scenarios
async function startPlayback() {
  console.log('[TTS-Content] Starting standard playback with', audioQueue.length, 'chunks');
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
  updateRewindButton(true); // Enable rewind for legacy playback (replays)
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