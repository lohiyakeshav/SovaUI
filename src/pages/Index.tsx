import { useState, useEffect, useCallback } from "react";
import { DarkVeil } from "@/components/DarkVeil";
import { TargetCursor } from "@/components/TargetCursor";
import { InteractiveSoundBall } from "@/components/InteractiveSoundBall";
import { MicButton } from "@/components/MicButton";
import { LoadingScreen } from "@/components/LoadingScreen";
import { VoiceTranscript } from "@/components/VoiceTranscript";
import { AudioTest } from "@/components/AudioTest";
import { AudioControls } from "@/components/AudioControls";
import { AdaptiveChunkTest } from "@/components/AdaptiveChunkTest";
import ThemeSwitch from "@/components/ThemeSwitch";
import { useTheme } from "@/contexts/ThemeContext";
import { Heart } from "lucide-react";

const Index = () => {
  const { isDark, toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [showAdaptiveTest, setShowAdaptiveTest] = useState(false);

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

      {/* Adaptive Chunk Test Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setShowAdaptiveTest(!showAdaptiveTest)}
          className={`backdrop-blur-xl border rounded-lg px-4 py-2 shadow-lg transition-all duration-300 text-sm font-medium ${
            isDark 
              ? 'bg-black/20 border-white/10 text-white/80 hover:bg-black/30' 
              : 'bg-white/90 border-blue-900/20 text-blue-900/80 hover:bg-white/95'
          }`}
        >
          {showAdaptiveTest ? 'Hide' : 'Show'} Adaptive Test
        </button>
      </div>

      {/* Audio Test Button - Commented out to prevent automatic testing */}
      {/* <AudioTest /> */}

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

      {/* Adaptive Chunk Test Overlay */}
      {showAdaptiveTest && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-4 overflow-auto">
            <AdaptiveChunkTest />
          </div>
        </div>
      )}

      {/* Mic Button with transcript handler */}
      <MicButton 
        onTranscriptUpdate={handleTranscriptUpdate} 
        onMicStateChange={handleMicStateChange}
      />
      
      {/* Audio Controls */}
      <AudioControls />
      
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