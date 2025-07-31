import { io, Socket } from 'socket.io-client';
import { voiceActivityDetection } from './voiceActivityDetection';

export interface SessionStatus {
  status: 'waiting' | 'active' | 'ended';
  sessionId?: string;
  message?: string;
}

export interface AudioResponse {
  audio?: string;  // Frontend expected field
  chunk?: string;  // Backend actual field
  index: number;
  total: number;
  transcript?: string;
  sessionId?: string;  // Session ID for audio management
}

export interface TranscriptData {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface AIThinkingData {
  message?: string;
  timestamp: number;
}

export interface TranscriptionData {
  text: string;
  confidence?: number;
  timestamp: number;
}

export interface AIResponseTextData {
  text: string;
  timestamp: number;
}

export interface AITypingData {
  status: 'started' | 'finished';
  timestamp: number;
}

class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioChunkCount: number = 0;
  private _audioCompleted: boolean = false;
  private _processedChunks: Set<string> = new Set(); // Track processed chunks to prevent duplicates
  private _duplicateCount: number = 0; // Track duplicate count to reduce logging
  private _isConnecting: boolean = false; // Track connection state
  private _isConnected: boolean = false; // Track if already connected
  
  // Adaptive chunk sizing configuration
  private adaptiveChunkConfig = {
    // Chunk size ranges in milliseconds
    shortResponseChunkSize: 1000, // 1 second for short responses (≤3s)
    mediumResponseChunkSize: 2500, // 2.5 seconds for medium responses (3-10s)
    longResponseChunkSize: 4000, // 4 seconds for long responses (>10s)
    
    // Response length thresholds in seconds
    shortResponseThreshold: 3, // ≤3 seconds
    mediumResponseThreshold: 10, // 3-10 seconds
    
    // Transmission delay between chunks (reduced from 150ms to 50ms)
    transmissionDelay: 50,
    
    // Dynamic chunk sizing based on conversation context
    enableDynamicSizing: true,
    
    // Performance tracking
    trackChunkPerformance: true,
    chunkPerformanceStats: {
      totalChunks: 0,
      totalAudioTime: 0,
      totalTransmissionTime: 0,
      averageChunkSize: 0,
      averageTransmissionDelay: 0
    }
  };
  
  // WebSocket spam fix - Connection management
  private connectionManager = {
    maxReconnectAttempts: 3,
    reconnectDelay: 5000, // 5 seconds
    rateLimitDelay: 60000, // 60 seconds for rate limit
    connectionTimeout: 10000, // 10 seconds
    lastConnectionAttempt: 0,
    reconnectAttempts: 0,
    isRateLimited: false,
    rateLimitResetTime: 0,
    connectionHistory: [] as Array<{
      timestamp: number;
      success: boolean;
      error?: string;
    }>,
  };
  
  // Multi-port configuration
  private multiPortConfig = {
    enabled: false, // Disabled by default to prevent connection spam
    portCount: 3, // Number of parallel ports
    ports: [] as Socket[],
    currentPortIndex: 0,
    portLoadBalancing: 'round-robin' as 'round-robin' | 'least-loaded' | 'random',
    portHealthChecks: [] as boolean[],
    chunkDistribution: new Map<number, number>(), // Track which port handled which chunk
  };
  
  private aiEventCallbacks: {
    sessionStatus?: (data: SessionStatus) => void;
    audioResponse?: (data: AudioResponse) => void;
    transcript?: (data: TranscriptData) => void;
    aiThinking?: (data: AIThinkingData) => void;
    aiTyping?: (data: AITypingData) => void;
    transcription?: (data: TranscriptionData) => void;
    aiResponseText?: (data: AIResponseTextData) => void;
    aiFinished?: (data: any) => void;
    error?: (error: any) => void;
  } = {};

  async connect(userId: string = 'web-user'): Promise<void> {
    // Prevent multiple simultaneous connections
    if (this._isConnecting) {
      console.log('🔌 Connection already in progress, skipping...');
      return;
    }
    
    if (this._isConnected && this.socket?.connected) {
      console.log('🔌 Already connected, skipping...');
      return;
    }
    
    // Check rate limiting
    if (this.connectionManager.isRateLimited) {
      const timeUntilReset = this.connectionManager.rateLimitResetTime - Date.now();
      if (timeUntilReset > 0) {
        console.log(`⏰ Rate limited, waiting ${Math.ceil(timeUntilReset / 1000)} seconds...`);
        throw new Error(`Rate limited, try again in ${Math.ceil(timeUntilReset / 1000)} seconds`);
      } else {
        this.connectionManager.isRateLimited = false;
      }
    }
    
    // Check connection frequency
    const timeSinceLastAttempt = Date.now() - this.connectionManager.lastConnectionAttempt;
    if (timeSinceLastAttempt < 1000) { // Minimum 1 second between attempts
      console.log('⏰ Connection attempts too frequent, waiting...');
      throw new Error('Connection attempts too frequent, please wait');
    }
    
    try {
      this._isConnecting = true;
      this.connectionManager.lastConnectionAttempt = Date.now();
      console.log('🔌 Connecting to server...');
      
      if (this.multiPortConfig.enabled) {
        await this.connectMultiPort(userId);
      } else {
        await this.connectSinglePort(userId);
      }
      
      this._isConnected = true;
      this.connectionManager.reconnectAttempts = 0;
      this.connectionManager.connectionHistory.push({
        timestamp: Date.now(),
        success: true
      });
      console.log('✅ Connected to server successfully');
    } catch (error) {
      this._isConnected = false;
      this.connectionManager.connectionHistory.push({
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Handle rate limit errors
      if (error instanceof Error && error.message.includes('Too many connection attempts')) {
        this.handleRateLimitError();
      }
      
      console.error('❌ Failed to connect to server:', error);
      throw error;
    } finally {
      this._isConnecting = false;
    }
  }

  private handleRateLimitError(): void {
    console.log('🚫 Rate limit exceeded, setting rate limit state');
    this.connectionManager.isRateLimited = true;
    this.connectionManager.rateLimitResetTime = Date.now() + this.connectionManager.rateLimitDelay;
    
    // Schedule automatic reset
    setTimeout(() => {
      this.connectionManager.isRateLimited = false;
      console.log('✅ Rate limit reset, can attempt connection again');
    }, this.connectionManager.rateLimitDelay);
  }

  private async connectMultiPort(userId: string): Promise<void> {
    console.log('🔌 Connecting with multi-port configuration...');
    
    // Initialize ports array
    this.multiPortConfig.ports = [];
    this.multiPortConfig.portHealthChecks = [];
    
    // Connect to multiple ports
    const connectionPromises = [];
    for (let i = 0; i < this.multiPortConfig.portCount; i++) {
      const portPromise = this.connectToPort(userId, i);
      connectionPromises.push(portPromise);
    }
    
    // Wait for all connections
    await Promise.all(connectionPromises);
    
    // Set primary socket to the first port
    this.socket = this.multiPortConfig.ports[0];
    
    console.log(`✅ Multi-port connection established with ${this.multiPortConfig.portCount} ports`);
    
    // Setup event listeners for all ports
    this.setupMultiPortEventListeners();
  }

  private async connectSinglePort(userId: string): Promise<void> {
    this.socket = io(this.serverUrl, {
      query: { userId },
      transports: ['websocket', 'polling'],
      timeout: this.connectionManager.connectionTimeout,
      auth: { userId }, // Add auth for backend tracking
    });

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Failed to create socket connection'));
        return;
      }

      this.socket.on('connect', () => {
        console.log('✅ Single port connected:', this.socket?.id);
        this._isConnected = true;
        this.setupAIEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        this._isConnected = false;
        
        // Handle rate limit errors from backend
        if (error.message && error.message.includes('Too many connection attempts')) {
          this.handleRateLimitError();
          reject(new Error('Too many connection attempts. Please wait 60 seconds before trying again.'));
        } else {
          reject(error);
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('🔌 Disconnected:', reason);
        this._isConnected = false;
        
        // Handle reconnection for non-rate-limit disconnections
        if (reason !== 'io server disconnect' && !this.connectionManager.isRateLimited) {
          this.handleReconnection();
        }
      });
    });
  }

  private async handleReconnection(): Promise<void> {
    if (this.connectionManager.reconnectAttempts >= this.connectionManager.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached');
      return;
    }
    
    this.connectionManager.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.connectionManager.reconnectAttempts}/${this.connectionManager.maxReconnectAttempts}`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
      }
    }, this.connectionManager.reconnectDelay);
  }

  private async connectToPort(userId: string, portIndex: number): Promise<void> {
    const port = io(this.serverUrl, {
      query: { userId, portIndex },
      transports: ['websocket', 'polling'],
      timeout: this.connectionManager.connectionTimeout,
      auth: { userId }, // Add auth for backend tracking
    });

    return new Promise((resolve, reject) => {
      port.on('connect', () => {
        console.log(`✅ Port ${portIndex} connected:`, port.id);
        this.multiPortConfig.ports[portIndex] = port;
        this.multiPortConfig.portHealthChecks[portIndex] = true;
        resolve();
      });

      port.on('connect_error', (error) => {
        console.error(`❌ Port ${portIndex} connection error:`, error);
        this.multiPortConfig.portHealthChecks[portIndex] = false;
        
        // Handle rate limit errors from backend
        if (error.message && error.message.includes('Too many connection attempts')) {
          this.handleRateLimitError();
          reject(new Error('Too many connection attempts. Please wait 60 seconds before trying again.'));
        } else {
          reject(error);
        }
      });

      port.on('disconnect', (reason) => {
        console.log(`🔌 Port ${portIndex} disconnected:`, reason);
        this.multiPortConfig.portHealthChecks[portIndex] = false;
      });
    });
  }

  private setupMultiPortEventListeners(): void {
    // Setup event listeners for all ports
    this.multiPortConfig.ports.forEach((port, index) => {
      this.setupPortEventListeners(port, index);
    });
  }

  private setupPortEventListeners(port: Socket, portIndex: number): void {
    console.log(`🎧 Setting up event listeners for port ${portIndex}...`);
    
    // Add a catch-all listener to see what events are being sent (limited logging)
    port.onAny((eventName, ...args) => {
      // Only log non-audio events to reduce spam
      if (!eventName.includes('audio') && !eventName.includes('chunk')) {
        console.log(`🔍 Port ${portIndex} received event: ${eventName}`, args);
      }
    });

    port.on('session-status', (data) => {
      console.log(`Port ${portIndex} session status:`, data);
      if (this.aiEventCallbacks.sessionStatus) {
        this.aiEventCallbacks.sessionStatus(data);
      }
    });

    // Add the correct audio-chunk event listener
    port.on('audio-chunk', (data) => {
      // Create unique chunk identifier based on session and chunk index only
      const chunkId = `${data.sessionId}-${data.chunkIndex}`;
      
      // Check if we've already processed this exact chunk (same session, same index)
      if (this._processedChunks.has(chunkId)) {
        this._duplicateCount++;
        // Only log first few duplicates to reduce spam
        if (this._duplicateCount <= 3) {
          console.log(`🔄 Port ${portIndex} - True duplicate chunk detected, skipping:`, chunkId);
        } else if (this._duplicateCount === 4) {
          console.log('🔄 Too many duplicates detected, silencing duplicate logs...');
        }
        return;
      }
      
      // Mark chunk as processed
      this._processedChunks.add(chunkId);
      
      // Track which port handled this chunk
      this.multiPortConfig.chunkDistribution.set(data.chunkIndex || 0, portIndex);
      
      // Prevent memory leaks by limiting set size
      if (this._processedChunks.size > 1000) {
        console.log('🧹 Cleaning up processed chunks cache (preventing memory leak)');
        this._processedChunks.clear();
      }
      
      // Only log first few chunks to reduce spam
      if ((data.chunkIndex || 0) <= 2) {
        console.log(`🎵 Port ${portIndex} - Audio chunk received:`, data);
      }
      
      // Map backend data structure to frontend expected structure
      const mappedData: AudioResponse = {
        audio: data.audioData, // Backend sends 'audioData', frontend expects 'audio'
        chunk: data.audioData, // Also map to 'chunk' for compatibility
        index: data.chunkIndex || 0, // Backend sends 'chunkIndex', frontend expects 'index'
        total: data.totalChunks || 1, // Backend sends 'totalChunks', frontend expects 'total'
        transcript: data.transcript,
        sessionId: data.sessionId // Pass through sessionId for audio management
      };
      
      if (this.aiEventCallbacks.audioResponse) {
        this.aiEventCallbacks.audioResponse(mappedData);
      }
    });

    // Add audio-complete event listener
    port.on('audio-complete', (data) => {
      // Only log first few completion events to reduce spam
      if (!this._audioCompleted) {
        console.log(`✅ Port ${portIndex} - Audio streaming complete:`, data);
      }
      // Only trigger aiFinished callback once per session
      if (this.aiEventCallbacks.aiFinished && !this._audioCompleted) {
        this._audioCompleted = true;
        this.aiEventCallbacks.aiFinished(data);
      }
      // Always clear processed chunks after an AI response is complete
      this._processedChunks.clear();
      this._duplicateCount = 0; // Reset duplicate count for next response
      // Reset flag after a short delay
      setTimeout(() => {
        this._audioCompleted = false;
      }, 1000);
    });

    // Add text-response event listener (alternative to ai-response-text)
    port.on('text-response', (data) => {
      console.log(`📝 Port ${portIndex} - Text response received:`, data);
      if (this.aiEventCallbacks.aiResponseText) {
        this.aiEventCallbacks.aiResponseText(data);
      }
    });

    // Add health-response event listener
    port.on('health-response', (data) => {
      console.log(`🏥 Port ${portIndex} - Health check response:`, data);
    });

    // Add ai-thinking event listener
    port.on('ai-thinking', (data) => {
      console.log(`🤔 Port ${portIndex} - AI thinking:`, data);
      if (this.aiEventCallbacks.aiThinking) {
        this.aiEventCallbacks.aiThinking(data);
      }
    });

    // Add ai-typing event listener
    port.on('ai-typing', (data) => {
      console.log(`⌨️ Port ${portIndex} - AI typing:`, data);
      if (this.aiEventCallbacks.aiTyping) {
        this.aiEventCallbacks.aiTyping(data);
      }
    });

    // Add transcript event listener
    port.on('transcript', (data) => {
      console.log(`📝 Port ${portIndex} - Transcript:`, data);
      if (this.aiEventCallbacks.transcript) {
        this.aiEventCallbacks.transcript(data);
      }
    });

    // Add transcription event listener
    port.on('transcription', (data) => {
      console.log(`🎤 Port ${portIndex} - Transcription:`, data);
      if (this.aiEventCallbacks.transcription) {
        this.aiEventCallbacks.transcription(data);
      }
    });

    // Add ai-response-text event listener
    port.on('ai-response-text', (data) => {
      console.log(`📄 Port ${portIndex} - AI response text:`, data);
      if (this.aiEventCallbacks.aiResponseText) {
        this.aiEventCallbacks.aiResponseText(data);
      }
    });

    // Add error event listener
    port.on('error', (error) => {
      console.error(`❌ Port ${portIndex} - Error:`, error);
      if (this.aiEventCallbacks.error) {
        this.aiEventCallbacks.error(error);
      }
    });
  }

  private setupAIEventListeners() {
    if (!this.socket) return;
    
    console.log('🎧 Setting up AI event listeners immediately on connection...');
    
    // Add a catch-all listener to see what events are being sent (limited logging)
    this.socket.onAny((eventName, ...args) => {
      // Only log non-audio events to reduce spam
      if (!eventName.includes('audio') && !eventName.includes('chunk')) {
        console.log(`🔍 Received event: ${eventName}`, args);
      }
    });
    
    this.socket.on('session-status', (data) => {
      console.log('Session status:', data);
      if (this.aiEventCallbacks.sessionStatus) {
        this.aiEventCallbacks.sessionStatus(data);
      }
    });

    // Removed duplicate audio-response listener - backend sends audio-chunk events

    // Add the correct audio-chunk event listener
    this.socket.on('audio-chunk', (data) => {
      // Create unique chunk identifier based on session and chunk index only
      // (Don't use audio content - WAV chunks have similar headers and can be flagged as duplicates)
      const chunkId = `${data.sessionId}-${data.chunkIndex}`;
      
      // Check if we've already processed this exact chunk (same session, same index)
      if (this._processedChunks.has(chunkId)) {
        this._duplicateCount++;
        // Only log first few duplicates to reduce spam
        if (this._duplicateCount <= 3) {
          console.log('🔄 True duplicate chunk detected (same session + index), skipping:', chunkId);
        } else if (this._duplicateCount === 4) {
          console.log('🔄 Too many duplicates detected, silencing duplicate logs...');
        }
        return;
      }
      
      // Mark chunk as processed
      this._processedChunks.add(chunkId);
      
      // Prevent memory leaks by limiting set size
      if (this._processedChunks.size > 1000) {
        console.log('🧹 Cleaning up processed chunks cache (preventing memory leak)');
        this._processedChunks.clear();
      }
      
      // Only log first few chunks to reduce spam
      if ((data.chunkIndex || 0) <= 2) {
        console.log('🎵 Audio chunk received:', data);
      }
      
      // Map backend data structure to frontend expected structure
      const mappedData: AudioResponse = {
        audio: data.audioData, // Backend sends 'audioData', frontend expects 'audio'
        chunk: data.audioData, // Also map to 'chunk' for compatibility
        index: data.chunkIndex || 0, // Backend sends 'chunkIndex', frontend expects 'index'
        total: data.totalChunks || 1, // Backend sends 'totalChunks', frontend expects 'total'
        transcript: data.transcript,
        sessionId: data.sessionId // Pass through sessionId for audio management
      };
      
      if (this.aiEventCallbacks.audioResponse) {
        this.aiEventCallbacks.audioResponse(mappedData);
      }
    });

    // Add audio-complete event listener
    this.socket.on('audio-complete', (data) => {
      // Only log first few completion events to reduce spam
      if (!this._audioCompleted) {
        console.log('✅ Audio streaming complete:', data);
      }
      // Only trigger aiFinished callback once per session
      if (this.aiEventCallbacks.aiFinished && !this._audioCompleted) {
        this._audioCompleted = true;
        this.aiEventCallbacks.aiFinished(data);
      }
      // Always clear processed chunks after an AI response is complete
      this._processedChunks.clear();
      this._duplicateCount = 0; // Reset duplicate count for next response
      // Reset flag immediately for continuous conversation
      this._audioCompleted = false;
    });

    // Add text-response event listener (alternative to ai-response-text)
    this.socket.on('text-response', (data) => {
      console.log('📝 Text response received:', data);
      if (this.aiEventCallbacks.aiResponseText) {
        this.aiEventCallbacks.aiResponseText(data);
      }
    });

    // Add health-response event listener
    this.socket.on('health-response', (data) => {
      console.log('🏥 Health check response:', data);
    });

    // Add ai-thinking event listener
    this.socket.on('ai-thinking', (data) => {
      console.log('🤔 AI thinking:', data);
      if (this.aiEventCallbacks.aiThinking) {
        this.aiEventCallbacks.aiThinking(data);
      }
    });

    // Add ai-typing event listener
    this.socket.on('ai-typing', (data) => {
      console.log('⌨️ AI typing:', data);
      if (this.aiEventCallbacks.aiTyping) {
        this.aiEventCallbacks.aiTyping(data);
      }
    });

    // Add transcript event listener
    this.socket.on('transcript', (data) => {
      console.log('📝 Transcript:', data);
      if (this.aiEventCallbacks.transcript) {
        this.aiEventCallbacks.transcript(data);
      }
    });

    // Add transcription event listener
    this.socket.on('transcription', (data) => {
      console.log('🎤 Transcription:', data);
      if (this.aiEventCallbacks.transcription) {
        this.aiEventCallbacks.transcription(data);
      }
    });

    // Add ai-response-text event listener
    this.socket.on('ai-response-text', (data) => {
      console.log('📄 AI response text:', data);
      if (this.aiEventCallbacks.aiResponseText) {
        this.aiEventCallbacks.aiResponseText(data);
      }
    });

    // Add error event listener
    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      if (this.aiEventCallbacks.error) {
        this.aiEventCallbacks.error(error);
      }
    });
  }

  disconnect() {
    if (this.multiPortConfig.enabled) {
      // Disconnect all ports
      this.multiPortConfig.ports.forEach((port, index) => {
        if (port) {
          console.log(`🔌 Disconnecting port ${index}`);
          port.disconnect();
        }
      });
      this.multiPortConfig.ports = [];
      this.multiPortConfig.portHealthChecks = [];
    } else if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = null;
    this._isConnected = false;
    this._isConnecting = false;
  }

  // Add cleanup method for component unmount
  cleanup() {
    console.log('🧹 Cleaning up socket service...');
    this.disconnect();
    this._processedChunks.clear();
    this._duplicateCount = 0;
    this.audioChunks = [];
    this.audioChunkCount = 0;
    this._audioCompleted = false;
    
    // Reset connection management
    this.connectionManager.reconnectAttempts = 0;
    this.connectionManager.isRateLimited = false;
    this.connectionManager.rateLimitResetTime = 0;
    this.connectionManager.lastConnectionAttempt = 0;
    this._isConnecting = false;
    this._isConnected = false;
    
    // Stop media recording if active
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    // Stop media stream if active
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    console.log('✅ Socket service cleanup complete');
  }

  startConversation() {
    if (!this.socket) return;
    this.socket.emit('start-conversation');
  }

  endConversation() {
    if (!this.socket) return;
    this.socket.emit('end-conversation');
  }

  async startRecording(): Promise<void> {
    try {
      // Request microphone permission
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      // Start recording
      this.startMediaRecorder();
      
      console.log('🎤 Recording started');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      throw error;
    }
  }

  private startMediaRecorder(): void {
    if (!this.mediaRecorder) return;
    
    this.audioChunks = [];
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        this.sendAudioChunk(event.data);
      }
    };
    
    this.mediaRecorder.onstop = () => {
      console.log('🛑 Recording stopped');
      this.stopMediaRecorder();
    };
    
    // Use adaptive chunk sizing instead of fixed 1-second chunks
    const adaptiveChunkSize = this.calculateAdaptiveChunkSize();
    console.log('🎵 STARTING ADAPTIVE RECORDING:', {
      chunkSize: `${adaptiveChunkSize}ms`,
      transmissionDelay: `${this.adaptiveChunkConfig.transmissionDelay}ms`,
      expectedEfficiency: `${(adaptiveChunkSize / this.adaptiveChunkConfig.transmissionDelay).toFixed(1)}x improvement`
    });
    
    // Start recording with adaptive timeslices for optimized streaming
    this.mediaRecorder.start(adaptiveChunkSize);
  }

  private stopMediaRecorder(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  private async sendAudioChunk(blob: Blob) {
    if (!this.socket) return;

    const startTime = performance.now();
    const chunkSizeMs = blob.size / 1024; // Approximate size in KB for tracking

    // Convert blob to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result?.toString().split(',')[1];
      if (base64Audio) {
        // Only log every 10th chunk to reduce spam
        if (!this.audioChunkCount) this.audioChunkCount = 0;
        this.audioChunkCount++;
        
        if (this.audioChunkCount % 50 === 0) {
          console.log('🔊 SENDING ADAPTIVE AUDIO CHUNK TO AI:', {
            chunkNumber: this.audioChunkCount,
            chunkSize: blob.size,
            chunkSizeMs: Math.round(chunkSizeMs),
            transmissionDelay: this.adaptiveChunkConfig.transmissionDelay
          });
        }
        
        // Apply adaptive transmission delay
        setTimeout(() => {
          if (this.multiPortConfig.enabled) {
            // Use load balancing to distribute chunks across ports
            const targetPort = this.getLoadBalancedPort();
            targetPort.emit('audio-chunk', { audio: base64Audio });
          } else {
            this.socket!.emit('audio-chunk', { audio: base64Audio });
          }
          
          // Track performance metrics
          const transmissionTime = performance.now() - startTime;
          this.updateChunkPerformanceStats(chunkSizeMs, transmissionTime);
        }, this.adaptiveChunkConfig.transmissionDelay);
      }
    };
    reader.readAsDataURL(blob);
  }

  private getLoadBalancedPort(): Socket {
    switch (this.multiPortConfig.portLoadBalancing) {
      case 'round-robin':
        const port = this.multiPortConfig.ports[this.multiPortConfig.currentPortIndex];
        this.multiPortConfig.currentPortIndex = (this.multiPortConfig.currentPortIndex + 1) % this.multiPortConfig.portCount;
        return port;
      
      case 'least-loaded':
        // Find port with least chunks processed
        let minChunks = Infinity;
        let leastLoadedPortIndex = 0;
        
        for (let i = 0; i < this.multiPortConfig.portCount; i++) {
          const portChunks = Array.from(this.multiPortConfig.chunkDistribution.values())
            .filter(portIndex => portIndex === i).length;
          
          if (portChunks < minChunks && this.multiPortConfig.portHealthChecks[i]) {
            minChunks = portChunks;
            leastLoadedPortIndex = i;
          }
        }
        return this.multiPortConfig.ports[leastLoadedPortIndex];
      
      case 'random':
        const healthyPorts = this.multiPortConfig.ports.filter((_, index) => 
          this.multiPortConfig.portHealthChecks[index]
        );
        const randomIndex = Math.floor(Math.random() * healthyPorts.length);
        return healthyPorts[randomIndex];
      
      default:
        return this.multiPortConfig.ports[0];
    }
  }

  interrupt() {
    if (!this.socket) return;
    this.socket.emit('interrupt');
  }

  onSessionStatus(callback: (data: SessionStatus) => void) {
    this.aiEventCallbacks.sessionStatus = callback;
  }

  onAISpeaking(callback: (data: any) => void) {
    // Keep this for backward compatibility
    if (!this.socket) return;
    this.socket.on('ai-speaking', callback);
  }

  onAudioResponse(callback: (data: AudioResponse) => void) {
    this.aiEventCallbacks.audioResponse = callback;
  }

  onAIFinished(callback: (data: any) => void) {
    this.aiEventCallbacks.aiFinished = callback;
  }

  onError(callback: (error: any) => void) {
    this.aiEventCallbacks.error = callback;
  }

  onTranscript(callback: (data: TranscriptData) => void) {
    this.aiEventCallbacks.transcript = callback;
  }

  onAIThinking(callback: (data: AIThinkingData) => void) {
    this.aiEventCallbacks.aiThinking = callback;
  }

  onTranscription(callback: (data: TranscriptionData) => void) {
    this.aiEventCallbacks.transcription = callback;
  }

  onAIResponseText(callback: (data: AIResponseTextData) => void) {
    this.aiEventCallbacks.aiResponseText = callback;
  }

  onAITyping(callback: (data: AITypingData) => void) {
    this.aiEventCallbacks.aiTyping = callback;
  }

  getSessionId(): string | null {
    return this.socket?.id || null;
  }

  // Add method to check connection status
  isConnected(): boolean {
    return this._isConnected && (this.socket?.connected || false);
  }

  // Add method to check if connecting
  isConnecting(): boolean {
    return this._isConnecting;
  }

  // Get connection statistics for health monitoring
  getConnectionStats() {
    const now = Date.now();
    const recentConnections = this.connectionManager.connectionHistory.filter(
      conn => now - conn.timestamp < 60000 // Last minute
    );
    
    return {
      isConnected: this._isConnected,
      isConnecting: this._isConnecting,
      isRateLimited: this.connectionManager.isRateLimited,
      rateLimitResetTime: this.connectionManager.rateLimitResetTime,
      reconnectAttempts: this.connectionManager.reconnectAttempts,
      maxReconnectAttempts: this.connectionManager.maxReconnectAttempts,
      connectionHistory: this.connectionManager.connectionHistory.length,
      recentConnections: recentConnections.length,
      successfulConnections: recentConnections.filter(c => c.success).length,
      failedConnections: recentConnections.filter(c => !c.success).length,
      timeUntilRateLimitReset: this.connectionManager.isRateLimited 
        ? Math.max(0, this.connectionManager.rateLimitResetTime - now)
        : 0,
    };
  }

  // Check if rate limited
  isRateLimited(): boolean {
    return this.connectionManager.isRateLimited;
  }

  // Get time until rate limit reset
  getTimeUntilRateLimitReset(): number {
    if (!this.connectionManager.isRateLimited) return 0;
    return Math.max(0, this.connectionManager.rateLimitResetTime - Date.now());
  }

  async getSessionInfo(): Promise<any> {
    const sessionId = this.getSessionId();
    if (!sessionId) {
      throw new Error('No session ID available');
    }
    
    try {
      const response = await fetch(`${this.serverUrl}/api/session/${sessionId}`);
      if (!response.ok) {
        throw new Error(`Failed to get session info: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error getting session info:', error);
      throw error;
    }
  }

  removeAllListeners() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    // Clear stored callbacks
    this.aiEventCallbacks = {};
  }

  // Public method to emit stop-speaking event
  stopSpeaking(transcription?: string) {
    if (this.socket) {
      console.log('🛑 SENDING STOP-SPEAKING TO AI:', {
        transcription: transcription || 'User finished speaking',
        timestamp: new Date().toISOString()
      });
      this.socket.emit('stop-speaking', {
        transcription: transcription || 'User finished speaking',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Get multi-port statistics
  getMultiPortStats() {
    if (!this.multiPortConfig.enabled) {
      return { enabled: false };
    }

    const portStats = this.multiPortConfig.ports.map((port, index) => ({
      portIndex: index,
      connected: port?.connected || false,
      healthy: this.multiPortConfig.portHealthChecks[index] || false,
      chunksProcessed: Array.from(this.multiPortConfig.chunkDistribution.values())
        .filter(portIndex => portIndex === index).length
    }));

    return {
      enabled: true,
      portCount: this.multiPortConfig.portCount,
      loadBalancing: this.multiPortConfig.portLoadBalancing,
      portStats,
      totalChunksProcessed: this.multiPortConfig.chunkDistribution.size,
      currentPortIndex: this.multiPortConfig.currentPortIndex
    };
  }

  // Update multi-port configuration
  updateMultiPortConfig(config: Partial<typeof this.multiPortConfig>) {
    Object.assign(this.multiPortConfig, config);
    console.log('🔧 Multi-port configuration updated:', this.multiPortConfig);
  }

  // Adaptive chunk sizing methods
  private calculateAdaptiveChunkSize(responseLengthSeconds?: number): number {
    if (!this.adaptiveChunkConfig.enableDynamicSizing) {
      return this.adaptiveChunkConfig.shortResponseChunkSize;
    }

    // If we have response length data, use it for sizing
    if (responseLengthSeconds !== undefined) {
      if (responseLengthSeconds <= this.adaptiveChunkConfig.shortResponseThreshold) {
        return this.adaptiveChunkConfig.shortResponseChunkSize;
      } else if (responseLengthSeconds <= this.adaptiveChunkConfig.mediumResponseThreshold) {
        return this.adaptiveChunkConfig.mediumResponseChunkSize;
      } else {
        return this.adaptiveChunkConfig.longResponseChunkSize;
      }
    }

    // Default to medium chunk size for unknown response lengths
    return this.adaptiveChunkConfig.mediumResponseChunkSize;
  }

  private updateChunkPerformanceStats(chunkSizeMs: number, transmissionTimeMs: number): void {
    if (!this.adaptiveChunkConfig.trackChunkPerformance) return;

    const stats = this.adaptiveChunkConfig.chunkPerformanceStats;
    stats.totalChunks++;
    stats.totalAudioTime += chunkSizeMs;
    stats.totalTransmissionTime += transmissionTimeMs;
    
    // Calculate averages
    stats.averageChunkSize = stats.totalAudioTime / stats.totalChunks;
    stats.averageTransmissionDelay = stats.totalTransmissionTime / stats.totalChunks;

    // Log performance improvements every 10 chunks
    if (stats.totalChunks % 10 === 0) {
      const efficiencyRatio = stats.averageChunkSize / stats.averageTransmissionDelay;
      console.log('📊 ADAPTIVE CHUNK PERFORMANCE:', {
        totalChunks: stats.totalChunks,
        averageChunkSize: `${Math.round(stats.averageChunkSize)}ms`,
        averageTransmissionDelay: `${Math.round(stats.averageTransmissionDelay)}ms`,
        efficiencyRatio: `${efficiencyRatio.toFixed(1)}x improvement`,
        overheadReduction: `${((1 - stats.averageTransmissionDelay / stats.averageChunkSize) * 100).toFixed(1)}%`
      });
    }
  }

  // Method to reset for continuous conversation
  public resetForContinuousConversation(): void {
    console.log('🔄 RESETTING SOCKET SERVICE FOR CONTINUOUS CONVERSATION');
    
    // Reset audio completion flag
    this._audioCompleted = false;
    
    // Clear processed chunks
    this._processedChunks.clear();
    this._duplicateCount = 0;
    
    // Reset audio chunk count
    this.audioChunkCount = 0;
    
    // Don't disconnect or clear connection state
    // This allows for continuous conversation without losing the socket connection
    
    console.log('✅ SOCKET SERVICE RESET COMPLETE');
  }

  // Configuration and performance methods
  updateAdaptiveChunkConfig(config: Partial<typeof this.adaptiveChunkConfig>): void {
    Object.assign(this.adaptiveChunkConfig, config);
    console.log('🔧 Adaptive chunk configuration updated:', this.adaptiveChunkConfig);
  }

  getAdaptiveChunkConfig() {
    return { ...this.adaptiveChunkConfig };
  }

  getChunkPerformanceStats() {
    return this.adaptiveChunkConfig.chunkPerformanceStats;
  }

  // Method to calculate expected performance improvements
  calculatePerformanceImprovement(responseLengthSeconds: number): {
    oldChunks: number;
    newChunks: number;
    improvement: string;
    efficiencyGain: number;
  } {
    const oldChunkSize = 1000; // Old 1-second chunks
    const oldTransmissionDelay = 150; // Old 150ms delay
    const newChunkSize = this.calculateAdaptiveChunkSize(responseLengthSeconds);
    const newTransmissionDelay = this.adaptiveChunkConfig.transmissionDelay;

    const oldChunks = Math.ceil((responseLengthSeconds * 1000) / oldChunkSize);
    const newChunks = Math.ceil((responseLengthSeconds * 1000) / newChunkSize);

    const oldTotalTime = oldChunks * (oldChunkSize + oldTransmissionDelay);
    const newTotalTime = newChunks * (newChunkSize + newTransmissionDelay);
    const improvement = ((oldTotalTime - newTotalTime) / oldTotalTime * 100).toFixed(1);
    const efficiencyGain = (newChunkSize / newTransmissionDelay) / (oldChunkSize / oldTransmissionDelay);

    return {
      oldChunks,
      newChunks,
      improvement: `${improvement}% faster`,
      efficiencyGain: Number(efficiencyGain.toFixed(1))
    };
  }
}

export const socketService = new SocketService();

// Add this function for standalone stop-speaking
export const stopSpeaking = (transcription?: string) => {
  socketService.stopSpeaking(transcription);
}; 