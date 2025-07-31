import { useState, useEffect, useCallback } from 'react';
import { interruptionManager } from '@/services/InterruptionManager';
import type { InterruptionState, InterruptionConfig } from '@/services/InterruptionManager';

export interface UseInterruptionReturn {
  // State
  isAISpeaking: boolean;
  isUserInterrupting: boolean;
  canInterrupt: boolean;
  interruptionCount: number;
  lastInterruptionTime: number;
  
  // Actions
  triggerInterruption: (source?: 'voice' | 'button' | 'manual') => void;
  setInterruptionEnabled: (enabled: boolean) => void;
  updateConfig: (config: Partial<InterruptionConfig>) => void;
  
  // Configuration
  config: InterruptionConfig;
  
  // Statistics
  getStats: () => ReturnType<typeof interruptionManager.getStats>;
  
  // Callbacks
  onInterruptionStart?: () => void;
  onInterruptionEnd?: () => void;
  onAISpeakingStart?: () => void;
  onAISpeakingEnd?: () => void;
  onUserSpeakingStart?: () => void;
  onUserSpeakingEnd?: () => void;
}

export interface UseInterruptionOptions {
  onInterruptionStart?: () => void;
  onInterruptionEnd?: () => void;
  onAISpeakingStart?: () => void;
  onAISpeakingEnd?: () => void;
  onUserSpeakingStart?: () => void;
  onUserSpeakingEnd?: () => void;
  autoInitialize?: boolean;
  updateInterval?: number;
}

export function useInterruption(options: UseInterruptionOptions = {}): UseInterruptionReturn {
  const {
    onInterruptionStart,
    onInterruptionEnd,
    onAISpeakingStart,
    onAISpeakingEnd,
    onUserSpeakingStart,
    onUserSpeakingEnd,
    autoInitialize = true,
    updateInterval = 100
  } = options;

  // State
  const [state, setState] = useState<InterruptionState>(interruptionManager.getState());
  const [config, setConfig] = useState<InterruptionConfig>(interruptionManager.getConfig());
  const [canInterrupt, setCanInterrupt] = useState(interruptionManager.canInterrupt());

  // Initialize interruption manager
  useEffect(() => {
    if (autoInitialize) {
      interruptionManager.initialize();
    }
  }, [autoInitialize]);

  // Set up callbacks
  useEffect(() => {
    interruptionManager.setCallbacks({
      onInterruptionStart: () => {
        onInterruptionStart?.();
      },
      onInterruptionEnd: () => {
        onInterruptionEnd?.();
      },
      onAISpeakingStart: () => {
        onAISpeakingStart?.();
      },
      onAISpeakingEnd: () => {
        onAISpeakingEnd?.();
      },
      onUserSpeakingStart: () => {
        onUserSpeakingStart?.();
      },
      onUserSpeakingEnd: () => {
        onUserSpeakingEnd?.();
      }
    });
  }, [onInterruptionStart, onInterruptionEnd, onAISpeakingStart, onAISpeakingEnd, onUserSpeakingStart, onUserSpeakingEnd]);

  // Update state periodically
  useEffect(() => {
    const updateState = () => {
      setState(interruptionManager.getState());
      setConfig(interruptionManager.getConfig());
      setCanInterrupt(interruptionManager.canInterrupt());
    };

    // Update immediately
    updateState();

    // Set up interval
    const interval = setInterval(updateState, updateInterval);

    return () => {
      clearInterval(interval);
    };
  }, [updateInterval]);

  // Actions
  const triggerInterruption = useCallback((source: 'voice' | 'button' | 'manual' = 'manual') => {
    interruptionManager.triggerInterruption(source);
  }, []);

  const setInterruptionEnabled = useCallback((enabled: boolean) => {
    interruptionManager.setInterruptionEnabled(enabled);
  }, []);

  const updateConfig = useCallback((newConfig: Partial<InterruptionConfig>) => {
    interruptionManager.updateConfig(newConfig);
  }, []);

  const getStats = useCallback(() => {
    return interruptionManager.getStats();
  }, []);

  return {
    // State
    isAISpeaking: state.isAISpeaking,
    isUserInterrupting: state.isUserInterrupting,
    canInterrupt,
    interruptionCount: state.interruptionCount,
    lastInterruptionTime: state.lastInterruptionTime,
    
    // Actions
    triggerInterruption,
    setInterruptionEnabled,
    updateConfig,
    
    // Configuration
    config,
    
    // Statistics
    getStats,
    
    // Callbacks (for reference)
    onInterruptionStart,
    onInterruptionEnd,
    onAISpeakingStart,
    onAISpeakingEnd,
    onUserSpeakingStart,
    onUserSpeakingEnd,
  };
} 