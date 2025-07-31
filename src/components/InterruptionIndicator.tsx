import { useState, useEffect } from "react";
import { VolumeX, Mic, AlertTriangle } from "lucide-react";
import { interruptionManager } from "@/services/InterruptionManager";
import { cn } from "@/lib/utils";

interface InterruptionIndicatorProps {
  className?: string;
  showStats?: boolean;
  showVisualEffects?: boolean;
}

export function InterruptionIndicator({ 
  className,
  showStats = true,
  showVisualEffects = true
}: InterruptionIndicatorProps) {
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isUserInterrupting, setIsUserInterrupting] = useState(false);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [canInterrupt, setCanInterrupt] = useState(false);

  useEffect(() => {
    // Set up interruption manager callbacks
    interruptionManager.setCallbacks({
      onInterruptionStart: () => {
        setIsUserInterrupting(true);
        setInterruptionCount(prev => prev + 1);
      },
      onInterruptionEnd: () => {
        setIsUserInterrupting(false);
      },
      onAISpeakingStart: () => {
        setIsAISpeaking(true);
      },
      onAISpeakingEnd: () => {
        setIsAISpeaking(false);
      }
    });

    // Update state periodically
    const updateState = () => {
      const state = interruptionManager.getState();
      const stats = interruptionManager.getStats();
      
      setIsAISpeaking(state.isAISpeaking);
      setIsUserInterrupting(state.isUserInterrupting);
      setInterruptionCount(stats.totalInterruptions);
      setCanInterrupt(interruptionManager.canInterrupt());
    };

    // Update immediately
    updateState();

    // Set up interval for updates
    const interval = setInterval(updateState, 100);

    return () => {
      clearInterval(interval);
    };
  }, []);

  if (!isAISpeaking && !isUserInterrupting && !showStats) {
    return null; // Don't show when nothing is happening
  }

  return (
    <div className={cn(
      "fixed top-4 right-4 z-50 transition-all duration-300",
      className
    )}>
      {/* Main Indicator */}
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-lg shadow-lg backdrop-blur-sm",
        "border-2 transition-all duration-300",
        {
          // AI Speaking state
          "bg-blue-50 border-blue-200 text-blue-800": isAISpeaking && !isUserInterrupting,
          
          // Interrupting state
          "bg-red-50 border-red-200 text-red-800 animate-pulse": isUserInterrupting,
          
          // Idle state (when showing stats)
          "bg-gray-50 border-gray-200 text-gray-800": !isAISpeaking && !isUserInterrupting && showStats,
        }
      )}>
        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300",
          {
            "bg-blue-100 text-blue-600": isAISpeaking && !isUserInterrupting,
            "bg-red-100 text-red-600 animate-bounce": isUserInterrupting,
            "bg-gray-100 text-gray-600": !isAISpeaking && !isUserInterrupting,
          }
        )}>
          {isUserInterrupting ? (
            <VolumeX className="w-4 h-4" />
          ) : isAISpeaking ? (
            <Mic className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
        </div>

        {/* Text */}
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {isUserInterrupting && "Interrupting AI..."}
            {isAISpeaking && !isUserInterrupting && "AI is speaking"}
            {!isAISpeaking && !isUserInterrupting && "Voice Interface"}
          </span>
          
          {showStats && (
            <span className="text-xs opacity-75">
              {isUserInterrupting && "Stopping audio playback"}
              {isAISpeaking && !isUserInterrupting && "You can interrupt by speaking"}
              {!isAISpeaking && !isUserInterrupting && `Interruptions: ${interruptionCount}`}
            </span>
          )}
        </div>

        {/* Visual Effects */}
        {showVisualEffects && (
          <>
            {/* Pulse ring for AI speaking */}
            {isAISpeaking && !isUserInterrupting && (
              <div className="absolute inset-0 rounded-lg border-2 border-blue-300 animate-ping opacity-75" />
            )}
            
            {/* Bounce ring for interrupting */}
            {isUserInterrupting && (
              <div className="absolute inset-0 rounded-lg border-2 border-red-300 animate-ping opacity-75" />
            )}
          </>
        )}
      </div>

      {/* Interruption Button (when AI is speaking) */}
      {isAISpeaking && !isUserInterrupting && (
        <button
          onClick={() => interruptionManager.triggerInterruption('button')}
          disabled={!canInterrupt}
          className={cn(
            "mt-2 w-full px-3 py-2 text-xs font-medium rounded-md transition-all duration-300",
            "border-2 border-red-200 hover:border-red-300",
            {
              "bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer": canInterrupt,
              "bg-gray-50 text-gray-400 cursor-not-allowed": !canInterrupt,
            }
          )}
        >
          {canInterrupt ? "Click to Interrupt" : "Cooldown Active"}
        </button>
      )}

      {/* Progress bar for interruption cooldown */}
      {isAISpeaking && !canInterrupt && (
        <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
          <div 
            className="bg-red-500 h-1 rounded-full transition-all duration-100"
            style={{
              width: `${Math.min(100, (Date.now() - interruptionManager.getStats().lastInterruptionTime) / 20)}%`
            }}
          />
        </div>
      )}
    </div>
  );
} 