import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';

export const WebSocketConnectionTest: React.FC = () => {
  const [renderCount, setRenderCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [stats, setStats] = useState<any>(null);

  // Force re-renders to test connection stability
  useEffect(() => {
    const interval = setInterval(() => {
      setRenderCount(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Update connection status
  useEffect(() => {
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
      
      setStats(socketService.getConnectionStats());
    };
    
    updateStatus();
    const interval = setInterval(updateStatus, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const connect = async () => {
    try {
      await socketService.connect('test-user');
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const disconnect = () => {
    socketService.disconnect();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'rate-limited': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        WebSocket Connection Test
      </h2>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-300">Render Count:</span>
          <span className="font-medium">{renderCount}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-300">Connection Status:</span>
          <span className={`font-medium ${getStatusColor(connectionStatus)}`}>
            {connectionStatus.toUpperCase()}
          </span>
        </div>
        
        {stats && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-300">Recent Connections:</span>
              <span className="font-medium">{stats.recentConnections}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-300">Success Rate:</span>
              <span className="font-medium">
                {stats.recentConnections > 0 
                  ? `${Math.round((stats.successfulConnections / stats.recentConnections) * 100)}%`
                  : 'N/A'
                }
              </span>
            </div>
          </>
        )}
      </div>
      
      <div className="mt-6 space-y-3">
        <button
          onClick={connect}
          disabled={connectionStatus === 'connecting' || connectionStatus === 'connected'}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          Connect
        </button>
        
        <button
          onClick={disconnect}
          disabled={connectionStatus === 'disconnected'}
          className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <div className="font-medium mb-2">Test Instructions:</div>
          <ul className="space-y-1">
            <li>• This component re-renders every second to test connection stability</li>
            <li>• The connection should remain stable during re-renders</li>
            <li>• Watch the console for connection lifecycle logs</li>
            <li>• Connection should not be torn down and re-established repeatedly</li>
          </ul>
        </div>
      </div>
    </div>
  );
}; 