import { io, Socket } from 'socket.io-client';

export interface WebSocketConfig {
  serverUrl: string;
  userId: string;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  rateLimitDelay: number;
  connectionTimeout: number;
  minConnectionInterval: number;
}

export interface ConnectionStats {
  isConnected: boolean;
  isConnecting: boolean;
  isRateLimited: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  timeUntilRateLimitReset: number;
  connectionHistory: number;
  recentConnections: number;
  successfulConnections: number;
  failedConnections: number;
}

export class WebSocketManager {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private isConnected: boolean = false;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private isRateLimited: boolean = false;
  private rateLimitResetTime: number = 0;
  private lastConnectionAttempt: number = 0;
  private connectionHistory: Array<{
    timestamp: number;
    success: boolean;
    error?: string;
  }> = [];

  // Event callbacks
  private eventCallbacks: {
    connect?: () => void;
    disconnect?: (reason: string) => void;
    error?: (error: any) => void;
    rateLimit?: (timeUntilReset: number) => void;
  } = {};

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      serverUrl: import.meta.env.VITE_SERVER_URL || 'http://localhost:3000',
      userId: 'web-user',
      maxReconnectAttempts: 3,
      reconnectDelay: 5000, // 5 seconds
      rateLimitDelay: 60000, // 60 seconds
      connectionTimeout: 10000, // 10 seconds
      minConnectionInterval: 1000, // 1 second minimum between attempts
      ...config
    };
  }

  /**
   * Connect to the WebSocket server with rate limiting and reconnection logic
   */
  async connect(): Promise<void> {
    // Prevent multiple simultaneous connections
    if (this.isConnecting) {
      console.log('🔌 Connection already in progress, skipping...');
      return;
    }

    if (this.isConnected && this.socket?.connected) {
      console.log('🔌 Already connected, skipping...');
      return;
    }

    // Check rate limiting
    if (this.isRateLimited) {
      const timeUntilReset = this.rateLimitResetTime - Date.now();
      if (timeUntilReset > 0) {
        const error = new Error(`Rate limited, try again in ${Math.ceil(timeUntilReset / 1000)} seconds`);
        console.log(`⏰ Rate limited, waiting ${Math.ceil(timeUntilReset / 1000)} seconds...`);
        this.recordConnectionAttempt(false, error.message);
        throw error;
      } else {
        this.isRateLimited = false;
      }
    }

    // Check connection frequency
    const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt;
    if (timeSinceLastAttempt < this.config.minConnectionInterval) {
      const error = new Error('Connection attempts too frequent, please wait');
      console.log('⏰ Connection attempts too frequent, waiting...');
      this.recordConnectionAttempt(false, error.message);
      throw error;
    }

    try {
      this.isConnecting = true;
      this.lastConnectionAttempt = Date.now();
      console.log('🔌 Connecting to server...');

      this.socket = io(this.config.serverUrl, {
        query: { userId: this.config.userId },
        transports: ['websocket', 'polling'],
        timeout: this.config.connectionTimeout,
        auth: { userId: this.config.userId },
      });

      return new Promise((resolve, reject) => {
        if (!this.socket) {
          const error = new Error('Failed to create socket connection');
          this.recordConnectionAttempt(false, error.message);
          reject(error);
          return;
        }

        this.socket!.on('connect', () => {
          console.log('✅ Connected to server successfully');
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.recordConnectionAttempt(true);
          this.setupEventListeners();
          this.eventCallbacks.connect?.();
          resolve();
        });

        this.socket!.on('connect_error', (error) => {
          console.error('❌ Connection error:', error);
          this.isConnected = false;
          this.isConnecting = false;

          // Handle rate limit errors from backend
          if (error.message && error.message.includes('Too many connection attempts')) {
            this.handleRateLimitError();
            const rateLimitError = new Error('Too many connection attempts. Please wait 60 seconds before trying again.');
            this.recordConnectionAttempt(false, rateLimitError.message);
            reject(rateLimitError);
          } else {
            this.recordConnectionAttempt(false, error.message);
            reject(error);
          }
        });

        this.socket!.on('disconnect', (reason) => {
          console.log('🔌 Disconnected:', reason);
          this.isConnected = false;
          this.eventCallbacks.disconnect?.(reason);

          // Handle reconnection for non-rate-limit disconnections
          if (reason !== 'io server disconnect' && !this.isRateLimited) {
            this.handleReconnection();
          }
        });
      });
    } catch (error) {
      this.isConnecting = false;
      this.isConnected = false;
      this.recordConnectionAttempt(false, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting from server...');
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }

  /**
   * Handle rate limit errors from the backend
   */
  private handleRateLimitError(): void {
    console.log('🚫 Rate limit exceeded, setting rate limit state');
    this.isRateLimited = true;
    this.rateLimitResetTime = Date.now() + this.config.rateLimitDelay;

    // Schedule automatic reset
    setTimeout(() => {
      this.isRateLimited = false;
      console.log('✅ Rate limit reset, can attempt connection again');
    }, this.config.rateLimitDelay);

    // Notify callback
    this.eventCallbacks.rateLimit?.(this.config.rateLimitDelay);
  }

  /**
   * Handle automatic reconnection
   */
  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
      }
    }, this.config.reconnectDelay);
  }

  /**
   * Setup event listeners for the socket
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      this.eventCallbacks.error?.(error);
    });
  }

  /**
   * Record connection attempt for statistics
   */
  private recordConnectionAttempt(success: boolean, error?: string): void {
    this.connectionHistory.push({
      timestamp: Date.now(),
      success,
      error
    });

    // Keep only last 100 connection attempts to prevent memory leaks
    if (this.connectionHistory.length > 100) {
      this.connectionHistory = this.connectionHistory.slice(-100);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): ConnectionStats {
    const now = Date.now();
    const recentConnections = this.connectionHistory.filter(
      conn => now - conn.timestamp < 60000 // Last minute
    );

    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      isRateLimited: this.isRateLimited,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      timeUntilRateLimitReset: this.isRateLimited 
        ? Math.max(0, this.rateLimitResetTime - now)
        : 0,
      connectionHistory: this.connectionHistory.length,
      recentConnections: recentConnections.length,
      successfulConnections: recentConnections.filter(c => c.success).length,
      failedConnections: recentConnections.filter(c => !c.success).length,
    };
  }

  /**
   * Check if currently connected
   */
  isCurrentlyConnected(): boolean {
    return this.isConnected && (this.socket?.connected || false);
  }

  /**
   * Check if rate limited
   */
  isCurrentlyRateLimited(): boolean {
    return this.isRateLimited;
  }

  /**
   * Get time until rate limit reset
   */
  getTimeUntilRateLimitReset(): number {
    if (!this.isRateLimited) return 0;
    return Math.max(0, this.rateLimitResetTime - Date.now());
  }

  /**
   * Get the underlying socket for event handling
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Set event callbacks
   */
  onConnect(callback: () => void): void {
    this.eventCallbacks.connect = callback;
  }

  onDisconnect(callback: (reason: string) => void): void {
    this.eventCallbacks.disconnect = callback;
  }

  onError(callback: (error: any) => void): void {
    this.eventCallbacks.error = callback;
  }

  onRateLimit(callback: (timeUntilReset: number) => void): void {
    this.eventCallbacks.rateLimit = callback;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    console.log('🧹 Cleaning up WebSocket manager...');
    this.disconnect();
    this.connectionHistory = [];
    this.reconnectAttempts = 0;
    this.isRateLimited = false;
    this.rateLimitResetTime = 0;
    this.lastConnectionAttempt = 0;
    this.isConnecting = false;
    this.isConnected = false;
    this.eventCallbacks = {};
    console.log('✅ WebSocket manager cleanup complete');
  }
}

// Export a singleton instance
export const webSocketManager = new WebSocketManager(); 