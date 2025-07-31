import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { socketService } from "@/services/socketService";
import { speechRecognition } from "@/services/speechRecognition";
import { audioService } from "@/services/audioService";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";

interface MicButtonProps {
  onTranscriptUpdate?: (transcript: string) => void;
  onMicStateChange?: (enabled: boolean, recording: boolean) => void;
}

export function MicButton({ onTranscriptUpdate, onMicStateChange }: MicButtonProps) {
  const { isDark } = useTheme();
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const { toast } = useToast();
  
  // Use ref to track if component is mounted
  const isMountedRef = useRef(true);
  
  // Debug: Log component lifecycle
  useEffect(() => {
    console.log('🎤 MicButton mounted');
    return () => {
      console.log('🎤 MicButton unmounting');
    };
  }, []);

  // Notify parent of mic state changes
  useEffect(() => {
    onMicStateChange?.(isMicOn, isMicOn); // When mic is on, it's also recording
  }, [isMicOn, onMicStateChange]); // Include onMicStateChange to prevent stale closure

  // Handle connection status updates
  useEffect(() => {
    const checkConnectionStatus = () => {
      if (!isMountedRef.current) return;
      
      const isConnected = socketService.isConnected();
      const isConnecting = socketService.isConnecting();
      
      setIsConnected(isConnected);
      setIsConnecting(isConnecting);
    };
    
    // Check immediately
    checkConnectionStatus();
    
    // Set up interval to check connection status
    const interval = setInterval(checkConnectionStatus, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // Setup all socket event listeners for AI communication
    // Only setup when component mounts, not on every render
    console.log('🎧 Setting up AI event listeners...');
    
    socketService.onSessionStatus((data) => {
      console.log('Session status:', data);
      if (!isMountedRef.current) return;
      
      if (data.status === 'active') {
        setIsConnected(true);
        setConnectionAttempts(0); // Reset connection attempts on successful connection
        toast({
          title: "Session Active",
          description: "Voice interface is ready",
        });
      } else if (data.status === 'ended') {
        setIsConnected(false);
      }
    });

    socketService.onAudioResponse((data) => {
      // Debug: Log only first few chunks to reduce spam
      if (data.index <= 2) {
        console.log('🔊 Audio chunk received:', data.index, '/', data.total);
        console.log('🔍 MicButton received data:', {
          hasAudio: !!data.audio,
          hasChunk: !!data.chunk,
          audioLength: data.audio?.length || 0,
          chunkLength: data.chunk?.length || 0,
          audioPreview: data.audio?.substring(0, 20) + '...',
          chunkPreview: data.chunk?.substring(0, 20) + '...'
        });
      }
      
      // Handle transcript if available
      if (data.transcript && onTranscriptUpdate) {
        onTranscriptUpdate(data.transcript);
      }
      
      // Get audio data from either field
      const audioData = data.audio || data.chunk || '';
      
      // Play audio response (backend now sends proper WAV chunks)
      if (audioData && audioData.length > 0) {
        if (data.index <= 2) {
          console.log('🎵 CALLING AUDIO SERVICE for WAV chunk:', data.index + '/' + data.total, 'length:', audioData.length);
          if (data.sessionId) {
            console.log('🔍 Session ID:', data.sessionId);
          }
        }
        audioService.playAudioResponse(audioData, data.index, data.total, data.sessionId);
      } else {
        console.log('❌ No audio data in chunk:', data.index);
      }
    });

    // Listen for transcript events
    socketService.onTranscript((data) => {
      console.log('📝 Transcript:', data.text);
      if (data.text && onTranscriptUpdate) {
        onTranscriptUpdate(data.text);
      }
    });

    // Listen for AI thinking state
    socketService.onAIThinking((data) => {
      console.log('🤔 AI is thinking:', data.message);
      setIsAISpeaking(true);
      // Show thinking indicator - you can add state for this
      toast({
        title: "AI Thinking",
        description: data.message || "Processing your request...",
      });
    });

    // Listen for AI typing indicator
    socketService.onAITyping((data) => {
      if (!isMountedRef.current) return;
      
      if (data.status === 'started') {
        console.log('⌨️ AI is typing...');
        setIsAISpeaking(true);
        // Show typing indicator
        toast({
          title: "AI Typing",
          description: "Generating response...",
        });
      } else {
        console.log('✅ AI finished typing');
        // Hide typing indicator
      }
    });

    // Listen for transcription feedback
    socketService.onTranscription((data) => {
      console.log('🎧 AI heard:', data.text);
      // Show what AI heard - you can add state for this
      if (onTranscriptUpdate) {
        onTranscriptUpdate(`AI heard: ${data.text}`);
      }
    });

    // Listen for AI response text
    socketService.onAIResponseText((data) => {
      console.log('🤖 AI response:', data.text);
      setIsAISpeaking(true);
      
      // Show AI's text response - you can add state for this
      if (onTranscriptUpdate) {
        onTranscriptUpdate(`AI: ${data.text}`);
      }
      // Show notification that AI is speaking
      toast({
        title: "AI Speaking",
        description: "Playing response with Gemini Live...",
      });
    });

    // Listen for AI finished speaking
    socketService.onAIFinished((data) => {
      console.log('✅ AI finished speaking:', data.text);
      if (!isMountedRef.current) return;
      
      setIsAISpeaking(false);
      
      // Reset services for continuous conversation
      socketService.resetForContinuousConversation();
      audioService.resetForContinuousConversation();
      
      // Clear speech recognition history after AI response to prepare for next query
      speechRecognition.clearHistory();
      
      // Hide thinking indicator - you can add state for this
      toast({
        title: "AI Finished",
        description: "Response complete",
      });
    });

    socketService.onError((error) => {
      console.error('❌ Socket error:', error);
      if (!isMountedRef.current) return;
      
      // Handle session-related errors
      if (error.type === 'no-session') {
        setIsConnected(false);
        setIsMicOn(false);
        toast({
          title: "Session Lost",
          description: "Reconnecting to voice service...",
        });
        // Try to reconnect with rate limiting
        if (connectionAttempts < 3) {
          setTimeout(() => {
            if (isMountedRef.current) {
              connectToServer();
            }
          }, 2000 * (connectionAttempts + 1)); // Exponential backoff
        } else {
          toast({
            title: "Connection Failed",
            description: "Too many connection attempts. Please refresh the page.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Connection Error",
          description: error.message || "Failed to connect to voice service",
          variant: "destructive",
        });
        setIsMicOn(false);
        setIsConnecting(false);
      }
    });

    // Setup speech recognition callbacks
    if (speechRecognition.isAvailable()) {
      speechRecognition.onResult((transcript, isFinal) => {
        console.log('🎯 MIC BUTTON RECEIVED:', { transcript, isFinal });
        if (onTranscriptUpdate) {
          console.log('📤 SENDING TO PARENT:', transcript);
          onTranscriptUpdate(transcript);
        }
      });

      speechRecognition.onError((error) => {
        console.error('Speech recognition error:', error);
      });
    }

    return () => {
      console.log('🧹 MicButton cleanup - removing event listeners');
      isMountedRef.current = false;
      socketService.removeAllListeners();
      speechRecognition.stop();
      audioService.cleanup();
      
      // Only cleanup socket service if we're actually unmounting
      // Don't cleanup if we're just re-rendering
      socketService.cleanup();
    };
  }, []); // Empty dependency array - only run once on mount

  const connectToServer = useCallback(async () => {
    // Prevent multiple simultaneous connection attempts
    if (socketService.isConnecting() || socketService.isConnected()) {
      console.log('🔌 Connection already in progress or established, skipping...');
      return;
    }

    try {
      setIsConnecting(true);
      const currentAttempts = connectionAttempts + 1;
      setConnectionAttempts(currentAttempts);
      
      console.log(`🔌 Attempting connection #${currentAttempts}...`);
      
      await socketService.connect();
      
      // Check if component is still mounted before updating state
      if (!isMountedRef.current) {
        console.log('🔌 Component unmounted during connection, aborting...');
        return;
      }
      
      socketService.startConversation();
      setIsConnected(true);
      setIsConnecting(false);
      
      console.log('✅ Connection established successfully');
    } catch (error) {
      console.error('Failed to connect:', error);
      
      // Check if component is still mounted before updating state
      if (!isMountedRef.current) {
        console.log('🔌 Component unmounted during connection error, aborting...');
        return;
      }
      
      setIsConnecting(false);
      setIsConnected(false);
      
      if (connectionAttempts < 3) {
        toast({
          title: "Connection Failed",
          description: `Retrying connection (${connectionAttempts + 1}/3)...`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect to voice server. Please refresh the page.",
          variant: "destructive",
        });
      }
    }
  }, [connectionAttempts, toast]);

  const toggleMic = useCallback(async () => {
    if (isToggling) return; // Prevent multiple rapid toggles
    
    setIsToggling(true);
    
    try {
      // Initialize audio service on first user interaction
      await audioService.initialize();
      
      // Resume audio context on user interaction
      await audioService.resumeAudioContext();
      
      if (!isMicOn) {
        // Turn mic on - request permission and start recording
        try {
          // Request mic permission first
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop()); // Stop the test stream
          
          // Connect to server if not already connected
          if (!socketService.isConnected() && !socketService.isConnecting()) {
            await connectToServer();
          }
          
          // Only proceed if connection is established
          if (socketService.isConnected()) {
            // Reset services for continuous conversation
            socketService.resetForContinuousConversation();
            audioService.resetForContinuousConversation();
            
            // Start recording
            await socketService.startRecording();
            
            // Clear speech recognition history for new conversation
            speechRecognition.clearHistory();
            
            // Also start speech recognition for real-time transcription
            if (speechRecognition.isAvailable()) {
              speechRecognition.start();
            }
            
            setIsMicOn(true);
            
            toast({
              title: "Microphone On",
              description: "Speak to talk to the AI",
            });
          } else {
            toast({
              title: "Connection Required",
              description: "Please wait for connection to establish",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Microphone permission denied:', error);
          toast({
            title: "Microphone Access Required",
            description: "Please grant microphone permission to use voice features.",
            variant: "destructive",
          });
        }
      } else {
        // Turn mic off - stop recording
        socketService.stopRecording();
        speechRecognition.stop();
        
        setIsMicOn(false);
        toast({
          title: "Microphone Off",
          description: "Voice features disabled",
        });
      }
    } finally {
      setIsToggling(false);
    }
  }, [isMicOn, isConnected, isConnecting, connectToServer, toast]);

  return (
    <div className="fixed inset-x-0 bottom-40 z-40 flex justify-center">
      <button
        onClick={toggleMic}
        disabled={isConnecting || isToggling}
        className="cursor-target group relative"
        title={isMicOn ? "Click to turn off microphone" : "Click to turn on microphone"}
      >
          <div className={`
            backdrop-blur-xl border rounded-full p-6 shadow-2xl 
            transition-all duration-300 hover:scale-105
            ${!isMicOn ? (isDark ? 'bg-gray-900/50 border-gray-700/50' : 'bg-white/90 border-blue-900/20') : 
              isAISpeaking ? (isDark ? 'bg-blue-500/20 border-blue-500/50' : 'bg-white/90 border-blue-600/30') :
              (isDark ? 'bg-green-500/20 border-green-500/50' : 'bg-white/90 border-green-600/30')}
            ${(isConnecting || isToggling) ? 'opacity-50' : ''}
            ${isMicOn ? 'animate-pulse' : ''}
          `}>
            {isConnecting ? (
              <Loader2 size={32} className={`animate-spin ${isDark ? 'text-white/80' : 'text-blue-900/80'}`} />
            ) : !isMicOn ? (
              <MicOff size={32} className={isDark ? 'text-gray-500' : 'text-blue-900/80'} />
            ) : isAISpeaking ? (
              <div className="relative">
                <Mic size={32} className={isDark ? 'text-blue-500' : 'text-blue-700'} />
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full animate-ping ${isDark ? 'bg-blue-500' : 'bg-blue-700'}`}></div>
              </div>
            ) : (
              <Mic size={32} className={isDark ? 'text-green-500' : 'text-green-600'} />
            )}
          </div>
          
          {/* Status indicator */}
          <div className={`absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs whitespace-nowrap transition-colors duration-300 ${
            isDark ? 'text-white/60' : 'text-blue-900/80'
          }`}>
            {!isMicOn ? "Mic Off" : isAISpeaking ? "AI Speaking..." : "Talking..."}
          </div>
        </button>
    </div>
  );
}