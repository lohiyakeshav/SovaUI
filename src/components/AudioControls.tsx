import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { audioService } from '../services/audioService';
import { socketService } from '../services/socketService';

interface AudioControlsProps {
  className?: string;
}

export function AudioControls({ className }: AudioControlsProps) {
  const [metrics, setMetrics] = useState<any>({});
  const [isVisible, setIsVisible] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(0.7);
  const [volume, setVolume] = useState(0.8);
  const [sentencePauses, setSentencePauses] = useState(true);
  const [dynamicVolume, setDynamicVolume] = useState(true);

  // Update metrics every second
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(audioService.getPerformanceMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handlePlaybackRateChange = (value: number[]) => {
    const newRate = value[0];
    setPlaybackRate(newRate);
    audioService.updateConfig({ defaultPlaybackRate: newRate });
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    audioService.updateConfig({ volume: newVolume });
  };

  const handleSentencePausesChange = (checked: boolean) => {
    setSentencePauses(checked);
    audioService.updateConfig({ 
      sentencePauseDuration: checked ? 0.3 : 0 
    });
  };

  const handleDynamicVolumeChange = (checked: boolean) => {
    setDynamicVolume(checked);
    audioService.updateConfig({ dynamicVolume: checked });
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const resetMetrics = () => {
    audioService.cleanup();
    setMetrics({});
  };

  if (!isVisible) {
    return (
      <Button
        onClick={toggleVisibility}
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50"
      >
        🔊 Audio Controls
      </Button>
    );
  }

  return (
    <Card className={`fixed bottom-4 right-4 w-80 z-50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Audio Performance</CardTitle>
          <Button
            onClick={toggleVisibility}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            ×
          </Button>
        </div>
        <CardDescription className="text-xs">
          Real-time audio processing metrics and controls
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Performance Metrics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Success Rate:</span>
            <Badge variant={metrics.successRate === '100%' ? 'default' : 'secondary'}>
              {metrics.successRate || '0%'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>Chunks Processed:</span>
            <span className="font-mono">{metrics.totalChunksProcessed || 0}</span>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>Avg Decode Time:</span>
            <span className="font-mono">{metrics.averageDecodeTimeMs || '0'}ms</span>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>Failed Decodes:</span>
            <Badge variant={metrics.failedDecodes > 0 ? 'destructive' : 'secondary'}>
              {metrics.failedDecodes || 0}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>AI Speaking:</span>
            <Badge variant={metrics.isCurrentlySpeaking ? 'default' : 'secondary'}>
              {metrics.isCurrentlySpeaking ? 'Yes' : 'No'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>Speech Quality:</span>
            <Badge variant={
              metrics.speechQuality === 'good' ? 'default' : 
              metrics.speechQuality === 'quiet' ? 'destructive' : 'secondary'
            }>
              {metrics.speechQuality || 'Unknown'}
            </Badge>
          </div>
        </div>

        {/* Playback Rate Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Playback Speed:</span>
            <span className="font-mono">{playbackRate.toFixed(1)}x</span>
          </div>
          <Slider
            value={[playbackRate]}
            onValueChange={handlePlaybackRateChange}
            max={1.0}
            min={0.2}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Volume Control */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Volume:</span>
            <span className="font-mono">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume]}
            onValueChange={handleVolumeChange}
            max={1.0}
            min={0.0}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Advanced Controls */}
        <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span>Dynamic Volume:</span>
            <Switch
              checked={dynamicVolume}
              onCheckedChange={handleDynamicVolumeChange}
              className="scale-75"
            />
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <span>Sentence Pauses:</span>
            <Switch
              checked={sentencePauses}
              onCheckedChange={handleSentencePausesChange}
              className="scale-75"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={resetMetrics}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            Reset Metrics
          </Button>
          <Button
            onClick={async () => {
              await audioService.initialize();
              await audioService.resumeAudioContext();
            }}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            Resume Audio
          </Button>
        </div>
        
        {/* Interrupt Button */}
        <div className="pt-2">
          <Button
            onClick={async () => {
              await audioService.initialize();
              audioService.interrupt();
              socketService.interrupt();
            }}
            variant="destructive"
            size="sm"
            className="w-full text-xs"
          >
            🚫 Stop All Audio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 