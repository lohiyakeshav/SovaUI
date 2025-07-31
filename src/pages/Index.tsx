import { useState, useEffect, useCallback } from "react";
import { DarkVeil } from "@/components/DarkVeil";
import { TargetCursor } from "@/components/TargetCursor";
import { InteractiveSoundBall } from "@/components/InteractiveSoundBall";
import { MicButton } from "@/components/MicButton";
import { InterruptionIndicator } from "@/components/InterruptionIndicator";
import { LoadingScreen } from "@/components/LoadingScreen";
import { VoiceTranscript } from "@/components/VoiceTranscript";
import { AudioTest } from "@/components/AudioTest";
import ThemeSwitch from "@/components/ThemeSwitch";
import { useTheme } from "@/contexts/ThemeContext";
import { Heart, VolumeX, Mic } from "lucide-react";
import { interruptionManager } from "@/services/InterruptionManager";

const Index = () => {
  const { isDark, toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    console.log('📋 INDEX RECEIVED TRANSCRIPT:', transcript);
    setCurrentTranscript(transcript);
    setIsListening(true);
    
    // Keep listening state active longer
    setTimeout(() => {
      setIsListening(false);
    }, 8000); // Increased from 5 seconds to 8 seconds
  }, []);

  const handleMicStateChange = useCallback((enabled: boolean, recording: boolean) => {
    console.log('Mic state changed:', { enabled, recording }); // Debug log
    
    // Simple state update without debouncing to prevent complexity
    setIsMicOn(enabled);
    setIsListening(enabled); // When mic is on, we're listening
  }, []);

  const handleInterruptionStateChange = useCallback((isInterrupting: boolean) => {
    console.log('Interruption state changed:', isInterrupting);
    setIsInterrupting(isInterrupting);
  }, []);

  // Debug function to test interruption
  const testInterruption = useCallback(() => {
    if (interruptionManager.canInterrupt()) {
      console.log('🧪 Testing manual interruption');
      interruptionManager.triggerInterruption('manual');
    } else {
      console.log('⚠️ Cannot interrupt - AI not speaking or cooldown active');
    }
  }, []);

  // Debug function to simulate AI speaking
  const simulateAISpeaking = useCallback(() => {
    console.log('🧪 Simulating AI speaking');
    // This will trigger the interruption button to show
    setIsInterrupting(false); // Reset interruption state
    // The AI speaking state should be set by the actual audio chunks
  }, []);



  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <TargetCursor />
      
      {/* Theme Switch */}
      <ThemeSwitch isDark={isDark} onToggle={toggleTheme} />
      
      {/* Sova watermark - subtle and elegant */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 safe-area-top">
        <div className={`backdrop-blur-xl border rounded-full px-6 py-2 shadow-2xl transition-all duration-300 ${
          isDark 
            ? 'bg-black/20 border-white/10' 
            : 'bg-white/90 border-blue-900/20'
        }`}>
          <span className={`text-lg font-light tracking-[0.2em] uppercase select-none transition-colors duration-300 ${
            isDark ? 'text-white/60' : 'text-blue-900/70'
          }`}>
            sova
          </span>
        </div>
      </div>

      {/* Debug Interruption Button - Only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-20 right-4 z-50 space-y-2">
          <button
            onClick={testInterruption}
            className={`
              backdrop-blur-xl border rounded-lg px-3 py-2 shadow-lg
              transition-all duration-300 hover:scale-105
              ${isDark ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-white/90 border-red-600/30 text-red-700'}
            `}
            title="Test Interruption (Debug)"
          >
            <div className="flex items-center gap-2">
              <VolumeX size={16} />
              <span className="text-sm font-medium">Test Interrupt</span>
            </div>
          </button>
          
          <button
            onClick={simulateAISpeaking}
            className={`
              backdrop-blur-xl border rounded-lg px-3 py-2 shadow-lg
              transition-all duration-300 hover:scale-105
              ${isDark ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/90 border-blue-600/30 text-blue-700'}
            `}
            title="Simulate AI Speaking (Debug)"
          >
            <div className="flex items-center gap-2">
              <Mic size={16} />
              <span className="text-sm font-medium">Simulate AI</span>
            </div>
          </button>
          
          {/* Debug Status */}
          <div className={`
            backdrop-blur-xl border rounded-lg px-3 py-2 shadow-lg
            ${isDark ? 'bg-black/20 border-white/20 text-white/80' : 'bg-white/90 border-blue-900/20 text-blue-900/80'}
          `}>
            <div className="text-xs space-y-1">
              <div>AI Speaking: {isInterrupting ? 'No (Interrupted)' : isMicOn ? 'Unknown' : 'No'}</div>
              <div>Can Interrupt: {interruptionManager.canInterrupt() ? 'Yes' : 'No'}</div>
              <div>Mic On: {isMicOn ? 'Yes' : 'No'}</div>
              <div>Interrupting: {isInterrupting ? 'Yes' : 'No'}</div>
              <div>Interruptions: {interruptionManager.getStats().totalInterruptions}</div>
            </div>
          </div>
        </div>
      )}

      {/* Full screen background */}
      <div className={`fixed inset-0 w-screen h-screen overflow-hidden transition-colors duration-300 ${
        isDark ? 'bg-black' : 'bg-background'
      }`}>
        {/* <DarkVeil
          speed={0.5}
          hueShift={0}
          noiseIntensity={0}
          scanlineFrequency={0}
          scanlineIntensity={0}
          warpAmount={0}
        /> */}
      </div>

      {/* Interactive Sound Ball in center */}
      <div className="fixed inset-0 z-10">
        <InteractiveSoundBall isListening={isMicOn} />
      </div>

      {/* Voice Transcript Display */}
      <VoiceTranscript transcript={currentTranscript} isListening={isListening} />

      {/* Interruption Indicator */}
      <InterruptionIndicator 
        showStats={true}
        showVisualEffects={true}
      />

      {/* Mic Button with transcript handler and interruption support */}
      <MicButton 
        onTranscriptUpdate={handleTranscriptUpdate} 
        onMicStateChange={handleMicStateChange}
        onInterruptionStateChange={handleInterruptionStateChange}
        showInterruptionButton={true}
      />
      
      {/* Footer - Apple-style elegant */}
      <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 z-40 safe-area-bottom">
        <div className="mb-8">
          <div className={`backdrop-blur-xl border rounded-2xl px-6 py-3 shadow-2xl transition-all duration-300 ${
            isDark 
              ? 'bg-black/20 border-white/20' 
              : 'bg-white/90 border-blue-900/20'
          }`}>
            <div className="text-center">
              <p className={`text-sm font-medium flex items-center gap-2 transition-colors duration-300 ${
                isDark ? 'text-white/80' : 'text-blue-900/80'
              }`}>
                Crafted with{" "}
                <Heart 
                  size={14} 
                  className="text-red-500 heartbeat cursor-target" 
                  fill="currentColor"
                />{" "}
                by{" "}
                <a 
                  href="https://keshavlohiya.vercel.app/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`cursor-target transition-all duration-300 font-semibold tracking-tight ${
                    isDark 
                      ? 'text-veil-primary hover:text-veil-accent' 
                      : 'text-blue-700 hover:text-blue-900'
                  }`}
                >
                  Keshav Lohiya
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Index;