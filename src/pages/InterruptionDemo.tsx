import { useState } from "react";
import { EnhancedMicButton } from "@/components/EnhancedMicButton";
import { InterruptionIndicator } from "@/components/InterruptionIndicator";
import { interruptionManager } from "@/services/InterruptionManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { VolumeX, Settings, Info } from "lucide-react";

export function InterruptionDemo() {
  const [transcript, setTranscript] = useState("");
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [showIndicator, setShowIndicator] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showVisualEffects, setShowVisualEffects] = useState(true);
  const [interruptionConfig, setInterruptionConfig] = useState({
    enableVoiceInterruption: true,
    enableButtonInterruption: true,
    voiceInterruptionThreshold: -35,
    interruptionCooldown: 2000,
    visualFeedbackDuration: 1500,
    autoRestartAfterInterruption: true,
    logInterruptions: true
  });

  // Update interruption configuration
  const updateConfig = (key: string, value: any) => {
    const newConfig = { ...interruptionConfig, [key]: value };
    setInterruptionConfig(newConfig);
    interruptionManager.updateConfig(newConfig);
  };

  // Manual interruption trigger
  const triggerManualInterruption = () => {
    if (interruptionManager.canInterrupt()) {
      interruptionManager.triggerInterruption('manual');
    }
  };

  // Get current stats
  const getStats = () => {
    return interruptionManager.getStats();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Voice Interface Interruption Demo
        </h1>
        <p className="text-lg text-gray-600">
          Test the interruption functionality with voice and button controls
        </p>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Controls */}
        <div className="space-y-6">
          {/* Enhanced Mic Button */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <VolumeX className="w-5 h-5" />
                Voice Interface
              </CardTitle>
              <CardDescription>
                Use the enhanced mic button with interruption capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <EnhancedMicButton
                  onTranscriptUpdate={setTranscript}
                  onInterruptionStateChange={setIsInterrupting}
                  showInterruptionButton={true}
                />
              </div>
            </CardContent>
          </Card>

          {/* Manual Interruption Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Interruption</CardTitle>
              <CardDescription>
                Trigger interruptions manually for testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={triggerManualInterruption}
                disabled={!interruptionManager.canInterrupt()}
                variant="destructive"
                className="w-full"
              >
                <VolumeX className="w-4 h-4 mr-2" />
                {interruptionManager.canInterrupt() ? "Interrupt AI" : "Cannot Interrupt"}
              </Button>
              
              <div className="text-sm text-gray-600">
                <div>Can interrupt: {interruptionManager.canInterrupt() ? "Yes" : "No"}</div>
                <div>AI speaking: {getStats().isAISpeaking ? "Yes" : "No"}</div>
                <div>User interrupting: {getStats().isUserInterrupting ? "Yes" : "No"}</div>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Interruption Settings
              </CardTitle>
              <CardDescription>
                Configure interruption behavior and thresholds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Voice Interruption */}
              <div className="flex items-center justify-between">
                <Label htmlFor="voice-interruption">Voice Interruption</Label>
                <Switch
                  id="voice-interruption"
                  checked={interruptionConfig.enableVoiceInterruption}
                  onCheckedChange={(checked) => updateConfig('enableVoiceInterruption', checked)}
                />
              </div>

              {/* Button Interruption */}
              <div className="flex items-center justify-between">
                <Label htmlFor="button-interruption">Button Interruption</Label>
                <Switch
                  id="button-interruption"
                  checked={interruptionConfig.enableButtonInterruption}
                  onCheckedChange={(checked) => updateConfig('enableButtonInterruption', checked)}
                />
              </div>

              {/* Voice Threshold */}
              <div className="space-y-2">
                <Label>Voice Interruption Threshold: {interruptionConfig.voiceInterruptionThreshold} dB</Label>
                <Slider
                  value={[interruptionConfig.voiceInterruptionThreshold]}
                  onValueChange={([value]) => updateConfig('voiceInterruptionThreshold', value)}
                  min={-60}
                  max={-20}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Cooldown */}
              <div className="space-y-2">
                <Label>Interruption Cooldown: {interruptionConfig.interruptionCooldown}ms</Label>
                <Slider
                  value={[interruptionConfig.interruptionCooldown]}
                  onValueChange={([value]) => updateConfig('interruptionCooldown', value)}
                  min={500}
                  max={5000}
                  step={500}
                  className="w-full"
                />
              </div>

              {/* Auto Restart */}
              <div className="flex items-center justify-between">
                <Label htmlFor="auto-restart">Auto Restart After Interruption</Label>
                <Switch
                  id="auto-restart"
                  checked={interruptionConfig.autoRestartAfterInterruption}
                  onCheckedChange={(checked) => updateConfig('autoRestartAfterInterruption', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Display */}
        <div className="space-y-6">
          {/* Transcript Display */}
          <Card>
            <CardHeader>
              <CardTitle>Live Transcript</CardTitle>
              <CardDescription>
                Real-time transcription of your voice input
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="min-h-[200px] p-4 bg-gray-50 rounded-lg border">
                {transcript ? (
                  <p className="text-gray-800 whitespace-pre-wrap">{transcript}</p>
                ) : (
                  <p className="text-gray-500 italic">Start speaking to see transcript here...</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Interruption Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                Interruption Statistics
              </CardTitle>
              <CardDescription>
                Real-time statistics about interruption usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Total Interruptions:</span>
                  <span className="font-mono">{getStats().totalInterruptions}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Interruption:</span>
                  <span className="font-mono">
                    {getStats().lastInterruptionTime > 0 
                      ? `${Math.floor((Date.now() - getStats().lastInterruptionTime) / 1000)}s ago`
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Time Since Last:</span>
                  <span className="font-mono">{getStats().timeSinceLastInterruption}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>AI Speaking:</span>
                  <span className={getStats().isAISpeaking ? "text-green-600" : "text-red-600"}>
                    {getStats().isAISpeaking ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>User Interrupting:</span>
                  <span className={getStats().isUserInterrupting ? "text-red-600" : "text-gray-600"}>
                    {getStats().isUserInterrupting ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visual Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Visual Settings</CardTitle>
              <CardDescription>
                Configure visual feedback and indicators
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="show-indicator">Show Interruption Indicator</Label>
                <Switch
                  id="show-indicator"
                  checked={showIndicator}
                  onCheckedChange={setShowIndicator}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-stats">Show Statistics</Label>
                <Switch
                  id="show-stats"
                  checked={showStats}
                  onCheckedChange={setShowStats}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-effects">Show Visual Effects</Label>
                <Switch
                  id="show-effects"
                  checked={showVisualEffects}
                  onCheckedChange={setShowVisualEffects}
                />
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>How to Use</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>1. <strong>Start the voice interface</strong> by clicking the mic button</p>
                <p>2. <strong>Speak to the AI</strong> and wait for a response</p>
                <p>3. <strong>Interrupt the AI</strong> by:</p>
                <ul className="ml-4 space-y-1">
                  <li>• Speaking while the AI is talking (voice interruption)</li>
                  <li>• Clicking the "Interrupt AI" button</li>
                  <li>• Using the manual interruption button</li>
                </ul>
                <p>4. <strong>Watch the visual feedback</strong> in the indicator</p>
                <p>5. <strong>Adjust settings</strong> to customize the behavior</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Interruption Indicator */}
      {showIndicator && (
        <InterruptionIndicator
          showStats={showStats}
          showVisualEffects={showVisualEffects}
        />
      )}
    </div>
  );
} 