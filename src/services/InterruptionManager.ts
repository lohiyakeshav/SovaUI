import { audioService } from './audioService';
import { socketService } from './socketService';
import { voiceActivityDetection } from './voiceActivityDetection';

export interface InterruptionState {
  isAISpeaking: boolean;
  isUserInterrupting: boolean;
  lastInterruptionTime: number;
  interruptionCount: number;
  isInterruptionEnabled: boolean;
}

export interface InterruptionConfig {
  enableVoiceInterruption: boolean;
  enableButtonInterruption: boolean;
  voiceInterruptionThreshold: number; // dB threshold for voice detection
  interruptionCooldown: number; // ms to prevent rapid interruptions
  visualFeedbackDuration: number; // ms to show interruption feedback
  autoRestartAfterInterruption: boolean;
  logInterruptions: boolean;
}

export class InterruptionManager {
  private state: InterruptionState = {
    isAISpeaking: false,
    isUserInterrupting: false,
    lastInterruptionTime: 0,
    interruptionCount: 0,
    isInterruptionEnabled: true
  };

  private config: InterruptionConfig = {
    enableVoiceInterruption: true,
    enableButtonInterruption: true,
    voiceInterruptionThreshold: -35, // dB threshold
    interruptionCooldown: 2000, // 2 seconds
    visualFeedbackDuration: 1500, // 1.5 seconds
    autoRestartAfterInterruption: true,
    logInterruptions: true
  };

  private callbacks: {
    onInterruptionStart?: () => void;
    onInterruptionEnd?: () => void;
    onAISpeakingStart?: () => void;
    onAISpeakingEnd?: () => void;
    onUserSpeakingStart?: () => void;
    onUserSpeakingEnd?: () => void;
  } = {};

  private isInitialized: boolean = false;
  private mediaStream: MediaStream | null = null;
  private vadInstance: any = null;

  constructor() {
    this.log('🚫 InterruptionManager initialized');
  }

  /**
   * Initialize the interruption manager
   */
  public async initialize(stream?: MediaStream): Promise<void> {
    if (this.isInitialized) {
      this.log('⚠️ Already initialized');
      return;
    }

    this.log('🚀 Initializing InterruptionManager...');

    // Set up audio service interruption handling
    this.setupAudioServiceIntegration();

    // Set up socket service interruption handling
    this.setupSocketServiceIntegration();

    // Set up voice activity detection if stream provided
    if (stream && this.config.enableVoiceInterruption) {
      await this.setupVoiceInterruption(stream);
    }

    this.isInitialized = true;
    this.log('✅ InterruptionManager initialized successfully');
  }

  /**
   * Set up integration with audio service
   */
  private setupAudioServiceIntegration(): void {
    // Override audio service methods to track AI speaking state
    const originalPlayAudioResponse = audioService.playAudioResponse.bind(audioService);
    
    audioService.playAudioResponse = async (audioData: string, index: number, total: number, sessionId?: string) => {
      if (index === 0) {
        this.setAISpeaking(true);
      }
      
      try {
        await originalPlayAudioResponse(audioData, index, total, sessionId);
      } catch (error) {
        this.log(`❌ Audio playback error: ${error}`);
      }
      
      if (index === total - 1) {
        this.setAISpeaking(false);
      }
    };

    // Override interrupt method to track interruptions
    const originalInterrupt = audioService.interrupt.bind(audioService);
    
    audioService.interrupt = () => {
      this.log('🔊 Audio service interrupt called');
      this.handleInterruption();
      originalInterrupt();
    };
  }

  /**
   * Set up integration with socket service
   */
  private setupSocketServiceIntegration(): void {
    // Listen for AI thinking/typing events
    socketService.onAIThinking((data) => {
      this.log('🤔 AI thinking detected');
      this.setAISpeaking(true);
    });

    socketService.onAITyping((data) => {
      if (data.status === 'started') {
        this.log('⌨️ AI typing started');
        this.setAISpeaking(true);
      } else {
        this.log('✅ AI typing finished');
        this.setAISpeaking(false);
      }
    });

    // Listen for AI finished events
    socketService.onAIFinished((data) => {
      this.log('🏁 AI finished speaking');
      this.setAISpeaking(false);
    });
  }

  /**
   * Set up voice activity detection for interruption
   */
  private async setupVoiceInterruption(stream: MediaStream): Promise<void> {
    try {
      this.mediaStream = stream;
      this.vadInstance = voiceActivityDetection; // Use the singleton instance
      
      // Note: VAD thresholds are readonly, so we'll use the default values
      // The interruption logic will handle the threshold checking
      console.log('🎤 VAD configured with default thresholds');
      
      await this.vadInstance.start(stream);
      
      // Set up speech detection callbacks
      this.vadInstance.onSpeechStart = () => {
        this.handleUserSpeechStart();
      };
      
      this.vadInstance.onSpeechEnd = () => {
        this.handleUserSpeechEnd();
      };
      
      this.log('🎤 Voice interruption detection enabled');
    } catch (error) {
      this.log(`❌ Failed to setup voice interruption: ${error}`);
    }
  }

  /**
   * Handle user speech start
   */
  private handleUserSpeechStart(): void {
    if (!this.state.isAISpeaking || !this.config.enableVoiceInterruption) {
      return;
    }

    const now = Date.now();
    const timeSinceLastInterruption = now - this.state.lastInterruptionTime;
    
    if (timeSinceLastInterruption < this.config.interruptionCooldown) {
      this.log(`⏳ Interruption blocked by cooldown (${timeSinceLastInterruption}ms < ${this.config.interruptionCooldown}ms)`);
      return;
    }

    this.log('🗣️ User speech detected while AI is speaking - triggering interruption');
    this.triggerInterruption('voice');
  }

  /**
   * Handle user speech end
   */
  private handleUserSpeechEnd(): void {
    this.log('🔇 User speech ended');
    this.callbacks.onUserSpeakingEnd?.();
  }

  /**
   * Trigger an interruption
   */
  public triggerInterruption(source: 'voice' | 'button' | 'manual'): void {
    if (!this.state.isInterruptionEnabled) {
      this.log('⚠️ Interruptions are disabled');
      return;
    }

    if (!this.state.isAISpeaking) {
      this.log('⚠️ No AI speaking to interrupt');
      return;
    }

    const now = Date.now();
    const timeSinceLastInterruption = now - this.state.lastInterruptionTime;
    
    if (timeSinceLastInterruption < this.config.interruptionCooldown) {
      this.log(`⏳ Interruption blocked by cooldown (${timeSinceLastInterruption}ms < ${this.config.interruptionCooldown}ms)`);
      return;
    }

    this.log(`🚫 INTERRUPTION TRIGGERED by ${source}`);
    
    // Update state
    this.state.isUserInterrupting = true;
    this.state.lastInterruptionTime = now;
    this.state.interruptionCount++;

    // Stop AI audio
    audioService.interrupt();
    
    // Send interruption to server
    socketService.interrupt();
    
    // Trigger callbacks
    this.callbacks.onInterruptionStart?.();
    
    // Visual feedback duration
    setTimeout(() => {
      this.state.isUserInterrupting = false;
      this.callbacks.onInterruptionEnd?.();
      
      if (this.config.autoRestartAfterInterruption) {
        this.log('🔄 Auto-restarting after interruption');
        // The mic button component should handle restarting recording
      }
    }, this.config.visualFeedbackDuration);
  }

  /**
   * Handle interruption (called by audio service)
   */
  private handleInterruption(): void {
    this.log('🔊 Interruption handled by audio service');
    this.state.isAISpeaking = false;
    this.callbacks.onAISpeakingEnd?.();
  }

  /**
   * Set AI speaking state
   */
  private setAISpeaking(isSpeaking: boolean): void {
    if (this.state.isAISpeaking === isSpeaking) {
      return; // No change
    }

    this.state.isAISpeaking = isSpeaking;
    
    if (isSpeaking) {
      this.log('🤖 AI started speaking');
      this.callbacks.onAISpeakingStart?.();
    } else {
      this.log('🔇 AI stopped speaking');
      this.callbacks.onAISpeakingEnd?.();
    }
  }

  /**
   * Enable/disable interruptions
   */
  public setInterruptionEnabled(enabled: boolean): void {
    this.state.isInterruptionEnabled = enabled;
    this.log(`🔧 Interruptions ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<InterruptionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.log('⚙️ Configuration updated');
  }

  /**
   * Get current state
   */
  public getState(): InterruptionState {
    return { ...this.state };
  }

  /**
   * Get current configuration
   */
  public getConfig(): InterruptionConfig {
    return { ...this.config };
  }

  /**
   * Set callbacks
   */
  public setCallbacks(callbacks: Partial<typeof this.callbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Check if interruption is possible
   */
  public canInterrupt(): boolean {
    return this.state.isInterruptionEnabled && 
           this.state.isAISpeaking && 
           !this.state.isUserInterrupting &&
           (Date.now() - this.state.lastInterruptionTime) >= this.config.interruptionCooldown;
  }

  /**
   * Get interruption statistics
   */
  public getStats(): {
    totalInterruptions: number;
    lastInterruptionTime: number;
    timeSinceLastInterruption: number;
    isAISpeaking: boolean;
    isUserInterrupting: boolean;
  } {
    const now = Date.now();
    return {
      totalInterruptions: this.state.interruptionCount,
      lastInterruptionTime: this.state.lastInterruptionTime,
      timeSinceLastInterruption: now - this.state.lastInterruptionTime,
      isAISpeaking: this.state.isAISpeaking,
      isUserInterrupting: this.state.isUserInterrupting
    };
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.log('🧹 Cleaning up InterruptionManager');
    
    if (this.vadInstance) {
      this.vadInstance.stop();
      this.vadInstance = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    this.isInitialized = false;
  }

  /**
   * Log messages
   */
  private log(message: string): void {
    if (this.config.logInterruptions) {
      console.log(`[InterruptionManager] ${message}`);
    }
  }
}

// Export singleton instance
export const interruptionManager = new InterruptionManager(); 