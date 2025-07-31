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
  private stuckDetectionTimeout: NodeJS.Timeout | null = null; // Timeout to detect stuck recognition

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
    
    // Add confidence threshold to reduce false positives
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      // Get all results, not just the last one
      let fullTranscript = '';
      let hasFinalResult = false;
      
      // Only process the most recent result to prevent accumulation
      const lastResultIndex = event.results.length - 1;
      if (lastResultIndex >= 0) {
        const result = event.results[lastResultIndex];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence || 0;
        const isFinal = result.isFinal;
        
        // Only process if confidence is above threshold or it's a final result
        const confidenceThreshold = 0.3; // Minimum confidence for interim results
        const isValidResult = isFinal || confidence > confidenceThreshold;
        
        if (isValidResult) {
          if (isFinal) {
            hasFinalResult = true;
          }
          
          fullTranscript = transcript.trim();
          
          console.log('🎤 SPEECH DETECTED:', { 
            transcript: fullTranscript, 
            confidence: confidence.toFixed(2),
            isFinal,
            isValidResult
          });
        } else {
          console.log('🔇 LOW CONFIDENCE SPEECH IGNORED:', { 
            transcript: transcript.trim(), 
            confidence: confidence.toFixed(2),
            threshold: confidenceThreshold
          });
        }
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
        
        // Only send if transcript is long enough and meaningful (prevents false positives)
        const minSpeechLength = 2; // Minimum 2 characters
        const isLongEnough = fullTranscript.trim().length >= minSpeechLength;
        const isMeaningful = this.isMeaningfulTranscript(fullTranscript);
        
        if (isNewTranscript && isLongEnough && isMeaningful) {
          console.log('🤖 FINAL TRANSCRIPT - NOTIFYING AI:', fullTranscript);
          this.lastSpeechTime = Date.now();
          this.clearSilenceTimeout(); // Clear timeout to prevent multiple stop-speaking
          this.hasSentFinalTranscript = true; // Mark as sent
          this.lastFinalTranscript = fullTranscript; // Store this transcript
          this.transcriptHistory.add(fullTranscript); // Add to history
          stopSpeaking(fullTranscript);
        } else {
          if (!isNewTranscript) {
            console.log('🔄 DUPLICATE TRANSCRIPT DETECTED, skipping:', fullTranscript);
          } else if (!isLongEnough) {
            console.log('📏 TRANSCRIPT TOO SHORT, skipping:', fullTranscript, `(min: ${minSpeechLength} chars)`);
          } else if (!isMeaningful) {
            console.log('🚫 TRANSCRIPT NOT MEANINGFUL, skipping:', fullTranscript);
          }
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
      // AND if there's actual speech content (not just background noise)
      if (!this.hasSentFinalTranscript) {
        const hasActualSpeech = this.currentTranscript.trim().length > 0;
        const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;
        const hasRecentSpeech = timeSinceLastSpeech < 10000; // 10 seconds
        
        const isMeaningful = this.isMeaningfulTranscript(this.currentTranscript.trim());
        
        if (hasActualSpeech && hasRecentSpeech && isMeaningful) {
          console.log('🛑 Speech recognition ended, sending transcript:', this.currentTranscript.trim());
          stopSpeaking(this.currentTranscript.trim());
        } else {
          console.log('🔇 No actual speech detected, not sending transcript');
          console.log('🔍 Speech check:', { 
            hasActualSpeech, 
            hasRecentSpeech, 
            isMeaningful: this.isMeaningfulTranscript(this.currentTranscript.trim()),
            timeSinceLastSpeech: `${timeSinceLastSpeech}ms`,
            currentTranscript: `"${this.currentTranscript.trim()}"`
          });
        }
      }
      
      // Auto-restart if we're supposed to be listening (for continuous conversation)
      // But only if we haven't sent a final transcript (to avoid restarting after user spoke)
      if (this.isListening && !this.hasSentFinalTranscript) {
        console.log('🔄 Auto-restarting speech recognition for continuous conversation');
        // Reset the listening flag so we can restart
        this.isListening = false;
        setTimeout(() => {
          // Check if we should still be listening (mic might have been turned off)
          if (!this.hasSentFinalTranscript) {
            this.start();
          }
        }, 1000); // Wait 1 second before restarting
      } else {
        this.isListening = false;
      }
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

      // Reset state for new session
      this.isListening = true;
      this.hasSentFinalTranscript = false; // Reset flag for new speech session
      this.currentTranscript = ''; // Reset transcript for new session
      this.lastFinalTranscript = ''; // Reset last final transcript
      
      // Try to start recognition
      this.recognition.start();
      console.log('🎤 SPEECH RECOGNITION STARTED');
      this.lastSpeechTime = Date.now();
      this.resetSilenceTimeout();
      this.startStuckDetection();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.isListening = false;
      
      // If it's already started, try to stop and restart
      if (error.name === 'InvalidStateError' && error.message.includes('already started')) {
        console.log('Speech recognition was already started, stopping and restarting...');
        try {
          this.recognition.stop();
          setTimeout(() => {
            if (!this.isListening) { // Only restart if we're supposed to be listening
              this.isListening = true;
              this.recognition.start();
            }
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
    this.clearStuckDetection();
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

  // Public method to check if speech recognition is working properly
  isWorking(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastSpeechTime;
    const hasRecentActivity = timeSinceLastActivity < 60000; // 1 minute
    
    return this.isListening && hasRecentActivity;
  }

  // Public method to get current state for debugging
  getState(): any {
    return {
      isListening: this.isListening,
      isAvailable: !!this.recognition,
      hasSentFinalTranscript: this.hasSentFinalTranscript,
      currentTranscript: this.currentTranscript,
      lastSpeechTime: this.lastSpeechTime,
      timeSinceLastActivity: Date.now() - this.lastSpeechTime,
      isWorking: this.isWorking()
    };
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
      // AND if there's actual speech content
      if (!this.hasSentFinalTranscript) {
        const hasActualSpeech = this.currentTranscript.trim().length > 0;
        const timeSinceLastSpeech = Date.now() - this.lastSpeechTime;
        const hasRecentSpeech = timeSinceLastSpeech < 10000; // 10 seconds
        
        const isMeaningful = this.isMeaningfulTranscript(this.currentTranscript.trim());
        
        if (hasActualSpeech && hasRecentSpeech && isMeaningful) {
          console.log('🛑 Silence detected, sending transcript:', this.currentTranscript.trim());
          stopSpeaking(this.currentTranscript.trim());
        } else {
          console.log('🔇 Silence detected but no actual speech, not sending transcript');
          console.log('🔍 Silence check:', { 
            hasActualSpeech, 
            hasRecentSpeech, 
            isMeaningful: this.isMeaningfulTranscript(this.currentTranscript.trim()),
            timeSinceLastSpeech: `${timeSinceLastSpeech}ms`,
            currentTranscript: `"${this.currentTranscript.trim()}"`
          });
        }
      }
    }, 5000); // Changed from 2000 to 5000 ms
  }

  private clearSilenceTimeout() {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  private startStuckDetection() {
    // Clear any existing stuck detection timeout
    if (this.stuckDetectionTimeout) {
      clearTimeout(this.stuckDetectionTimeout);
    }
    
    // Set timeout to detect if recognition gets stuck (30 seconds)
    this.stuckDetectionTimeout = setTimeout(() => {
      if (this.isListening && !this.hasSentFinalTranscript) {
        console.log('⚠️ SPEECH RECOGNITION STUCK - Force restarting');
        this.forceRestart();
      }
    }, 30000); // 30 seconds
  }

  private clearStuckDetection() {
    if (this.stuckDetectionTimeout) {
      clearTimeout(this.stuckDetectionTimeout);
      this.stuckDetectionTimeout = null;
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
    this.clearStuckDetection();
    console.log('🧹 TRANSCRIPT HISTORY CLEARED');
  }

  // Method to check if a transcript is meaningful (not just noise)
  private isMeaningfulTranscript(transcript: string): boolean {
    const trimmed = transcript.trim();
    
    // Check minimum length
    if (trimmed.length < 2) return false;
    
    // Check for common false positives
    const falsePositives = [
      'i heard you speak',
      'i heard you',
      'heard you speak',
      'heard you',
      'you speak',
      'speak',
      'um',
      'uh',
      'ah',
      'oh',
      'hmm',
      'mm',
      'mhm',
      'yeah',
      'yes',
      'no',
      'right',
      'sure',
      'uh huh',
      'uh-huh'
    ];
    
    const lowerTranscript = trimmed.toLowerCase();
    return !falsePositives.some(fp => lowerTranscript.includes(fp));
  }

  // Method to force restart speech recognition (useful if it gets stuck)
  forceRestart() {
    console.log('🔄 FORCE RESTARTING SPEECH RECOGNITION');
    this.isListening = false;
    this.hasSentFinalTranscript = false;
    this.currentTranscript = '';
    this.lastFinalTranscript = '';
    this.clearSilenceTimeout();
    this.clearStuckDetection();
    
    // Stop any existing recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.log('Error stopping recognition during force restart:', error);
      }
    }
    
    // Start fresh after a short delay
    setTimeout(() => {
      this.start();
    }, 500);
  }

  // Method to reset for new query (called after AI finishes speaking)
  resetForNewQuery() {
    this.clearHistory();
    this.clearSilenceTimeout();
    this.clearStuckDetection();
    // Don't set isListening = false - keep listening for continuous conversation
    this.hasSentFinalTranscript = false; // Reset flag for new query
    console.log('🔄 SPEECH RECOGNITION RESET FOR NEW QUERY');
    
    // Ensure speech recognition is actually running for continuous conversation
    if (!this.isListening && this.recognition) {
      console.log('🔄 RESTARTING SPEECH RECOGNITION AFTER RESET');
      setTimeout(() => {
        this.start();
      }, 100); // Small delay to ensure reset is complete
    }
  }
}

export const speechRecognition = new SpeechRecognitionService(); 