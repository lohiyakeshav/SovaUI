export class AudioService {
  private audioContext: AudioContext | null = null;
  private audioQueue: Array<{audioData: string, sessionId?: string, index: number, total: number}> = [];
  private isPlaying: boolean = false;
  private audioChunks: Map<number, string> = new Map();
  private expectedChunks: number = 0;
  private currentSequence: number = 0;
  private _chunkCount: number = 0;
  private currentSessionId: string | null = null;
  private sessionAudioSources: Map<string, AudioBufferSourceNode[]> = new Map(); // Track sources by session
  private sessionChunksSeen: Set<number> = new Set(); // Track which chunks we've seen for current session
  private debugStartTime: number = Date.now(); // For relative timestamps
  private isPlayingSequentially: boolean = false;
  private currentAudioSource: AudioBufferSourceNode | null = null; // Track current playing source
  private playbackPromise: Promise<void> | null = null; // Track current playback promise
  private version: string = '2.1.0'; // Updated version for backend integration
  private playbackTimeoutId: NodeJS.Timeout | null = null; // Timeout for forcing playback
  private lastChunkTime: number = 0; // Track when last chunk was received
  private sessionStartTime: number = 0; // Track session start time
  private consecutiveChunkCount: number = 0; // Track consecutive chunks received
  private isInitialized: boolean = false; // Track if service has been initialized
  private sessionMonitoringInterval: NodeJS.Timeout | null = null; // Track session monitoring interval
  private sessionRefreshInterval: NodeJS.Timeout | null = null; // Track session refresh interval
  private lastStuckAudioCheck: number = 0; // Track when we last checked for stuck audio
  
  // Enhanced configuration for backend integration with adaptive chunk optimization
  private config = {
    defaultPlaybackRate: 0.5, // Reduced from 0.8 to 0.5 for more natural, slower voice speed
    volume: 0.9, // Increased for better audibility
    chunkDelay: 10, // Increased from 5ms to 10ms for better chunk separation
    maxQueueSize: 50, // Reduced from 100 since chunks are larger now
    maxRetries: 3,
    fadeInDuration: 0.001, // Reduced from 0.002 for faster start
    fadeOutDuration: 0.003, // Reduced from 0.005 for faster transitions
    adaptivePlayback: true, // Enable adaptive playback speed
    performanceMode: true, // Enable performance optimizations
    sentencePauseDuration: 0.0, // Removed sentence pauses completely
    dynamicVolume: true, // Enable dynamic volume adjustment
    strictSequential: true, // Ensure strict sequential playback
    maxConcurrentSources: 1, // Only allow 1 source at a time
    sessionTimeout: 10000, // Increased from 5000ms to 10000ms for better session management
    chunkTimeout: 5000, // Increased from 3000ms to 5000ms for larger chunks
    // New backend integration settings
    backendSessionTimeout: 600000, // 10 minutes - matches backend activity timeout
    sessionRefreshInterval: 1800000, // 30 minutes - matches backend session refresh
    turnTracking: true, // Enable turn tracking for analytics
    autoReconnection: true, // Enable auto-reconnection support
    sessionMonitoring: true, // Enable session health monitoring
    // Adaptive chunk optimization settings
    adaptiveChunkMode: true, // Enable adaptive chunk handling
    largeChunkThreshold: 2000, // 2 seconds - chunks larger than this get special handling
    chunkSizeOptimization: true, // Enable chunk size-based optimizations
    // Logging control
    verboseLogging: true, // Enable verbose logging to debug playback rate
  };
  
  // Enhanced performance tracking with backend integration
  private performanceMetrics = {
    totalChunksProcessed: 0,
    successfulDecodes: 0,
    failedDecodes: 0,
    averageDecodeTime: 0,
    totalPlaybackTime: 0,
    lastChunkTime: 0,
    isCurrentlySpeaking: false,
    speechQuality: 'good', // 'good', 'quiet', 'fast'
    // New backend integration metrics
    sessionDuration: 0,
    turnCount: 0,
    reconnectionCount: 0,
    sessionHealthScore: 100,
    lastSessionRefresh: 0,
    conversationState: 'idle', // 'idle', 'active', 'paused', 'ended'
  };
  
  // Session state management for backend integration
  private sessionState = {
    sessionId: null as string | null,
    startTime: 0,
    lastActivity: 0,
    turnHistory: [] as Array<{
      timestamp: number,
      type: 'user' | 'ai',
      duration: number,
      chunkCount: number
    }>,
    healthChecks: [] as Array<{
      timestamp: number,
      status: 'healthy' | 'warning' | 'error',
      message: string
    }>,
    reconnectionEvents: [] as Array<{
      timestamp: number,
      reason: string,
      success: boolean
    }>
  };
  
  // Helper method to get formatted timestamp
  private getTimestamp(): string {
    const now = Date.now();
    const relative = now - this.debugStartTime;
    const absolute = new Date(now).toISOString().split('T')[1].slice(0, -1); // HH:MM:SS.mmm
    return `[${absolute}] (+${relative}ms) V${this.version}`;
  }

  // Helper method for controlled logging
  private log(message: string, force: boolean = false): void {
    if (this.config.verboseLogging || force) {
      console.log(message);
    }
  }

  constructor() {
    // Don't initialize anything until user actually interacts
    // This prevents aggressive audio context creation on page load
  }

  private async initAudioContext() {
    if (typeof window !== 'undefined' && !this.audioContext) {
      // Create audio context with system default sample rate to avoid resampling issues
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive'
      });
      
      // Resume audio context if it's suspended (common in browsers)
      if (this.audioContext.state === 'suspended') {
        console.log('🔊 Resuming suspended audio context...');
        await this.audioContext.resume();
      }
      
      console.log('🔊 Audio context initialized, state:', this.audioContext.state, 'sample rate:', this.audioContext.sampleRate + 'Hz');
    }
  }

  // Initialize the audio service when user first interacts
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return; // Already initialized
    }
    
    this.log('🎵 Initializing AudioService on first user interaction...', true);
    
    // Initialize audio context
    await this.initAudioContext();
    
    // Start session monitoring for backend integration
    this.startSessionMonitoring();
    
    this.isInitialized = true;
    this.log('✅ AudioService initialized successfully', true);
  }

  // New method to start session monitoring for backend integration
  private startSessionMonitoring(): void {
    if (!this.config.sessionMonitoring) return;
    
    // Clear any existing intervals
    if (this.sessionMonitoringInterval) {
      clearInterval(this.sessionMonitoringInterval);
    }
    if (this.sessionRefreshInterval) {
      clearInterval(this.sessionRefreshInterval);
    }
    
    // Monitor session health every 30 seconds (matching backend)
    this.sessionMonitoringInterval = setInterval(() => {
      this.checkSessionHealth();
    }, 30000);
    
    // Check for session refresh every 30 minutes (matching backend)
    this.sessionRefreshInterval = setInterval(() => {
      this.checkSessionRefresh();
    }, this.config.sessionRefreshInterval);
    
    this.log('📊 Session monitoring started for backend integration');
  }

  // New method to check session health
  private checkSessionHealth(): void {
    const timestamp = this.getTimestamp();
    const sessionAge = Date.now() - this.sessionState.startTime;
    const timeSinceLastActivity = Date.now() - this.sessionState.lastActivity;
    
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    let message = 'Session healthy';
    
    // Check for session timeout (10 minutes - matching backend)
    if (timeSinceLastActivity > this.config.backendSessionTimeout) {
      status = 'error';
      message = `Session inactive for ${Math.round(timeSinceLastActivity / 1000)}s`;
    } else if (timeSinceLastActivity > 300000) { // 5 minutes warning
      status = 'warning';
      message = `Session inactive for ${Math.round(timeSinceLastActivity / 1000)}s`;
    }
    
    // Check for audio issues
    if (this.getTotalActiveSources() > 1) {
      status = 'error';
      message = `Multiple audio sources detected: ${this.getTotalActiveSources()}`;
    }
    
    // Record health check
    this.sessionState.healthChecks.push({
      timestamp: Date.now(),
      status,
      message
    });
    
    // Update performance metrics
    this.performanceMetrics.sessionHealthScore = status === 'healthy' ? 100 : status === 'warning' ? 50 : 0;
    
    this.log(`${timestamp} 📊 SESSION HEALTH: ${status.toUpperCase()} - ${message}`);
    
    // Trigger session refresh if needed
    if (status === 'error') {
      this.handleSessionError(message);
    }
  }

  // New method to check for session refresh
  private checkSessionRefresh(): void {
    const timestamp = this.getTimestamp();
    const sessionAge = Date.now() - this.sessionState.startTime;
    
    if (sessionAge > this.config.sessionRefreshInterval) {
      console.log(`${timestamp} 🔄 SESSION REFRESH: Session ${sessionAge}ms old, refreshing for long conversation`);
      this.refreshSession();
    }
  }

  // New method to handle session errors
  private handleSessionError(message: string): void {
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 🚨 SESSION ERROR: ${message}, attempting recovery`);
    
    // Record reconnection event
    this.sessionState.reconnectionEvents.push({
      timestamp: Date.now(),
      reason: message,
      success: false
    });
    
    // Force clear audio and reset state
    this.forceClearAllAudio();
    this.cleanupSession();
    
    // Update performance metrics
    this.performanceMetrics.reconnectionCount++;
  }

  // New method to refresh session for long conversations
  private refreshSession(): void {
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 🔄 REFRESHING SESSION: Maintaining conversation state across refresh`);
    
    // Preserve conversation state
    const preservedState = {
      turnCount: this.performanceMetrics.turnCount,
      sessionDuration: this.performanceMetrics.sessionDuration,
      conversationState: this.performanceMetrics.conversationState
    };
    
    // Clear current session
    this.cleanupSession();
    
    // Restore conversation state
    this.performanceMetrics.turnCount = preservedState.turnCount;
    this.performanceMetrics.sessionDuration = preservedState.sessionDuration;
    this.performanceMetrics.conversationState = preservedState.conversationState;
    
    // Update session state
    this.sessionState.startTime = Date.now();
    this.sessionState.lastActivity = Date.now();
    this.performanceMetrics.lastSessionRefresh = Date.now();
    
    console.log(`${timestamp} ✅ SESSION REFRESHED: State preserved, conversation continues`);
  }

  // New method to track conversation turns
  private trackTurn(type: 'user' | 'ai', duration: number, chunkCount: number): void {
    const turn = {
      timestamp: Date.now(),
      type,
      duration,
      chunkCount
    };
    
    this.sessionState.turnHistory.push(turn);
    this.performanceMetrics.turnCount++;
    this.sessionState.lastActivity = Date.now();
    
    // Update conversation state
    this.performanceMetrics.conversationState = 'active';
    
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 📊 TURN TRACKED: ${type.toUpperCase()} turn #${this.performanceMetrics.turnCount}, duration: ${duration}ms, chunks: ${chunkCount}`);
  }

  // New method to initialize session state for backend integration
  private initializeSessionState(sessionId: string): void {
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🔧 INITIALIZING SESSION STATE: ${sessionId?.substring(0, 8)}...`);
    
    // Initialize session state
    this.sessionState.sessionId = sessionId;
    this.sessionState.startTime = Date.now();
    this.sessionState.lastActivity = Date.now();
    
    // Reset performance metrics for new session
    this.performanceMetrics.sessionDuration = 0;
    this.performanceMetrics.turnCount = 0;
    this.performanceMetrics.sessionHealthScore = 100;
    this.performanceMetrics.conversationState = 'active';
    
    // Clear old data
    this.sessionState.turnHistory = [];
    this.sessionState.healthChecks = [];
    this.sessionState.reconnectionEvents = [];
    
    this.log(`${timestamp} ✅ SESSION STATE INITIALIZED: Ready for backend integration`);
  }

  // Method to stop all currently playing audio
  private stopCurrentAudio(): void {
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🛑 STOPPING AUDIO: ${this.getTotalActiveSources()} active sources being stopped`);
    
    // Stop current audio source
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
        this.log(`${timestamp} 🛑 STOPPED CURRENT SOURCE`);
      } catch (error) {
        this.log(`${timestamp} 🛑 STOP ERROR: current source already stopped or error: ${error.message}`);
      }
      this.currentAudioSource = null;
    }
    
    // Stop all session sources
    for (const [sessionId, sources] of this.sessionAudioSources.entries()) {
      sources.forEach((source, index) => {
        try {
          source.stop();
          // Reduced logging to prevent spam
        } catch (error) {
          // Reduced logging to prevent spam
        }
      });
      this.sessionAudioSources.set(sessionId, []); // Clear session sources after stopping
    }
    this.log(`${timestamp} 🛑 STOP COMPLETE: all sources cleared`);
  }

  // Public method to interrupt current audio playback
  public interrupt(): void {
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 🚫 INTERRUPTING: Stopping all audio and clearing queue`);
    
    // Stop current audio
    this.stopCurrentAudio();
    
    // Clear the queue
    const queueLength = this.audioQueue.length;
    this.audioQueue = [];
    
    // Reset sequential playback flag
    this.isPlayingSequentially = false;
    
    // Reset playback promise
    this.playbackPromise = null;
    
    // Clear timeout
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
    
    // Reset session tracking
    this.sessionStartTime = 0;
    this.consecutiveChunkCount = 0;
    this.lastChunkTime = 0;
    
    console.log(`${timestamp} 🚫 INTERRUPT COMPLETE: Stopped ${this.getTotalActiveSources()} sources, cleared ${queueLength} queued chunks`);
  }

  // Method to handle user interruption (connect with socket service)
  public handleUserInterruption(): void {
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 👤 USER INTERRUPTION: User requested audio stop`);
    
    // Interrupt local audio
    this.interrupt();
    
    // Note: Socket service interrupt should be called from the component level
    // to maintain proper separation of concerns
  }

  // Enhanced method to queue audio chunks for sequential playback
  private queueAudioChunk(audioData: string, sessionId: string | undefined, index: number, total: number): void {
    const timestamp = this.getTimestamp();
    
    // Prevent queue overflow
    if (this.audioQueue.length >= this.config.maxQueueSize) {
      console.warn(`${timestamp} ⚠️ QUEUE FULL: Removing oldest chunk to prevent overflow`);
      this.audioQueue.shift(); // Remove oldest chunk
    }
    
    // Add to queue and sort by index to ensure correct order
    this.audioQueue.push({ audioData, sessionId, index, total });
    this.audioQueue.sort((a, b) => a.index - b.index); // Sort by chunk index
    this.log(`${timestamp} 📋 QUEUED: chunk ${index}/${total}, queue length: ${this.audioQueue.length}, isPlayingSequentially: ${this.isPlayingSequentially}`);
    
    // Update chunk timing
    this.lastChunkTime = Date.now();
    this.consecutiveChunkCount++;
    
    // Check if we can start playing consecutive chunks
    this.checkAndPlayConsecutiveChunks();
  }

  // New method to check for consecutive chunks and start playback
  private checkAndPlayConsecutiveChunks(): void {
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🔍 CHECKING CONSECUTIVE: isPlayingSequentially: ${this.isPlayingSequentially}, queue length: ${this.audioQueue.length}`);
    
    if (this.isPlayingSequentially || this.audioQueue.length === 0) {
      this.log(`${timestamp} ⏸️ SKIPPING CHECK: isPlayingSequentially: ${this.isPlayingSequentially}, queue empty: ${this.audioQueue.length === 0}`);
      return;
    }

    const sortedChunks = [...this.audioQueue].sort((a, b) => a.index - b.index);
    this.log(`${timestamp} 📊 SORTED CHUNKS: [${sortedChunks.map(c => c.index).join(',')}]`);
    
    // Find the longest consecutive sequence starting from the lowest index
    let consecutiveCount = 0;
    let expectedIndex = sortedChunks[0]?.index || 0;
    let maxGap = 0; // Track the largest gap in the sequence
    
    for (const chunk of sortedChunks) {
      if (chunk.index === expectedIndex) {
        consecutiveCount++;
        expectedIndex++;
      } else if (chunk.index > expectedIndex) {
        // Found a gap, but continue looking for more consecutive chunks
        const gap = chunk.index - expectedIndex;
        maxGap = Math.max(maxGap, gap);
        expectedIndex = chunk.index + 1;
        consecutiveCount = 1; // Reset count for new sequence
      } else {
        // Chunk index is less than expected (duplicate or out of order)
        continue;
      }
    }
    
    // Calculate wait time
    const waitTime = this.getQueueWaitTime();
    const timeSinceLastChunk = Date.now() - this.lastChunkTime;
    
    // Get total chunks expected from the first chunk
    const totalChunksExpected = sortedChunks[0]?.total || 1;
    
    // CONSERVATIVE APPROACH: Wait for better chunk sequences to prevent conflicts
    const hasEnoughConsecutive = consecutiveCount >= 2; // Reduced from 3 to 2 for faster response
    const hasReasonableGap = maxGap <= 1; // Reduced from 2 to 1 chunk
    const hasBeenWaitingTooLong = waitTime > 500; // Reduced from 1000ms to 500ms
    const hasEnoughTotalChunks = this.audioQueue.length >= 2; // Reduced from 3 to 2
    const hasManyChunks = this.audioQueue.length >= 3; // Reduced from 5 to 3
    const hasRecentChunks = timeSinceLastChunk < 100; // Reduced from 200ms to 100ms
    const hasConsecutiveChunks = this.consecutiveChunkCount >= 2; // Reduced from 3 to 2
    
    // Special case: If we have all chunks for a short response, start immediately
    const hasAllChunksForShortResponse = this.audioQueue.length === totalChunksExpected && totalChunksExpected <= 3;
    
    // Start playback if we have enough consecutive chunks with small gaps,
    // or if we've been waiting too long and have enough total chunks,
    // or if we have many chunks regardless of gaps (more aggressive)
    // or if we have recent consecutive chunks (more responsive)
    // or if we have all chunks for a short response
    const shouldStartPlayback = (hasEnoughConsecutive && hasReasonableGap) || 
                               (hasBeenWaitingTooLong && hasEnoughTotalChunks) ||
                               hasManyChunks ||
                               (hasRecentChunks && hasConsecutiveChunks) ||
                               hasAllChunksForShortResponse;
    
    this.log(`${timestamp} 📈 ANALYSIS: consecutive: ${consecutiveCount}, maxGap: ${maxGap}, waitTime: ${waitTime}ms, queue: ${this.audioQueue.length}, manyChunks: ${hasManyChunks}, recentChunks: ${hasRecentChunks}ms, consecutiveCount: ${this.consecutiveChunkCount}, shouldStart: ${shouldStartPlayback}, totalExpected: ${totalChunksExpected}, hasAllChunks: ${hasAllChunksForShortResponse}`);
    
    if (shouldStartPlayback) {
      this.log(`${timestamp} 🎯 STARTING PLAYBACK: ${consecutiveCount} consecutive chunks, max gap: ${maxGap}, wait time: ${waitTime}ms, queue: ${this.audioQueue.length}, many chunks: ${hasManyChunks}, total expected: ${totalChunksExpected}`);
      this.playSequentialQueue();
    } else {
      this.log(`${timestamp} ⏳ WAITING: ${consecutiveCount} consecutive chunks, max gap: ${maxGap}, wait time: ${waitTime}ms, queue: ${this.audioQueue.length}, many chunks: ${hasManyChunks}, total expected: ${totalChunksExpected}`);
    }
  }

  // Helper method to track how long chunks have been waiting
  private queueStartTime: number | null = null;
  private getQueueWaitTime(): number {
    if (!this.queueStartTime) {
      this.queueStartTime = Date.now();
    }
    return Date.now() - this.queueStartTime;
  }

  // Enhanced method to play audio queue sequentially with strict control
  private async playSequentialQueue(): Promise<void> {
    if (this.isPlayingSequentially || this.audioQueue.length === 0) {
      return;
    }

    this.isPlayingSequentially = true;
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🎵 SEQUENTIAL PLAYBACK START: queue length: ${this.audioQueue.length}`);

    // Reset queue wait time
    this.queueStartTime = null;

    while (this.audioQueue.length > 0) {
      // Get the next chunk in order
      const chunk = this.audioQueue.shift();
      if (!chunk) continue;

      try {
        this.log(`${timestamp} 🎵 PLAYING SEQUENTIAL: chunk ${chunk.index}/${chunk.total}`);
        
        // Play the audio chunk and wait for it to finish completely
        this.playbackPromise = this.playAudioChunk(chunk.audioData, chunk.sessionId || undefined, chunk.index, chunk.total);
        await this.playbackPromise; // Wait for this chunk to finish before continuing
        
        // Add a small gap between chunks for better separation
        const gapDelay = this.config.chunkDelay;
        if (gapDelay > 0) {
          this.log(`${timestamp} ⏸️ WAITING: ${gapDelay}ms gap between chunks`);
          await new Promise(resolve => setTimeout(resolve, gapDelay));
        }
        
        // Removed sentence pause logic - no more pauses between chunks
        
      } catch (error) {
        console.error(`${timestamp} ❌ SEQUENTIAL PLAYBACK ERROR: chunk ${chunk.index}/${chunk.total}:`, error);
        
        // Enhanced retry logic for failed chunks
        const retryCount = (chunk as any).retryCount || 0;
        if (retryCount < this.config.maxRetries) {
          console.log(`${timestamp} 🔄 RETRYING: chunk ${chunk.index}/${chunk.total} (attempt ${retryCount + 1}/${this.config.maxRetries})`);
          (chunk as any).retryCount = retryCount + 1;
          this.audioQueue.unshift(chunk); // Put back at front of queue
          await new Promise(resolve => setTimeout(resolve, 200 * (retryCount + 1))); // Exponential backoff
        } else {
          console.warn(`${timestamp} ⚠️ MAX RETRIES REACHED: chunk ${chunk.index}/${chunk.total} failed after ${this.config.maxRetries} attempts`);
        }
      }
    }

    this.isPlayingSequentially = false;
    this.playbackPromise = null;
    
    // Clear timeout since playback is complete
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
    
    this.log(`${this.getTimestamp()} 🎵 SEQUENTIAL PLAYBACK COMPLETE`);
  }

  // Simplified sentence pause logic
  private shouldAddSentencePause(chunk: any): boolean {
    // Add pause every 10-15 chunks to break up long speech
    if (chunk.index % 12 === 0 && chunk.index > 0) {
      return true;
    }
    
    // Add pause near the end of the response
    if (chunk.index >= chunk.total - 3) {
      return true;
    }
    
    return false;
  }

  // Enhanced audio chunk playback with better error handling and performance
  async playAudioChunk(base64Audio: string, sessionId?: string, chunkIndex?: number, totalChunks?: number): Promise<void> {
    this._chunkCount++;
    const timestamp = this.getTimestamp();
    const chunkInfo = chunkIndex !== undefined ? `${chunkIndex}/${totalChunks}` : `#${this._chunkCount}`;
    const startTime = performance.now();
    
    // Update lastChunkTime to prevent stuck audio detection
    this.lastChunkTime = Date.now();
    
    // Prevent processing too many chunks simultaneously
    const activeSources = this.getTotalActiveSources();
    if (activeSources > 3) {
      this.log(`${timestamp} ⚠️ TOO MANY ACTIVE SOURCES: ${activeSources}, skipping chunk ${chunkInfo}`);
      return;
    }
    
    this.log(`${timestamp} 🔧 DECODE START: chunk ${chunkInfo}, session: ${sessionId?.substring(0, 8) || 'none'}..., input size: ${base64Audio.length}B`);
    
    try {
      await this.initAudioContext();
      
      // Validate audio data
      if (!this.validateAudioData(base64Audio, chunkInfo, timestamp)) {
        return;
      }
      
      // Convert base64 to bytes
      const bytes = await this.convertBase64ToBytes(base64Audio, chunkInfo, timestamp);
      if (!bytes) {
        return;
      }
      
      // Detect audio format and calculate playback rate
      const formatInfo = this.detectAudioFormat(bytes, chunkInfo, timestamp);
      if (!formatInfo) {
        return;
      }
      
      // Decode audio buffer
      const audioBuffer = await this.decodeAudioBuffer(bytes, formatInfo, chunkInfo, timestamp);
      if (!audioBuffer) {
        return;
      }
      
      // Create and play audio source with proper promise handling
      return new Promise<void>((resolve, reject) => {
        try {
          this.createAudioSourceAndPlayInternal(audioBuffer, chunkIndex || 0, sessionId || 'default', formatInfo.playbackRate, resolve);
        } catch (error) {
          reject(error);
        }
      });
      
    } catch (error) {
      console.error(`${timestamp} ❌ AUDIO CHUNK ERROR: chunk ${chunkInfo}:`, error);
      this.updatePerformanceMetrics(performance.now() - startTime, false);
      throw error;
    }
  }

  // Enhanced validation method
  private validateAudioData(base64Audio: string, chunkInfo: string, timestamp: string): boolean {
    if (!base64Audio || base64Audio.length < 10) {
      console.error(`${timestamp} ❌ Audio data too short for chunk ${chunkInfo}, likely invalid`);
      return false;
    }
    
    // Enhanced base64 validation
    const isValidBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(base64Audio);
    console.log(`${timestamp} 🔍 BASE64 VALIDATION: chunk ${chunkInfo}, ${isValidBase64 ? '✅ Valid' : '❌ Invalid'}, length: ${base64Audio.length}`);
    
    if (!isValidBase64) {
      console.error(`${timestamp} ❌ Invalid base64 format for chunk ${chunkInfo}`);
      return false;
    }
    
    return true;
  }

  // Enhanced base64 conversion with error handling
  private async convertBase64ToBytes(base64Audio: string, chunkInfo: string, timestamp: string): Promise<Uint8Array | null> {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      console.error(`${timestamp} ❌ BASE64 CONVERSION ERROR: chunk ${chunkInfo}, error: ${error.message}`);
      return null;
    }
  }

  // Enhanced format detection
  private detectAudioFormat(bytes: Uint8Array, chunkInfo: string, timestamp: string): { format: string, playbackRate: number } | null {
    let audioFormat = 'unknown';
    let playbackRate = this.config.defaultPlaybackRate;
    
    // Debug: Check first few bytes to identify format
    const header = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    this.log(`${timestamp} 🔍 AUDIO HEADER: chunk ${chunkInfo}, hex: ${header}`);
    
    if (bytes.length >= 12) {
      const riffHeader = String.fromCharCode(...bytes.slice(0, 4));
      const waveHeader = String.fromCharCode(...bytes.slice(8, 12));
      this.log(`${timestamp} 🔍 HEADER ANALYSIS: RIFF="${riffHeader}", WAVE="${waveHeader}"`);
      if (riffHeader === 'RIFF' && waveHeader === 'WAVE') {
        audioFormat = 'WAV';
        this.log(`${timestamp} ✅ WAV FORMAT CONFIRMED`);
      } else {
        this.log(`${timestamp} ⚠️ NOT WAV FORMAT: RIFF="${riffHeader}", WAVE="${waveHeader}"`);
      }
    }
    
    // Check for other formats if not WAV
    if (audioFormat === 'unknown') {
      if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
        audioFormat = 'OGG_OPUS';
      } else if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
        audioFormat = 'MP3';
      }
    }
    
    // Adaptive playback rate based on format and performance
    if (this.config.adaptivePlayback) {
      playbackRate = this.calculateAdaptivePlaybackRate(audioFormat);
    }
    
    this.log(`${timestamp} 🔍 FORMAT DETECTED: chunk ${chunkInfo}, format: ${audioFormat}, playback rate: ${playbackRate}x`);
    this.log(`${timestamp} 🔍 BACKEND INFO: Properly chunked WAV files (16KB chunks, each with headers)`);
    
    return { format: audioFormat, playbackRate };
  }

  // Calculate adaptive playback rate
  private calculateAdaptivePlaybackRate(format: string): number {
    // Base rate for natural voice sound
    let baseRate = 0.5; // Reduced from 0.8 to 0.5 for more natural, slower voice
    
    // Adjust based on format
    switch (format.toLowerCase()) {
      case 'wav':
        baseRate = 0.55; // Slightly faster for WAV files but still natural
        break;
      case 'mp3':
        baseRate = 0.5; // Standard rate for MP3
        break;
      case 'ogg':
        baseRate = 0.6; // Slightly faster for OGG files
        break;
      default:
        baseRate = 0.5; // Default natural rate
    }
    
    // Apply performance mode adjustments
    if (this.config.performanceMode) {
      baseRate = Math.min(0.7, baseRate * 1.05); // Cap at 0.7x for natural speed
    }
    
    return baseRate;
  }

  // Calculate dynamic volume based on audio content
  private calculateDynamicVolume(audioBuffer: AudioBuffer): number {
    if (!this.config.dynamicVolume) {
      return this.config.volume;
    }
    
    // Analyze audio levels to determine if it's speech
    const channelData = audioBuffer.getChannelData(0);
    const samples = channelData.length;
    let sum = 0;
    let peak = 0;
    
    // Calculate RMS and peak values
    for (let i = 0; i < samples; i++) {
      const sample = Math.abs(channelData[i]);
      sum += sample * sample;
      peak = Math.max(peak, sample);
    }
    
    const rms = Math.sqrt(sum / samples);
    const dynamicRange = peak / (rms + 0.001); // Avoid division by zero
    
    // Adjust volume based on audio characteristics
    let volume = this.config.volume;
    
    // If audio is too quiet, boost it
    if (rms < 0.1) {
      volume = Math.min(1.0, volume * 1.3);
    }
    
    // If audio has good dynamic range (likely speech), maintain volume
    if (dynamicRange > 3) {
      volume = Math.min(1.0, volume * 1.1);
    }
    
    return volume;
  }

  // Enhanced audio decoding
  private async decodeAudioBuffer(bytes: Uint8Array, formatInfo: { format: string, playbackRate: number }, chunkInfo: string, timestamp: string): Promise<AudioBuffer | null> {
    try {
      let audioBuffer: AudioBuffer;
      
      if (formatInfo.format === 'WAV' || formatInfo.format === 'OGG_OPUS' || formatInfo.format === 'MP3') {
        // Handle encoded audio formats
        try {
          audioBuffer = await this.audioContext!.decodeAudioData(bytes.buffer);
          this.log(`${timestamp} ✅ ${formatInfo.format} DECODE SUCCESS: chunk ${chunkInfo}, duration: ${audioBuffer.duration.toFixed(2)}s, sample rate: ${audioBuffer.sampleRate}Hz, channels: ${audioBuffer.numberOfChannels}, playback: ${formatInfo.playbackRate}x, context SR: ${this.audioContext?.sampleRate}Hz`);
        } catch (decodeError) {
          console.error(`${timestamp} ❌ ${formatInfo.format} DECODE FAILED: chunk ${chunkInfo}, error: ${decodeError.message}`);
          // Fallback to PCM decoding
          audioBuffer = await this.decodeRawPCM(bytes, chunkInfo, timestamp);
        }
      } else {
        // Handle raw PCM data (fallback)
        audioBuffer = await this.decodeRawPCM(bytes, chunkInfo, timestamp);
        if (!audioBuffer) return null;
      }
      
      return audioBuffer;
      
    } catch (decodeError) {
      console.error(`${timestamp} ❌ DECODE FAILED: chunk ${chunkInfo}, format: ${formatInfo.format}, error: ${decodeError.message}`);
      console.error(`${timestamp} 🔍 DEBUG INFO: bytes: ${bytes.length}, first bytes: ${Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}, context SR: ${this.audioContext?.sampleRate}Hz`);
      return null;
    }
  }

  // Enhanced raw PCM decoding
  private async decodeRawPCM(bytes: Uint8Array, chunkInfo: string, timestamp: string): Promise<AudioBuffer | null> {
    console.log(`${timestamp} 🔊 PCM FALLBACK: chunk ${chunkInfo}, processing as raw Linear16 PCM data`);
    
    const sampleRate = this.audioContext!.sampleRate; // Use context sample rate
    const numberOfChannels = 1; // Mono audio from Gemini
    
    // Convert bytes to 16-bit signed integers (Linear16 PCM)
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const numberOfSamples = samples.length;
    
    if (numberOfSamples === 0) {
      console.warn(`${timestamp} ⚠️ NO PCM SAMPLES: chunk ${chunkInfo}, no audio samples found`);
      return null;
    }
    
    // Create AudioBuffer
    const audioBuffer = this.audioContext!.createBuffer(numberOfChannels, numberOfSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Convert Int16 samples to Float32 (normalize to -1.0 to 1.0 range)
    for (let i = 0; i < numberOfSamples; i++) {
      channelData[i] = samples[i] / 32768.0; // Convert from 16-bit to float
    }
    
    console.log(`${timestamp} ✅ PCM SUCCESS: chunk ${chunkInfo}, duration: ${audioBuffer.duration.toFixed(2)}s, samples: ${numberOfSamples}, sample rate: ${sampleRate}Hz`);
    return audioBuffer;
  }

  // Enhanced audio buffer validation
  private validateAudioBuffer(audioBuffer: AudioBuffer, chunkInfo: string, timestamp: string): boolean {
    if (audioBuffer.duration < 0.001) { 
      console.warn(`${timestamp} ⚠️ DURATION TOO SHORT: chunk ${chunkInfo}, duration: ${audioBuffer.duration.toFixed(4)}s, might be empty or corrupted`);
      return false;
    }
    if (audioBuffer.duration > 10) {
      console.warn(`${timestamp} ⚠️ DURATION TOO LONG: chunk ${chunkInfo}, duration: ${audioBuffer.duration.toFixed(2)}s, might be corrupted`);
      return false;
    }
    return true;
  }

  // Enhanced method to create and play audio source with optimized cleanup
  private createAndPlayAudioSource(audioBuffer: AudioBuffer, chunkIndex: number, sessionId: string, playbackRate?: number): void {
    try {
      // Only stop existing audio if we're not in sequential playback
      if (!this.isPlayingSequentially) {
        this.forceStopAllAudioForSession(sessionId);
      }
      
      // Create and play immediately without delay
      this.createAudioSourceAndPlayInternal(audioBuffer, chunkIndex, sessionId, playbackRate);
    } catch (error) {
      console.error('❌ Error in createAndPlayAudioSource:', error);
    }
  }

  private createAudioSourceAndPlayInternal(audioBuffer: AudioBuffer, chunkIndex: number, sessionId: string, playbackRate?: number, onEnded?: () => void): void {
    try {
      // Don't stop existing audio - let it play naturally
      // This prevents the rapid start/stop cycle
      
      if (!this.audioContext) {
        console.error('❌ Audio context not available');
        onEnded?.(); // Resolve promise if no context
        return;
      }
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Set playback rate if provided
      if (playbackRate !== undefined) {
        source.playbackRate.setValueAtTime(playbackRate, this.audioContext.currentTime);
        this.log(`🎵 SETTING PLAYBACK RATE: chunk ${chunkIndex}, rate: ${playbackRate}x`);
      } else {
        this.log(`⚠️ NO PLAYBACK RATE: chunk ${chunkIndex}, using default`);
      }
      
      // Debug audio buffer content
      const channelData = audioBuffer.getChannelData(0);
      const samples = channelData.length;
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < samples; i++) {
        const sample = Math.abs(channelData[i]);
        sum += sample;
        peak = Math.max(peak, sample);
      }
      const average = sum / samples;
      this.log(`🔊 AUDIO DEBUG: chunk ${chunkIndex}, samples: ${samples}, avg: ${average.toFixed(4)}, peak: ${peak.toFixed(4)}, duration: ${audioBuffer.duration.toFixed(2)}s`);
      
      const gainNode = this.audioContext.createGain();
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Set volume based on audio analysis
      const volume = this.calculateDynamicVolume(audioBuffer);
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      
      // Track source by session
      if (!this.sessionAudioSources.has(sessionId)) {
        this.sessionAudioSources.set(sessionId, []);
      }
      this.sessionAudioSources.get(sessionId)!.push(source);
      
      // Update current source tracking
      this.currentAudioSource = source;
      
      const startTime = this.audioContext.currentTime;
      const duration = audioBuffer.duration;
      
      this.log(`🎛️ AUDIO SOURCE: chunk ${chunkIndex}, created source, total active: ${this.getTotalActiveSources()}, current source: YES, session: ${sessionId}, VERSION: ${this.version}, playback rate: ${source.playbackRate.value}x`);
      
      // Allow multiple sources for better audio continuity
      // This prevents the rapid start/stop cycle
      
      source.start(startTime);
      
      // Improved cleanup with session awareness
      const cleanup = () => {
        try {
          // Remove from session tracking
          const sessionSources = this.sessionAudioSources.get(sessionId);
          if (sessionSources) {
            const index = sessionSources.indexOf(source);
            if (index > -1) {
              sessionSources.splice(index, 1);
            }
          }
          
          // Update current source if this was it
          if (this.currentAudioSource === source) {
            this.currentAudioSource = null;
          }
          
          this.log(`✅ PLAYBACK END: chunk ${chunkIndex}, remaining active: ${this.getTotalActiveSources()}, session: ${sessionId}`);
          
          // Check for stuck audio after cleanup
          this.checkForStuckAudio();
          
          // Only call onEnded when audio actually finishes
          if (onEnded) {
            onEnded();
          }
        } catch (error) {
          console.error('❌ Error in audio source cleanup:', error);
          if (onEnded) {
            onEnded();
          }
        }
      };
      
      source.onended = cleanup;
      
      // Cleanup timeout - increased to prevent premature stopping
      // Only set timeout if we have a valid duration
      if (duration > 0) {
        setTimeout(() => {
          try {
            // Only stop if the source hasn't ended naturally
            source.stop();
            this.log(`⏰ FORCE STOPPING: chunk ${chunkIndex} after timeout`);
            if (onEnded) {
              onEnded();
            }
          } catch (error) {
            this.log(`⏰ Source already stopped for chunk ${chunkIndex}`);
            if (onEnded) {
              onEnded();
            }
          }
        }, (duration * 1000) + 5000); // Increased to 5000ms to prevent premature cutoff
      }
      
    } catch (error) {
      console.error('❌ Error creating audio source:', error);
      if (onEnded) {
        onEnded();
      }
    }
  }

  // NEW METHOD: Force stop all audio for a specific session
  private forceStopAllAudioForSession(sessionId: string): void {
    const sessionSources = this.sessionAudioSources.get(sessionId);
    if (sessionSources && sessionSources.length > 0) {
      this.log(`🛑 FORCE STOPPING SESSION: ${sessionId}, sources: ${sessionSources.length}`);
      
      sessionSources.forEach((source, index) => {
        try {
          source.stop();
          // Reduced logging to prevent spam
        } catch (error) {
          // Reduced logging to prevent spam
        }
      });
      
      // Clear session sources
      this.sessionAudioSources.set(sessionId, []);
      
      // Update current source if it was from this session
      if (this.currentAudioSource && sessionSources.includes(this.currentAudioSource)) {
        this.currentAudioSource = null;
      }
    }
  }

  // NEW METHOD: Get total active sources across all sessions
  private getTotalActiveSources(): number {
    let total = 0;
    for (const sources of this.sessionAudioSources.values()) {
      total += sources.length;
    }
    return total;
  }

  // ENHANCED METHOD: Force clear all audio with better session handling
  private forceClearAllAudio(): void {
    this.log('🚨 FORCE CLEARING ALL AUDIO', true);
    
    // Stop all sources across all sessions
    for (const [sessionId, sources] of this.sessionAudioSources.entries()) {
      this.log(`🛑 STOPPING AUDIO: ${sources.length} active sources being stopped for session ${sessionId}`);
      
      sources.forEach((source, index) => {
        try {
          source.stop();
          // Reduced logging to prevent spam
        } catch (error) {
          // Reduced logging to prevent spam
        }
      });
    }
    
    this.log('🛑 STOP COMPLETE: all sources cleared');
    
    // Clear all session sources
    this.sessionAudioSources.clear();
    this.currentAudioSource = null;
    
    this.log('✅ ALL AUDIO CLEARED');
  }

  // Update performance metrics
  private updatePerformanceMetrics(processingTime: number, success: boolean): void {
    this.performanceMetrics.totalChunksProcessed++;
    this.performanceMetrics.lastChunkTime = Date.now();
    
    if (success) {
      this.performanceMetrics.successfulDecodes++;
    } else {
      this.performanceMetrics.failedDecodes++;
    }
    
    // Update average decode time
    const totalTime = this.performanceMetrics.averageDecodeTime * (this.performanceMetrics.totalChunksProcessed - 1) + processingTime;
    this.performanceMetrics.averageDecodeTime = totalTime / this.performanceMetrics.totalChunksProcessed;
  }

  // Update speaking status
  private updateSpeakingStatus(isSpeaking: boolean): void {
    this.performanceMetrics.isCurrentlySpeaking = isSpeaking;
  }

  // Update speech quality assessment
  private updateSpeechQuality(audioBuffer: AudioBuffer, playbackRate: number): void {
    const channelData = audioBuffer.getChannelData(0);
    const samples = channelData.length;
    let sum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    
    // Calculate RMS, peak, and zero crossings for speech analysis
    for (let i = 0; i < samples; i++) {
      const sample = Math.abs(channelData[i]);
      sum += channelData[i] * channelData[i];
      peak = Math.max(peak, sample);
      
      // Count zero crossings (indicates speech frequency)
      if (i > 0 && (channelData[i] >= 0) !== (channelData[i-1] >= 0)) {
        zeroCrossings++;
      }
    }
    
    const rms = Math.sqrt(sum / samples);
    const dynamicRange = peak / (rms + 0.001);
    const frequency = zeroCrossings / (audioBuffer.duration * 2); // Approximate frequency
    
    // Enhanced speech quality assessment
    let quality = 'good';
    if (rms < 0.05) {
      quality = 'quiet';
    } else if (playbackRate > 0.8) {
      quality = 'fast';
    } else if (frequency < 100) {
      quality = 'low_freq';
    } else if (frequency > 8000) {
      quality = 'high_freq';
    }
    
    this.performanceMetrics.speechQuality = quality;
    
    // Log detailed speech analysis
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🎤 SPEECH ANALYSIS: RMS: ${rms.toFixed(3)}, Peak: ${peak.toFixed(3)}, Dynamic Range: ${dynamicRange.toFixed(1)}, Freq: ${frequency.toFixed(0)}Hz, Quality: ${quality}`);
  }

  // Method to handle session-based audio management with proper WAV chunking and adaptive optimization
  async playAudioResponse(audioData: string, index: number, total: number, sessionId?: string): Promise<void> {
    // Initialize the service if it hasn't been initialized yet
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const timestamp = this.getTimestamp();
    
    // Calculate adaptive playback parameters based on chunk characteristics
    const estimatedChunkSizeMs = audioData.length * 0.75; // Rough estimate of audio duration
    const adaptiveParams = this.calculateAdaptivePlaybackParams(estimatedChunkSizeMs, total);
    
    // Log adaptive optimization details
    this.logAdaptiveChunkOptimization(estimatedChunkSizeMs, total, adaptiveParams);
    
    this.log(`${timestamp} 📥 ADAPTIVE AUDIO IN: chunk ${index}/${total}, session: ${sessionId?.substring(0, 8)}..., size: ${audioData.length}B, estimated duration: ${Math.round(estimatedChunkSizeMs)}ms, chunks seen: [${Array.from(this.sessionChunksSeen).sort().join(',')}]`);
    
    // Handle new audio sessions - stop previous audio when new session starts
    if (sessionId && sessionId !== this.currentSessionId) {
      this.log(`${timestamp} 🔄 NEW SESSION: ${sessionId?.substring(0, 8)}... (was: ${this.currentSessionId?.substring(0, 8) || 'none'}), stopping ${this.getTotalActiveSources()} active sources`);
      
      // Only stop audio if we're not in the middle of playing a response
      if (!this.isPlayingSequentially && this.getTotalActiveSources() === 0) {
        this.stopCurrentAudio();
      } else {
        this.log(`${timestamp} ⏸️ KEEPING CURRENT AUDIO: Playing response in progress`);
      }
      
      this.currentSessionId = sessionId;
      this.cleanupSession(); // Use new cleanup method
      
      // Initialize session state for backend integration
      this.initializeSessionState(sessionId);
    }
    
    // Detect overlapping responses within same session (backend bug)
    // If we receive chunk 0 again after already having chunks, it's a new response
    if (sessionId === this.currentSessionId && index === 0 && this.sessionChunksSeen.size > 0) {
      this.log(`${timestamp} ⚠️ OVERLAP DETECTED: chunk 0 received again in session ${sessionId?.substring(0, 8)}..., had chunks: [${Array.from(this.sessionChunksSeen).sort().join(',')}], checking if current audio is finished`);
      
      // Only stop current audio if it's been more than 2 seconds since last chunk
      const timeSinceLastChunk = Date.now() - this.lastChunkTime;
      if (timeSinceLastChunk > 2000) {
        this.log(`${timestamp} 🛑 STOPPING AUDIO: ${timeSinceLastChunk}ms since last chunk, treating as new response`);
        this.stopCurrentAudio();
        this.cleanupSession(); // Use new cleanup method
      } else {
        this.log(`${timestamp} ⏸️ KEEPING AUDIO: Only ${timeSinceLastChunk}ms since last chunk, continuing current response`);
      }
      
      // Track turn for analytics
      if (this.config.turnTracking) {
        this.trackTurn('ai', Date.now() - this.sessionState.lastActivity, this.sessionChunksSeen.size);
      }
    }
    
    // Check for session timeout - if session is too old, treat as new session
    if (this.sessionStartTime > 0 && this.sessionChunksSeen.size > 0) {
      const sessionAge = Date.now() - this.sessionStartTime;
      if (sessionAge > this.config.sessionTimeout) {
        this.log(`${timestamp} ⏰ SESSION TIMEOUT: Session ${sessionId?.substring(0, 8)}... is ${sessionAge}ms old, treating as new session`);
        this.stopCurrentAudio();
        this.cleanupSession(); // Use new cleanup method
      }
    }
    
    // Check for stuck audio and recover if needed
    if (this.checkForStuckAudio()) {
      this.log(`${timestamp} 🔧 RECOVERED FROM STUCK AUDIO`);
    }
    
    // Track chunks we've seen for this session
    if (sessionId === this.currentSessionId) {
      this.sessionChunksSeen.add(index);
      this.log(`${timestamp} 📊 CHUNK TRACKING: added ${index}, now have: [${Array.from(this.sessionChunksSeen).sort().join(',')}]`);
    }
    
    // Prevent infinite loops by limiting chunk processing
    if (total > 100 && index > 100) {
      return;
    }
    
    // Check if audio data is empty or invalid
    if (!audioData || audioData.length < 10) {
      console.log(`${timestamp} 📝 EMPTY CHUNK: ${index}/${total} - skipping (size: ${audioData.length})`);
      return;
    }

    // Log audio preview for debugging
    const audioPreview = audioData.substring(0, 20) + '...';
    this.log(`${timestamp} 🎵 PROCESSING: chunk ${index}/${total}, preview: ${audioPreview}, active sources: ${this.getTotalActiveSources()}, adaptive params: ${JSON.stringify(adaptiveParams)}`);

    // QUEUE CHUNKS: Add to queue for sequential playback with adaptive parameters
    this.log(`${timestamp} 🎵 QUEUING ADAPTIVE CHUNK: ${index}/${total}`);
    this.queueAudioChunk(audioData, sessionId, index, total);
    
    // Set up timeout to force playback if we're waiting too long for missing chunks
    // Use adaptive timeout based on chunk size
    const adaptiveTimeout = Math.max(3000, estimatedChunkSizeMs * 2);
    this.setupPlaybackTimeout(sessionId, total, adaptiveTimeout);
    
    // Force playback after adaptive timeout if we have chunks but haven't started
    setTimeout(() => {
      if (this.audioQueue.length > 0 && !this.isPlayingSequentially && this.sessionChunksSeen.size > 0) {
        const timestamp = this.getTimestamp();
        this.log(`${timestamp} ⏰ FORCE PLAYBACK: After ${adaptiveTimeout}ms adaptive timeout, starting with ${this.audioQueue.length} queued chunks`);
        this.checkAndPlayConsecutiveChunks();
      }
    }, adaptiveTimeout);
    
    // Update session activity for backend monitoring
    this.sessionState.lastActivity = Date.now();
    this.performanceMetrics.sessionDuration = Date.now() - this.sessionState.startTime;
  }

  // NEW METHOD: Check if chunk is in expected sequence
  private isSequentialChunk(index: number, total: number): boolean {
    // If this is the first chunk (index 0), it's always sequential
    if (index === 0) return true;
    
    // If we have chunks seen, check if this is the next expected chunk
    if (this.sessionChunksSeen.size > 0) {
      const expectedNext = Math.max(...Array.from(this.sessionChunksSeen)) + 1;
      return index === expectedNext;
    }
    
    // If no chunks seen yet, any chunk is considered sequential
    return true;
  }

  // NEW METHOD: Check if we should wait for more chunks before processing
  private shouldWaitForMoreChunks(index: number, total: number): boolean {
    // If we have very few chunks, wait for more
    if (this.sessionChunksSeen.size < 3) return true;
    
    // If this is a high-index chunk but we're missing many lower chunks, wait
    const missingChunks = this.getMissingChunks();
    if (missingChunks.length > 5) return true;
    
    // If we have a large gap, wait for more chunks
    const maxGap = this.getMaxGap();
    if (maxGap > 3) return true;
    
    return false;
  }

  // NEW METHOD: Get missing chunks in sequence
  private getMissingChunks(): number[] {
    if (this.sessionChunksSeen.size === 0) return [];
    
    const chunks = Array.from(this.sessionChunksSeen).sort((a, b) => a - b);
    const missing: number[] = [];
    
    for (let i = chunks[0]; i <= chunks[chunks.length - 1]; i++) {
      if (!this.sessionChunksSeen.has(i)) {
        missing.push(i);
      }
    }
    
    return missing;
  }

  // NEW METHOD: Get maximum gap between chunks
  private getMaxGap(): number {
    if (this.sessionChunksSeen.size < 2) return 0;
    
    const chunks = Array.from(this.sessionChunksSeen).sort((a, b) => a - b);
    let maxGap = 0;
    
    for (let i = 1; i < chunks.length; i++) {
      const gap = chunks[i] - chunks[i - 1];
      maxGap = Math.max(maxGap, gap);
    }
    
    return maxGap;
  }

  // New method to set up timeout for missing chunks
  private setupPlaybackTimeout(sessionId: string | undefined, total: number, timeoutOverride?: number): void {
    // Clear any existing timeout
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
    }
    
    // Use provided timeoutOverride if available, otherwise calculate based on chunk size
    const finalTimeout = timeoutOverride !== undefined ? timeoutOverride : Math.max(3000, total * 100); // Default to 3s or 100ms per chunk
    
    // Set timeout to force playback after 1.5 seconds if we have chunks but haven't started playing
    this.playbackTimeoutId = setTimeout(() => {
      if (this.audioQueue.length > 0 && !this.isPlayingSequentially) {
        const timestamp = this.getTimestamp();
        console.log(`${timestamp} ⏰ TIMEOUT: Forcing playback after ${finalTimeout}ms wait, queue length: ${this.audioQueue.length}`);
        // Use the new consecutive chunk detection logic instead of direct playback
        this.checkAndPlayConsecutiveChunks();
      }
    }, finalTimeout);
    
    // Set up additional cleanup timeout for session management
    setTimeout(() => {
      const timeSinceLastChunk = Date.now() - this.lastChunkTime;
      if (timeSinceLastChunk > this.config.chunkTimeout && this.audioQueue.length === 0) {
        const timestamp = this.getTimestamp();
        this.log(`${timestamp} 🧹 CLEANUP: No chunks received for ${timeSinceLastChunk}ms, clearing session state`);
        this.sessionChunksSeen.clear();
        this.consecutiveChunkCount = 0;
        this.lastChunkTime = 0;
      }
    }, this.config.chunkTimeout);
  }

  // Enhanced method to handle multiple audio chunks in sequence
  async playAudioSequence(audioChunks: string[]): Promise<void> {
    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 🔊 SEQUENCE START: Playing audio sequence with ${audioChunks.length} chunks`);
    
    for (let i = 0; i < audioChunks.length; i++) {
      await this.playAudioChunk(audioChunks[i], this.currentSessionId || undefined, i, audioChunks.length);
      // Adaptive delay between chunks
      if (i < audioChunks.length - 1) {
        const delay = this.config.adaptivePlayback ? Math.max(50, this.config.chunkDelay - this.performanceMetrics.averageDecodeTime) : this.config.chunkDelay;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`${this.getTimestamp()} 🔊 SEQUENCE END: Completed audio sequence with ${audioChunks.length} chunks`);
  }

  // Method to resume audio context (call this on user interaction)
  async resumeAudioContext(): Promise<void> {
    // Initialize the service if it hasn't been initialized yet
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    if (this.audioContext && this.audioContext.state === 'suspended') {
      console.log('🔊 Resuming audio context on user interaction...');
      await this.audioContext.resume();
    }
  }

  // Get performance metrics
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      successRate: this.performanceMetrics.totalChunksProcessed > 0 
        ? (this.performanceMetrics.successfulDecodes / this.performanceMetrics.totalChunksProcessed * 100).toFixed(1) + '%'
        : '0%',
      averageDecodeTimeMs: this.performanceMetrics.averageDecodeTime.toFixed(1),
      isCurrentlyPlaying: this.currentAudioSource !== null,
      queueLength: this.audioQueue.length,
      activeSources: this.getTotalActiveSources(),
      // Backend integration metrics
      sessionDurationMs: this.performanceMetrics.sessionDuration,
      sessionDurationFormatted: this.formatDuration(this.performanceMetrics.sessionDuration),
      turnCount: this.performanceMetrics.turnCount,
      reconnectionCount: this.performanceMetrics.reconnectionCount,
      sessionHealthScore: this.performanceMetrics.sessionHealthScore,
      conversationState: this.performanceMetrics.conversationState,
      lastSessionRefresh: this.performanceMetrics.lastSessionRefresh,
      // Session state summary
      sessionId: this.sessionState.sessionId,
      sessionAge: this.sessionState.startTime > 0 ? Date.now() - this.sessionState.startTime : 0,
      lastActivity: this.sessionState.lastActivity,
      healthChecks: this.sessionState.healthChecks.length,
      reconnectionEvents: this.sessionState.reconnectionEvents.length,
      turnHistory: this.sessionState.turnHistory.length,
    };
  }

  // Helper method to format duration
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Check if audio is currently playing
  isAudioPlaying(): boolean {
    return this.currentAudioSource !== null || this.getTotalActiveSources() > 0;
  }

  // Update configuration
  updateConfig(newConfig: Partial<typeof this.config>) {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Audio service config updated:', this.config);
  }

  // Enhanced cleanup method
  cleanup() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.warn('Error closing audio context:', err);
      });
      this.audioContext = null;
    }
    
    // Clear session monitoring intervals
    if (this.sessionMonitoringInterval) {
      clearInterval(this.sessionMonitoringInterval);
      this.sessionMonitoringInterval = null;
    }
    if (this.sessionRefreshInterval) {
      clearInterval(this.sessionRefreshInterval);
      this.sessionRefreshInterval = null;
    }
    
    // Force stop all audio sources
    this.forceClearAllAudio();
    this.sessionAudioSources.clear(); // Clear session sources on cleanup
    this.currentAudioSource = null;
    this.playbackPromise = null;
    
    // Clear timeout
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
    
    this.audioChunks.clear();
    this.sessionChunksSeen.clear();
    this.currentSessionId = null;
    this.isPlaying = false;
    this.isPlayingSequentially = false;
    this.audioQueue = [];
    this.queueStartTime = null;
    
    // Reset session tracking
    this.sessionStartTime = 0;
    this.consecutiveChunkCount = 0;
    this.lastChunkTime = 0;
    this.lastStuckAudioCheck = 0;
    this.isInitialized = false;
    
    // Reset performance metrics
    this.performanceMetrics = {
      totalChunksProcessed: 0,
      successfulDecodes: 0,
      failedDecodes: 0,
      averageDecodeTime: 0,
      totalPlaybackTime: 0,
      lastChunkTime: 0,
      isCurrentlySpeaking: false,
      speechQuality: 'good',
      // Backend integration metrics
      sessionDuration: 0,
      turnCount: 0,
      reconnectionCount: 0,
      sessionHealthScore: 100,
      lastSessionRefresh: 0,
      conversationState: 'idle',
    };
  }
  
  // New method to handle session cleanup and recovery
  private cleanupSession(): void {
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🧹 SESSION CLEANUP: Clearing session state and resetting counters`);
    
    // Clear session tracking
    this.sessionChunksSeen.clear();
    this.consecutiveChunkCount = 0;
    this.lastChunkTime = 0;
    this.lastStuckAudioCheck = 0;
    this.sessionStartTime = Date.now();
    
    // Clear queue if it's been too long
    const queueAge = this.getQueueWaitTime();
    if (queueAge > this.config.sessionTimeout) {
      console.log(`${timestamp} ⏰ QUEUE TIMEOUT: Clearing old queue (age: ${queueAge}ms)`);
      this.audioQueue = [];
      this.queueStartTime = null;
    }
    
    // Reset playback state
    this.isPlayingSequentially = false;
    this.playbackPromise = null;
    
    // Clear timeout
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
  }
  
  // New method to check for stuck audio and recover
  private checkForStuckAudio(): boolean {
    const timestamp = this.getTimestamp();
    const now = Date.now();
    
    // Add cooldown to prevent excessive stuck audio checks
    const timeSinceLastCheck = now - this.lastStuckAudioCheck;
    if (timeSinceLastCheck < 10000) { // Increased from 5000ms to 10000ms
      return false;
    }
    
    const timeSinceLastChunk = now - this.lastChunkTime;
    const activeSources = this.getTotalActiveSources();
    
    // Only check for stuck audio if we have active sources and a reasonable time has passed
    // Increased timeout to be less aggressive and prevent false positives
    const hasStuckAudio = activeSources > 0 && timeSinceLastChunk > this.config.chunkTimeout * 3; // Increased from 2x to 3x
    
    if (hasStuckAudio) {
      console.log(`${timestamp} 🔧 STUCK AUDIO DETECTED: ${activeSources} sources, ${timeSinceLastChunk}ms since last chunk`);
      this.forceClearAllAudio();
      this.lastStuckAudioCheck = now;
      return true;
    }
    
    this.lastStuckAudioCheck = now;
    return false;
  }

  // Adaptive chunk optimization methods
  private calculateAdaptivePlaybackParams(chunkSizeMs: number, totalChunks: number): {
    playbackRate: number;
    volume: number;
    delay: number;
    fadeIn: number;
    fadeOut: number;
  } {
    if (!this.config.adaptiveChunkMode) {
      return {
        playbackRate: this.config.defaultPlaybackRate,
        volume: this.config.volume,
        delay: this.config.chunkDelay,
        fadeIn: this.config.fadeInDuration,
        fadeOut: this.config.fadeOutDuration
      };
    }

    // For larger chunks, we can use more aggressive optimizations
    const isLargeChunk = chunkSizeMs >= this.config.largeChunkThreshold;
    const isShortResponse = totalChunks <= 3;
    const isLongResponse = totalChunks > 10;

    let playbackRate = this.config.defaultPlaybackRate;
    let volume = this.config.volume;
    let delay = this.config.chunkDelay;
    let fadeIn = this.config.fadeInDuration;
    let fadeOut = this.config.fadeOutDuration;

    if (isLargeChunk) {
      // Larger chunks can handle slightly faster playback but stay natural
      playbackRate = Math.min(0.65, this.config.defaultPlaybackRate * 1.1); // Cap at 0.65x for natural speed
      delay = Math.max(2, this.config.chunkDelay * 0.5);
      fadeIn = this.config.fadeInDuration * 0.5;
      fadeOut = this.config.fadeOutDuration * 0.5;
    }

    if (isShortResponse) {
      // Short responses can be slightly faster but still natural
      playbackRate = Math.min(0.7, playbackRate * 1.05); // Cap at 0.7x for natural speed
      delay = Math.max(1, delay * 0.8);
    }

    if (isLongResponse) {
      // Long responses need more careful handling but still natural
      playbackRate = Math.max(0.4, playbackRate * 0.95); // Minimum 0.4x for natural sound
      delay = Math.min(10, delay * 1.2);
    }

    return {
      playbackRate,
      volume,
      delay,
      fadeIn,
      fadeOut
    };
  }

  private logAdaptiveChunkOptimization(chunkSizeMs: number, totalChunks: number, params: any): void {
    if (!this.config.verboseLogging) return;

    const timestamp = this.getTimestamp();
    console.log(`${timestamp} 🎵 ADAPTIVE CHUNK OPTIMIZATION:`, {
      chunkSize: `${Math.round(chunkSizeMs)}ms`,
      totalChunks,
      playbackRate: params.playbackRate.toFixed(2),
      delay: `${params.delay}ms`,
      efficiency: `${(chunkSizeMs / params.delay).toFixed(1)}x`
    });
  }

  // Method to reset audio service for continuous conversation
  public resetForContinuousConversation(): void {
    const timestamp = this.getTimestamp();
    this.log(`${timestamp} 🔄 RESETTING FOR CONTINUOUS CONVERSATION`);
    
    // Don't stop current audio - let it finish naturally
    // This prevents cutting off audio mid-response
    
    // Only clear session state, not active audio
    this.sessionChunksSeen.clear();
    this.sessionStartTime = 0;
    this.currentSessionId = null;
    
    // Clear audio queue for next response
    this.audioQueue = [];
    this.isPlayingSequentially = false;
    this.playbackPromise = null;
    
    // Clear timeouts
    if (this.playbackTimeoutId) {
      clearTimeout(this.playbackTimeoutId);
      this.playbackTimeoutId = null;
    }
    
    // Reset performance metrics for new conversation
    this.performanceMetrics.lastChunkTime = 0;
    this.performanceMetrics.isCurrentlySpeaking = false;
    
    this.log(`${timestamp} ✅ CONTINUOUS CONVERSATION RESET COMPLETE`);
  }
}

export const audioService = new AudioService(); 