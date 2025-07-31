import { stopSpeaking } from './socketService';

export class SpeechRecognitionService {
  private recognition: any;
  private isListening: boolean = false;
  private onResultCallback?: (transcript: string, isFinal: boolean) => void;
  private onErrorCallback?: (error: any) => void;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private lastSpeechTime: number = 0;
  private hasSentFinalTranscript: boolean = false; // Add flag to prevent multiple stopSpeaking calls
  private currentTranscript: string = ''; // Track current transcript
  private lastFinalTranscript: string = ''; // Track last final transcript to prevent duplicates
  private transcriptHistory: Set<string> = new Set(); // Track sent transcripts to prevent duplicates

  constructor() {
    // Check if Web Speech API is available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    } else {
      console.warn('Web Speech API not supported in this browser');
    }
  }

  private setupRecognition() {
    if (!this.recognition) return;

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      // Get all results, not just the last one
      let fullTranscript = '';
      let hasFinalResult = false;
      
      // Only process the most recent result to prevent accumulation
      const lastResultIndex = event.results.length - 1;
      if (lastResultIndex >= 0) {
        const result = event.results[lastResultIndex];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;
        
        if (isFinal) {
          hasFinalResult = true;
        }
        
        fullTranscript = transcript.trim();
      }
      
      console.log('🎤 USER SPEAKING:', { 
        fullTranscript, 
        isFinal: hasFinalResult,
        resultCount: event.results.length,
        timestamp: new Date().toISOString()
      });

      if (this.onResultCallback && fullTranscript) {
        // Only send to UI if it's a final result or if it's significantly different
        const shouldSend = hasFinalResult || this.isSignificantUpdate(fullTranscript);
        if (shouldSend) {
          console.log('📝 SENDING TO UI:', fullTranscript, hasFinalResult);
          this.onResultCallback(fullTranscript, hasFinalResult);
        }
      }
      
      // Update current transcript
      this.currentTranscript = fullTranscript;
      
      // If this is a final result, notify the AI that the user has finished speaking
      if (hasFinalResult && fullTranscript.trim() && !this.hasSentFinalTranscript) {
        // Check if this transcript is significantly different from the last one
        const isNewTranscript = this.isNewFinalTranscript(fullTranscript);
        
        if (isNewTranscript) {
          console.log('🤖 FINAL TRANSCRIPT - NOTIFYING AI:', fullTranscript);
          this.lastSpeechTime = Date.now();
          this.clearSilenceTimeout(); // Clear timeout to prevent multiple stop-speaking
          this.hasSentFinalTranscript = true; // Mark as sent
          this.lastFinalTranscript = fullTranscript; // Store this transcript
          this.transcriptHistory.add(fullTranscript); // Add to history
          stopSpeaking(fullTranscript);
        } else {
          console.log('🔄 DUPLICATE TRANSCRIPT DETECTED, skipping:', fullTranscript);
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error);
      }
      this.isListening = false;
    };

    this.recognition.onend = () => {
      console.log('🔚 SPEECH RECOGNITION ENDED');
      this.clearSilenceTimeout();
      
      // Only send stop-speaking if we haven't already sent a final transcript
      if (!this.hasSentFinalTranscript) {
        const transcriptToSend = this.currentTranscript.trim() || 'I heard you speak';
        console.log('🛑 Speech recognition ended, sending transcript:', transcriptToSend);
        stopSpeaking(transcriptToSend);
      }
      
      // Don't auto-restart - only restart when explicitly requested
      // This prevents the continuous stopping/starting loop
      this.isListening = false;
    };
  }

  start() {
    if (!this.recognition) {
      console.error('Speech recognition not available');
      return;
    }

    try {
      // Check if already listening
      if (this.isListening) {
        console.log('Speech recognition already active');
        return;
      }

      this.isListening = true;
      this.hasSentFinalTranscript = false; // Reset flag for new speech session
      this.currentTranscript = ''; // Reset transcript for new session
      this.lastFinalTranscript = ''; // Reset last final transcript
      this.recognition.start();
      console.log('🎤 SPEECH RECOGNITION STARTED');
      this.lastSpeechTime = Date.now();
      this.resetSilenceTimeout();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.isListening = false;
      
      // If it's already started, try to stop and restart
      if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
        console.log('Speech recognition was already started, stopping and restarting...');
        try {
          this.recognition.stop();
          setTimeout(() => {
            this.isListening = true;
            this.recognition.start();
          }, 100);
        } catch (restartError) {
          console.error('Error restarting speech recognition:', restartError);
          this.isListening = false;
        }
      }
    }
  }

  stop() {
    if (!this.recognition) return;
    
    this.isListening = false;
    this.clearSilenceTimeout();
    try {
      this.recognition.stop();
      console.log('🛑 SPEECH RECOGNITION STOPPED');
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }

  onResult(callback: (transcript: string, isFinal: boolean) => void) {
    this.onResultCallback = callback;
  }

  onError(callback: (error: any) => void) {
    this.onErrorCallback = callback;
  }

  isAvailable(): boolean {
    return !!this.recognition;
  }

  // Public method to check if speech recognition is currently listening
  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  private lastSentTranscript: string = '';
  private lastUpdateTime: number = 0;

  private isSignificantUpdate(transcript: string): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;
    
    // Only send updates if:
    // 1. It's been at least 500ms since last update, OR
    // 2. The transcript is significantly different (more than 3 characters difference)
    const isTimeBased = timeSinceLastUpdate > 500;
    const isDifferent = Math.abs(transcript.length - this.lastSentTranscript.length) > 3;
    
    if (isTimeBased || isDifferent) {
      this.lastSentTranscript = transcript;
      this.lastUpdateTime = now;
      return true;
    }
    
    return false;
  }

  // New method to check if this is a new final transcript
  private isNewFinalTranscript(transcript: string): boolean {
    // Normalize transcript for comparison (remove extra spaces, lowercase)
    const normalizedTranscript = transcript.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalizedLast = this.lastFinalTranscript.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Check if it's exactly the same
    if (normalizedTranscript === normalizedLast) {
      return false;
    }
    
    // Check if it's in our history (with some tolerance for minor variations)
    for (const historyTranscript of this.transcriptHistory) {
      const normalizedHistory = historyTranscript.toLowerCase().trim().replace(/\s+/g, ' ');
      
      // If transcripts are very similar (90% similarity), consider it a duplicate
      if (this.calculateSimilarity(normalizedTranscript, normalizedHistory) > 0.9) {
        return false;
      }
    }
    
    return true;
  }

  // Helper method to calculate string similarity
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0) return 0.0;
    if (str2.length === 0) return 0.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Levenshtein distance calculation
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private resetSilenceTimeout() {
    // Clear existing timeout
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
    }
    
    // Set new timeout for 5 seconds of silence (increased from 2 seconds)
    this.silenceTimeout = setTimeout(() => {
      console.log('🔇 SILENCE DETECTED - NOTIFYING AI (5 seconds)');
      this.clearSilenceTimeout(); // Clear to prevent multiple calls
      
      // Only send stop-speaking if we haven't already sent a final transcript
      if (!this.hasSentFinalTranscript) {
        const transcriptToSend = this.currentTranscript.trim() || 'I heard you speak';
        console.log('🛑 Silence detected, sending transcript:', transcriptToSend);
        stopSpeaking(transcriptToSend);
      }
    }, 5000); // Changed from 2000 to 5000 ms
  }

  private clearSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  // Method to clear transcript history (useful for new conversations)
  clearHistory() {
    this.transcriptHistory.clear();
    this.lastFinalTranscript = '';
    this.currentTranscript = '';
    this.hasSentFinalTranscript = false;
    this.lastSentTranscript = '';
    this.lastUpdateTime = 0;
    console.log('🧹 TRANSCRIPT HISTORY CLEARED');
  }

  // Method to reset for new query (called after AI finishes speaking)
  resetForNewQuery() {
    this.clearHistory();
    this.clearSilenceTimeout();
    // Don't set isListening = false - keep listening for continuous conversation
    this.hasSentFinalTranscript = false; // Reset flag for new query
    console.log('🔄 SPEECH RECOGNITION RESET FOR NEW QUERY');
  }
}

export const speechRecognition = new SpeechRecognitionService(); 