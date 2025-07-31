import { useEffect, useState } from 'react';
import { BlurText } from './BlurText';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '@/contexts/ThemeContext';

interface VoiceTranscriptProps {
  transcript?: string;
  isListening: boolean;
}

export function VoiceTranscript({ transcript, isListening }: VoiceTranscriptProps) {
  const { isDark } = useTheme();
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [displayTranscript, setDisplayTranscript] = useState('');

  useEffect(() => {
    if (transcript && transcript.trim()) {
      console.log('🎨 VOICE TRANSCRIPT DISPLAYING:', transcript);
      
      // Update display transcript smoothly
      setDisplayTranscript(transcript);
      
      // Only add to history if it's significantly different
      setTranscriptHistory(prev => {
        const lastTranscript = prev[prev.length - 1];
        if (lastTranscript !== transcript) {
          return [...prev.slice(-4), transcript];
        }
        return prev;
      });
    }
  }, [transcript]);

  const handleAnimationComplete = () => {
    // Keep transcript visible for longer
    setTimeout(() => {
      setDisplayTranscript('');
    }, 5000); // Increased from 2 seconds to 5 seconds
  };

  return (
    <div className="fixed inset-x-0 bottom-24 z-30 pointer-events-none mb-20">
      <div className="flex items-center justify-center px-8">
        <div className="max-w-4xl w-full">
          <AnimatePresence mode="wait">
            {displayTranscript && (
              <motion.div
                key={displayTranscript}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className={`backdrop-blur-xl border rounded-2xl p-8 shadow-2xl transition-all duration-300 ${
                  isDark 
                    ? 'bg-black/20 border-white/10' 
                    : 'bg-white/90 border-blue-900/20'
                }`}
              >
                {/* Speech indicator */}
                <div className="flex items-center justify-center space-x-2 mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-75" />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse delay-150" />
                </div>
                
                <BlurText
                  text={displayTranscript}
                  delay={100}
                  className={`text-2xl md:text-3xl font-light text-center leading-relaxed transition-colors duration-300 ${
                    isDark ? 'text-white/90' : 'text-blue-900/90'
                  }`}
                  animateBy="words"
                  direction="bottom"
                  threshold={0.1}
                  stepDuration={0.25}
                  onAnimationComplete={handleAnimationComplete}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show "Speak to talk to the AI" when mic is active but no transcript */}
          <AnimatePresence>
            {isListening && !displayTranscript && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <div className={`backdrop-blur-xl border rounded-2xl p-6 shadow-xl transition-all duration-300 ${
                  isDark 
                    ? 'bg-black/10 border-white/5' 
                    : 'bg-white/90 border-blue-900/10'
                }`}>
                  <div className="flex items-center justify-center space-x-2 mb-4">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse delay-75" />
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse delay-150" />
                  </div>
                  <BlurText
                    text="Speak to talk to the AI"
                    delay={50}
                    className={`text-lg md:text-xl font-light text-center transition-colors duration-300 ${
                      isDark ? 'text-white/70' : 'text-blue-900/70'
                    }`}
                    animateBy="words"
                    direction="top"
                    threshold={0.1}
                    stepDuration={0.2}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
} 