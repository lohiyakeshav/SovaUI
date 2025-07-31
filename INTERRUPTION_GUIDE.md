# Voice Interface Interruption System

This guide explains how to use the comprehensive interruption system for your voice interface with Gemini Live API.

## 🚀 Quick Start

1. **Visit the demo page**: Navigate to `/interruption-demo` to test the full functionality
2. **Start the voice interface**: Click the mic button to begin
3. **Test interruptions**: Speak while the AI is talking or use the interruption buttons

## 🎯 Features

### ✅ Voice Interruption
- **Automatic detection**: When you speak while the AI is talking, it automatically stops the AI
- **Configurable threshold**: Adjust the voice detection sensitivity (-60dB to -20dB)
- **Cooldown protection**: Prevents rapid-fire interruptions (configurable 0.5s to 5s)

### ✅ Button Interruption
- **Manual control**: Click "Interrupt AI" button to stop AI speech
- **Visual feedback**: Button state changes based on interruption availability
- **Cooldown indicator**: Progress bar shows when you can interrupt again

### ✅ Visual Feedback
- **Real-time indicators**: Shows AI speaking, user interrupting, and connection status
- **Animated effects**: Pulse, bounce, and ping animations for different states
- **Status text**: Clear descriptions of current state

### ✅ Configuration
- **Voice threshold**: Adjust how sensitive voice interruption detection is
- **Cooldown timing**: Set how long to wait between interruptions
- **Auto-restart**: Automatically restart recording after interruption
- **Visual effects**: Toggle animations and indicators

## 🏗️ Architecture

### Core Components

1. **InterruptionManager** (`src/services/InterruptionManager.ts`)
   - Central service that manages all interruption logic
   - Integrates with AudioService and SocketService
   - Handles voice activity detection for interruptions
   - Manages interruption state and cooldowns

2. **EnhancedMicButton** (`src/components/EnhancedMicButton.tsx`)
   - Enhanced version of the original MicButton
   - Integrates with InterruptionManager
   - Provides visual feedback for different states
   - Includes built-in interruption button

3. **InterruptionIndicator** (`src/components/InterruptionIndicator.tsx`)
   - Floating indicator showing current state
   - Real-time statistics and controls
   - Configurable visibility and effects

4. **useInterruption Hook** (`src/hooks/useInterruption.ts`)
   - React hook for easy integration
   - Provides state, actions, and configuration
   - Handles callbacks and updates

### Integration Points

```typescript
// Audio Service Integration
audioService.interrupt() // Stops all audio playback
audioService.handleUserInterruption() // Handles user-triggered interruptions

// Socket Service Integration  
socketService.interrupt() // Sends interruption signal to backend
socketService.onAIThinking() // Detects when AI starts processing
socketService.onAITyping() // Detects when AI starts generating response
socketService.onAIFinished() // Detects when AI finishes speaking

// Voice Activity Detection
voiceActivityDetection.onSpeechStart() // Detects when user starts speaking
voiceActivityDetection.onSpeechEnd() // Detects when user stops speaking
```

## 📖 Usage Examples

### Basic Integration

```typescript
import { useInterruption } from '@/hooks/useInterruption';

function MyComponent() {
  const {
    isAISpeaking,
    canInterrupt,
    triggerInterruption,
    updateConfig
  } = useInterruption({
    onInterruptionStart: () => console.log('Interruption started'),
    onInterruptionEnd: () => console.log('Interruption ended')
  });

  return (
    <div>
      {isAISpeaking && (
        <button 
          onClick={() => triggerInterruption('button')}
          disabled={!canInterrupt}
        >
          Interrupt AI
        </button>
      )}
    </div>
  );
}
```

### Advanced Configuration

```typescript
import { interruptionManager } from '@/services/InterruptionManager';

// Configure interruption behavior
interruptionManager.updateConfig({
  enableVoiceInterruption: true,
  enableButtonInterruption: true,
  voiceInterruptionThreshold: -35, // dB threshold
  interruptionCooldown: 2000, // 2 seconds
  visualFeedbackDuration: 1500, // 1.5 seconds
  autoRestartAfterInterruption: true,
  logInterruptions: true
});

// Set up callbacks
interruptionManager.setCallbacks({
  onInterruptionStart: () => {
    // Handle interruption start
    console.log('AI interrupted');
  },
  onAISpeakingStart: () => {
    // Handle AI starting to speak
    console.log('AI started speaking');
  },
  onAISpeakingEnd: () => {
    // Handle AI stopping
    console.log('AI stopped speaking');
  }
});
```

### Using the Enhanced Mic Button

```typescript
import { EnhancedMicButton } from '@/components/EnhancedMicButton';

function VoiceInterface() {
  const [transcript, setTranscript] = useState('');
  const [isInterrupting, setIsInterrupting] = useState(false);

  return (
    <EnhancedMicButton
      onTranscriptUpdate={setTranscript}
      onInterruptionStateChange={setInterrupting}
      showInterruptionButton={true}
      className="my-custom-class"
    />
  );
}
```

### Adding the Interruption Indicator

```typescript
import { InterruptionIndicator } from '@/components/InterruptionIndicator';

function App() {
  return (
    <div>
      {/* Your app content */}
      <InterruptionIndicator
        showStats={true}
        showVisualEffects={true}
        className="custom-indicator"
      />
    </div>
  );
}
```

## ⚙️ Configuration Options

### InterruptionManager Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableVoiceInterruption` | boolean | `true` | Enable automatic voice interruption |
| `enableButtonInterruption` | boolean | `true` | Enable manual button interruption |
| `voiceInterruptionThreshold` | number | `-35` | Voice detection threshold in dB |
| `interruptionCooldown` | number | `2000` | Cooldown between interruptions in ms |
| `visualFeedbackDuration` | number | `1500` | Duration of visual feedback in ms |
| `autoRestartAfterInterruption` | boolean | `true` | Auto-restart recording after interruption |
| `logInterruptions` | boolean | `true` | Enable console logging |

### Voice Threshold Guidelines

| Environment | Recommended Threshold |
|-------------|----------------------|
| Quiet room | `-40` to `-35` dB |
| Office | `-35` to `-30` dB |
| Noisy environment | `-30` to `-25` dB |
| Very noisy | `-25` to `-20` dB |

## 🔧 Troubleshooting

### Common Issues

1. **Voice interruption not working**
   - Check microphone permissions
   - Adjust voice threshold (try higher values like -30dB)
   - Ensure `enableVoiceInterruption` is true

2. **Button interruption not working**
   - Verify AI is actually speaking (`isAISpeaking` state)
   - Check cooldown period (wait 2 seconds between interruptions)
   - Ensure `enableButtonInterruption` is true

3. **Audio not stopping**
   - Check AudioService integration
   - Verify socket connection is active
   - Check browser console for errors

4. **Visual feedback not showing**
   - Ensure InterruptionIndicator is mounted
   - Check `showVisualEffects` prop
   - Verify CSS animations are enabled

### Debug Mode

Enable debug logging by setting `logInterruptions: true` in the configuration:

```typescript
interruptionManager.updateConfig({
  logInterruptions: true
});
```

This will show detailed console logs about:
- Interruption triggers
- State changes
- Audio service calls
- Voice activity detection

## 🎨 Customization

### Styling the Components

All components use Tailwind CSS classes and can be customized:

```typescript
// Custom styling for EnhancedMicButton
<EnhancedMicButton
  className="my-custom-mic-button"
  // ... other props
/>

// Custom styling for InterruptionIndicator
<InterruptionIndicator
  className="my-custom-indicator"
  // ... other props
/>
```

### Custom Callbacks

You can add custom logic to interruption events:

```typescript
const {
  triggerInterruption,
  updateConfig
} = useInterruption({
  onInterruptionStart: () => {
    // Custom logic when interruption starts
    playInterruptionSound();
    showCustomNotification();
  },
  onAISpeakingStart: () => {
    // Custom logic when AI starts speaking
    dimLights();
    showSpeakingIndicator();
  }
});
```

## 🚀 Performance Considerations

1. **Update Intervals**: The `useInterruption` hook updates state every 100ms by default. Adjust `updateInterval` for performance vs responsiveness.

2. **Voice Activity Detection**: VAD runs continuously when enabled. Consider disabling in quiet environments.

3. **Visual Effects**: Animations can be disabled for better performance on low-end devices.

4. **Memory Management**: Always clean up when unmounting components:

```typescript
useEffect(() => {
  return () => {
    interruptionManager.cleanup();
  };
}, []);
```

## 📱 Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 14.3+)
- **Mobile browsers**: Full support with proper permissions

## 🔒 Security Considerations

1. **Microphone Access**: Always request microphone permissions explicitly
2. **Audio Data**: Audio is processed locally and not stored
3. **Network**: Interruption signals are sent to your backend only
4. **Permissions**: Users must grant microphone access for voice interruption

## 📚 API Reference

### InterruptionManager Methods

```typescript
// Initialize the manager
await interruptionManager.initialize(mediaStream?: MediaStream)

// Trigger an interruption
interruptionManager.triggerInterruption(source: 'voice' | 'button' | 'manual')

// Check if interruption is possible
interruptionManager.canInterrupt(): boolean

// Get current state
interruptionManager.getState(): InterruptionState

// Get statistics
interruptionManager.getStats(): InterruptionStats

// Update configuration
interruptionManager.updateConfig(config: Partial<InterruptionConfig>)

// Set callbacks
interruptionManager.setCallbacks(callbacks: InterruptionCallbacks)

// Enable/disable interruptions
interruptionManager.setInterruptionEnabled(enabled: boolean)

// Cleanup resources
interruptionManager.cleanup()
```

### useInterruption Hook

```typescript
const {
  // State
  isAISpeaking,
  isUserInterrupting,
  canInterrupt,
  interruptionCount,
  lastInterruptionTime,
  
  // Actions
  triggerInterruption,
  setInterruptionEnabled,
  updateConfig,
  
  // Configuration
  config,
  
  // Statistics
  getStats,
} = useInterruption(options)
```

## 🤝 Contributing

To extend the interruption system:

1. **Add new interruption sources**: Extend the `triggerInterruption` method
2. **Custom visual feedback**: Create new indicator components
3. **Additional configuration**: Add new options to `InterruptionConfig`
4. **Performance optimizations**: Improve update intervals and detection algorithms

## 📄 License

This interruption system is part of your voice interface project. Feel free to modify and extend as needed. 