import React, { useState } from 'react';
import { audioService } from '../services/audioService';

export const AudioTest: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testAudioInitialization = async () => {
    try {
      addResult('🎵 Testing audio initialization...');
      await audioService.initialize();
      addResult('✅ Audio service initialized successfully');
    } catch (error) {
      addResult(`❌ Audio initialization failed: ${error}`);
    }
  };

  const testAudioContext = async () => {
    try {
      addResult('🔊 Testing audio context...');
      await audioService.resumeAudioContext();
      addResult('✅ Audio context resumed successfully');
    } catch (error) {
      addResult(`❌ Audio context test failed: ${error}`);
    }
  };

  const testAudioPlayback = async () => {
    try {
      addResult('🎵 Testing audio playback...');
      setIsPlaying(true);
      
      // Create a simple test tone
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 1);
      
      addResult('✅ Test tone played successfully');
      setIsPlaying(false);
    } catch (error) {
      addResult(`❌ Audio playback test failed: ${error}`);
      setIsPlaying(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Audio System Test
      </h2>
      
      <div className="space-y-4 mb-6">
        <button
          onClick={testAudioInitialization}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Test Audio Initialization
        </button>
        
        <button
          onClick={testAudioContext}
          className="w-full px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
        >
          Test Audio Context
        </button>
        
        <button
          onClick={testAudioPlayback}
          disabled={isPlaying}
          className="w-full px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
        >
          {isPlaying ? 'Playing Test Tone...' : 'Test Audio Playback'}
        </button>
        
        <button
          onClick={clearResults}
          className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Clear Results
        </button>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Test Results:
        </h3>
        
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
          {testResults.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No test results yet. Run a test to see results here.
            </p>
          ) : (
            <div className="space-y-1">
              {testResults.map((result, index) => (
                <div key={index} className="text-sm font-mono">
                  {result}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <div className="font-medium mb-2">Test Instructions:</div>
          <ul className="space-y-1">
            <li>• Click "Test Audio Initialization" to verify the audio service works</li>
            <li>• Click "Test Audio Context" to ensure audio context is resumed</li>
            <li>• Click "Test Audio Playback" to hear a test tone</li>
            <li>• Check the browser console for detailed logs</li>
            <li>• If you hear the test tone, audio is working correctly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}; 