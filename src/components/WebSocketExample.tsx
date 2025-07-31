import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';
import { webSocketManager } from '../services/WebSocketManager';

export const WebSocketExample: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'rate-limited'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [useManager, setUseManager] = useState(false);

  // Update connection status
  const updateStatus = () => {
    const isConnected = socketService.isConnected();
    const isConnecting = socketService.isConnecting();
    const isRateLimited = socketService.isRateLimited();

    if (isRateLimited) {
      setConnectionStatus('rate-limited');
    } else if (isConnecting) {
      setConnectionStatus('connecting');
    } else if (isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }

    // Update stats
    setStats(socketService.getConnectionStats());
  };

  // Connect using socketService
  const connectWithService = async () => {
    try {
      setError(null);
      setConnectionStatus('connecting');
      
      await socketService.connect('example-user');
      setConnectionStatus('connected');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      
      if (errorMessage.includes('Too many connection attempts')) {
        setConnectionStatus('rate-limited');
      } else {
        setConnectionStatus('disconnected');
      }
    }
  };

  // Connect using WebSocketManager
  const connectWithManager = async () => {
    try {
      setError(null);
      setConnectionStatus('connecting');
      
      await webSocketManager.connect();
      setConnectionStatus('connected');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      
      if (errorMessage.includes('Too many connection attempts')) {
        setConnectionStatus('rate-limited');
      } else {
        setConnectionStatus('disconnected');
      }
    }
  };

  // Disconnect
  const disconnect = () => {
    if (useManager) {
      webSocketManager.disconnect();
    } else {
      socketService.disconnect();
    }
    setConnectionStatus('disconnected');
    setError(null);
  };

  // Setup event listeners
  useEffect(() => {
    // Setup socketService event listeners
    socketService.onError((error) => {
      console.error('Socket service error:', error);
      setError(error.message);
    });

    // Setup WebSocketManager event listeners
    webSocketManager.onConnect(() => {
      console.log('WebSocket manager connected');
      setConnectionStatus('connected');
    });

    webSocketManager.onDisconnect((reason) => {
      console.log('WebSocket manager disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    webSocketManager.onRateLimit((timeUntilReset) => {
      console.log('Rate limited, reset in:', timeUntilReset);
      setConnectionStatus('rate-limited');
    });

    webSocketManager.onError((error) => {
      console.error('WebSocket manager error:', error);
      setError(error.message);
    });

    // Update status every 2 seconds
    const interval = setInterval(updateStatus, 2000);

    return () => {
      clearInterval(interval);
      // Cleanup on unmount
      socketService.cleanup();
      webSocketManager.cleanup();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
        return 'text-yellow-500';
      case 'rate-limited':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'rate-limited':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        WebSocket Connection Example
      </h2>

      {/* Connection Type Toggle */}
      <div className="mb-6">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={useManager}
            onChange={(e) => setUseManager(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-700 dark:text-gray-300">
            Use WebSocket Manager (Advanced)
          </span>
        </label>
      </div>

      {/* Status Display */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div className="flex items-center space-x-2 mb-2">
          <span>{getStatusIcon(connectionStatus)}</span>
          <span className={`font-medium ${getStatusColor(connectionStatus)}`}>
            {connectionStatus.toUpperCase()}
          </span>
        </div>
        
        {connectionStatus === 'rate-limited' && stats && (
          <div className="text-sm text-red-600 dark:text-red-400">
            Rate limited. Reset in {Math.ceil(stats.timeUntilRateLimitReset / 1000)} seconds
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <div className="font-medium">Error:</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {/* Connection Controls */}
      <div className="mb-6 space-y-3">
        <button
          onClick={useManager ? connectWithManager : connectWithService}
          disabled={connectionStatus === 'connecting' || connectionStatus === 'rate-limited'}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
        </button>
        
        <button
          onClick={disconnect}
          disabled={connectionStatus === 'disconnected'}
          className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Disconnect
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Connection Statistics
          </h3>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Reconnect Attempts:</span>
              <span className="font-medium">
                {stats.reconnectAttempts}/{stats.maxReconnectAttempts}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Recent Connections:</span>
              <span className="font-medium">{stats.recentConnections}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Success Rate:</span>
              <span className="font-medium">
                {stats.recentConnections > 0 
                  ? `${Math.round((stats.successfulConnections / stats.recentConnections) * 100)}%`
                  : 'N/A'
                }
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-300">Rate Limited:</span>
              <span className={`font-medium ${stats.isRateLimited ? 'text-red-500' : 'text-green-500'}`}>
                {stats.isRateLimited ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
          Instructions:
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Click "Connect" to establish a WebSocket connection</li>
          <li>• If you get rate limited, wait 60 seconds before retrying</li>
          <li>• The connection will automatically reconnect on disconnection</li>
          <li>• Use the WebSocket Manager for advanced features</li>
          <li>• Always disconnect when done to prevent connection spam</li>
        </ul>
      </div>
    </div>
  );
}; 