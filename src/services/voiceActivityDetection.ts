export class VoiceActivityDetection {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private isListening: boolean = false;
  private animationFrame: number | null = null;
  
  // VAD parameters
  private readonly SAMPLE_RATE = 48000;
  private readonly FFT_SIZE = 2048;
  private readonly SILENCE_THRESHOLD = -50; // dB
  private readonly SPEECH_THRESHOLD = -35; // dB
  private readonly MIN_SPEECH_DURATION = 200; // ms
  private readonly MIN_SILENCE_DURATION = 1000; // ms - increased from 500ms to 1 second
  
  private lastSpeechTime: number = 0;
  private lastSilenceTime: number = 0;
  private isSpeaking: boolean = false;
  public onSpeechStart?: () => void;
  public onSpeechEnd?: () => void;

  async start(stream: MediaStream): Promise<void> {
    try {
      this.stream = stream;
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.SAMPLE_RATE
      });
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.8;
      
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      
      this.isListening = true;
      this.detectVoiceActivity();
      
      console.log('🎤 Voice Activity Detection started');
    } catch (error) {
      console.error('Error starting VAD:', error);
      throw error;
    }
  }

  stop(): void {
    this.isListening = false;
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(err => {
        console.warn('Error closing VAD audio context:', err);
      });
      this.audioContext = null;
    }
    
    this.stream = null;
    this.isSpeaking = false;
    console.log('🛑 Voice Activity Detection stopped');
  }

  private detectVoiceActivity(): void {
    if (!this.isListening || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    // Calculate RMS (Root Mean Square) for volume detection
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = 20 * Math.log10(rms / 255);
    
    const now = Date.now();
    
    if (db > this.SPEECH_THRESHOLD) {
      // Speech detected
      this.lastSpeechTime = now;
      
      if (!this.isSpeaking) {
        const silenceDuration = now - this.lastSilenceTime;
        if (silenceDuration > this.MIN_SILENCE_DURATION) {
          this.isSpeaking = true;
          console.log('🗣️ SPEECH STARTED (VAD)');
          this.onSpeechStart?.();
        }
      }
    } else if (db < this.SILENCE_THRESHOLD) {
      // Silence detected
      this.lastSilenceTime = now;
      
      if (this.isSpeaking) {
        const speechDuration = now - this.lastSpeechTime;
        if (speechDuration > this.MIN_SPEECH_DURATION) {
          this.isSpeaking = false;
          console.log('🔇 SPEECH ENDED (VAD)');
          this.onSpeechEnd?.();
        }
      }
    }
    
    this.animationFrame = requestAnimationFrame(() => this.detectVoiceActivity());
  }

  onSpeechStart(callback: () => void): void {
    this.onSpeechStart = callback;
  }

  onSpeechEnd(callback: () => void): void {
    this.onSpeechEnd = callback;
  }

  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const voiceActivityDetection = new VoiceActivityDetection(); 