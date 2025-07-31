import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, Loader2, VolumeX, Volume2 } from "lucide-react";
import { socketService } from "@/services/socketService";
import { speechRecognition } from "@/services/speechRecognition";
import { audioService } from "@/services/audioService";
import { interruptionManager } from "@/services/InterruptionManager";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EnhancedMicButtonProps {
  onTranscriptUpdate?: (transcript: string) => void;
  onMicStateChange?: (enabled: boolean, recording: boolean) => void;
  onInterruptionStateChange?: (isInterrupting: boolean) => void;
  showInterruptionButton?: boolean;
  className?: string;
}

export function EnhancedMicButton({ 
  onTranscriptUpdate, 
  onMicStateChange, 
  onInterruptionStateChange,
  showInterruptionButton = true,
  className 
}: EnhancedMicButtonProps) {
  const { isDark } = useTheme();
  const [isMicOn, setIsMicOn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isUserInterrupting, setIsUserInterrupting] = useState(false);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();
  
  // Use ref to track if component is mounted
  const isMountedRef = useRef(true);
  const interruptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debug: Log component lifecycle
  useEffect(() => {
    console.log('🎤 EnhancedMicButton mounted');
    return () => {
      console.log('🎤 EnhancedMicButton unmounting');
      isMountedRef.current = false;
      if (interruptionTimeoutRef.current) {
        clearTimeout(interruptionTimeoutRef.current);
      }
    };
  }, []);

  // Initialize interruption manager
  useEffect(() => {
    const initializeInterruptionManager = async () => {
      try {
        await interruptionManager.initialize(mediaStream || undefined);
        
        // Set up interruption callbacks
        interruptionManager.setCallbacks({
          onInterruptionStart: () => {
            if (!isMountedRef.current) return;
            setIsUserInterrupting(true);
            onInterruptionStateChange?.(true);
            
            // Show interruption toast
            toast({
              title: "Interruption Detected",
              description: "AI stopped speaking. You can now speak.",
              duration: 2000,
            });
          },
          onInterruptionEnd: () => {
            if (!isMountedRef.current) return;
            setIsUserInterrupting(false);
            onInterruptionStateChange?.(false);
          },
          onAISpeakingStart: () => {
            if (!isMountedRef.current) return;
            setIsAISpeaking(true);
            console.log('🤖 AI started speaking');
          },
          onAISpeakingEnd: () => {
            if (!isMountedRef.current) return;
            setIsAISpeaking(false);
            console.log('🔇 AI stopped speaking');
          },
          onUserSpeakingStart: () => {
            console.log('🗣️ User started speaking');
          },
          onUserSpeakingEnd: () => {
            console.log('🔇 User stopped speaking');
          }
        });
        
        console.log('✅ InterruptionManager initialized in EnhancedMicButton');
      } catch (error) {
        console.error('❌ Failed to initialize InterruptionManager:', error);
      }
    };

    if (mediaStream) {
      initializeInterruptionManager();
    }
  }, [mediaStream, onInterruptionStateChange, toast]);

  // Notify parent of mic state changes
  useEffect(() => {
    onMicStateChange?.(isMicOn, isMicOn); // When mic is on, it's also recording
  }, [isMicOn, onMicStateChange]);

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

  // Setup socket event listeners
  useEffect(() => {
    console.log('🎧 Setting up AI event listeners...');
    
    socketService.onSessionStatus((data) => {
      console.log('Session status:', data);
      if (!isMountedRef.current) return;
      
      if (data.status === 'active') {
        setIsConnected(true);
        setConnectionAttempts(0);
        toast({
          title: "Session Active",
          description: "Voice interface is ready",
        });
      } else if (data.status === 'ended') {
        setIsConnected(false);
      }
    });

    socketService.onAudioResponse((data) => {
      if (data.index <= 2) {
        console.log('🔊 Audio chunk received:', data.index, '/', data.total);
      }
      
      if (data.transcript && onTranscriptUpdate) {
        onTranscriptUpdate(data.transcript);
      }
      
      // Play audio response
      if (data.audio || data.chunk) {
        const audioData = data.audio || data.chunk;
        if (audioData) {
          audioService.playAudioResponse(audioData, data.index, data.total, data.sessionId);
        }
      }
    });

    socketService.onTranscript((data) => {
      console.log('📝 Transcript:', data.text);
      if (data.text && onTranscriptUpdate) {
        onTranscriptUpdate(data.text);
      }
    });

    socketService.onAIThinking((data) => {
      console.log('🤔 AI is thinking:', data.message);
      setIsAISpeaking(true);
      toast({
        title: "AI Thinking",
        description: data.message || "Processing your request...",
      });
    });

    socketService.onAITyping((data) => {
      if (!isMountedRef.current) return;
      
      if (data.status === 'started') {
        console.log('⌨️ AI is typing...');
        setIsAISpeaking(true);
        toast({
          title: "AI Typing",
          description: "Generating response..."
        });
      } else {
        console.log('✅ AI finished typing');
        setIsAISpeaking(false);
      }
    });

    socketService.onAIFinished((data) => {
      console.log('🏁 AI finished speaking');
      setIsAISpeaking(false);
    });

    socketService.onError((error) => {
      console.error('❌ Socket error:', error);
      if (!isMountedRef.current) return;
      
      toast({
        title: "Connection Error",
        description: "Failed to connect to voice service",
        variant: "destructive",
      });
    });

    return () => {
      socketService.removeAllListeners();
    };
  }, [onTranscriptUpdate, toast]);

  // Handle mic toggle
  const handleMicToggle = useCallback(async () => {
    if (isToggling) return;
    
    setIsToggling(true);
    
    try {
      if (!isMicOn) {
        // Turn mic on
        await turnMicOn();
      } else {
        // Turn mic off
        turnMicOff();
      }
    } catch (error) {
      console.error('❌ Error toggling mic:', error);
      toast({
        title: "Microphone Error",
        description: "Failed to toggle microphone",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  }, [isMicOn, isToggling, toast]);

  // Turn mic on
  const turnMicOn = async () => {
    console.log('🎤 Turning mic ON');
    
    try {
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } 
      });
      
      setMediaStream(stream);
      
      // Connect to socket service
      await socketService.connect();
      
      // Start recording
      socketService.startRecording();
      
      // Start speech recognition
      speechRecognition.start();
      
      setIsMicOn(true);
      
      toast({
        title: "Microphone On",
        description: "Voice interface is active",
      });
      
      console.log('✅ Mic turned ON successfully');
    } catch (error) {
      console.error('❌ Failed to turn mic on:', error);
      throw error;
    }
  };

  // Turn mic off
  const turnMicOff = () => {
    console.log('🎤 Turning mic OFF');
    
    // Stop recording
    socketService.stopRecording();
    
    // Stop speech recognition
    speechRecognition.stop();
    
    // Stop media stream
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    
    setIsMicOn(false);
    setIsAISpeaking(false);
    setIsUserInterrupting(false);
    
    toast({
      title: "Microphone Off",
      description: "Voice interface is inactive",
    });
    
    console.log('✅ Mic turned OFF successfully');
  };

  // Handle interruption button click
  const handleInterruptionClick = useCallback(() => {
    if (!interruptionManager.canInterrupt()) {
      const stats = interruptionManager.getStats();
      console.log('⚠️ Cannot interrupt:', stats);
      
      if (!stats.isAISpeaking) {
        toast({
          title: "No AI Speaking",
          description: "There's nothing to interrupt",
        });
      } else if (stats.timeSinceLastInterruption < 2000) {
        toast({
          title: "Cooldown Active",
          description: "Please wait before interrupting again",
        });
      }
      return;
    }
    
    console.log('🚫 Manual interruption triggered');
    interruptionManager.triggerInterruption('button');
  }, [toast]);

  // Get button state and styling
  const getButtonState = () => {
    if (isToggling) return 'toggling';
    if (isUserInterrupting) return 'interrupting';
    if (isAISpeaking) return 'ai-speaking';
    if (isMicOn) return 'listening';
    return 'idle';
  };

  const buttonState = getButtonState();

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {/* Main Mic Button */}
      <Button
        onClick={handleMicToggle}
        disabled={isToggling}
        className={cn(
          "relative w-16 h-16 rounded-full transition-all duration-300 ease-in-out",
          "shadow-lg hover:shadow-xl",
          {
            // Idle state
            "bg-gray-500 hover:bg-gray-600 text-white": buttonState === 'idle',
            
            // Listening state
            "bg-green-500 hover:bg-green-600 text-white animate-pulse": buttonState === 'listening',
            
            // AI speaking state
            "bg-blue-500 hover:bg-blue-600 text-white": buttonState === 'ai-speaking',
            
            // Interrupting state
            "bg-red-500 hover:bg-red-600 text-white animate-bounce": buttonState === 'interrupting',
            
            // Toggling state
            "bg-yellow-500 hover:bg-yellow-600 text-white": buttonState === 'toggling',
          }
        )}
      >
        {isToggling ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : isMicOn ? (
          <Mic className="w-6 h-6" />
        ) : (
          <MicOff className="w-6 h-6" />
        )}
        
        {/* Status indicator ring */}
        <div className={cn(
          "absolute inset-0 rounded-full border-2 transition-all duration-300",
          {
            "border-transparent": buttonState === 'idle',
            "border-green-400 animate-ping": buttonState === 'listening',
            "border-blue-400 animate-pulse": buttonState === 'ai-speaking',
            "border-red-400 animate-ping": buttonState === 'interrupting',
            "border-yellow-400": buttonState === 'toggling',
          }
        )} />
      </Button>

      {/* Interruption Button */}
      {showInterruptionButton && (
        <Button
          onClick={handleInterruptionClick}
          disabled={!interruptionManager.canInterrupt()}
          variant="outline"
          size="sm"
          className={cn(
            "transition-all duration-300",
            {
              "opacity-50 cursor-not-allowed": !interruptionManager.canInterrupt(),
              "bg-red-100 border-red-300 text-red-700 hover:bg-red-200": interruptionManager.canInterrupt(),
            }
          )}
        >
          <VolumeX className="w-4 h-4 mr-2" />
          Interrupt AI
        </Button>
      )}

      {/* Status Text */}
      <div className="text-sm text-center">
        {buttonState === 'idle' && "Click to start"}
        {buttonState === 'listening' && "Listening..."}
        {buttonState === 'ai-speaking' && "AI is speaking"}
        {buttonState === 'interrupting' && "Interrupting..."}
        {buttonState === 'toggling' && "Connecting..."}
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="text-xs text-orange-600">
          {isConnecting ? "Connecting..." : "Not connected"}
        </div>
      )}

      {/* Interruption Stats (Debug) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mt-2">
          <div>Interruptions: {interruptionManager.getStats().totalInterruptions}</div>
          <div>Can interrupt: {interruptionManager.canInterrupt() ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
} 