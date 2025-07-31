import React, { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';
import { webSocketManager } from '../services/WebSocketManager';

interface HealthData {
  status: string;
  websocket?: {
    totalConnections: number;
    connectionsByIP: Record<string, number>;
    transports: {
      websocket: number;
      polling: number;
    };
    rateLimitStats: {
      trackedIPs: number;
      maxConnectionsPerIP: number;
    };
  };
}

export const WebSocketHealth: React.FC = () => {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [connectionStats, setConnectionStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'}/api/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      const data = await response.json();
      setHealthData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health data');
    } finally {
      setIsLoading(false);
    }
  };

  const updateConnectionStats = () => {
    const stats = socketService.getConnectionStats();
    setConnectionStats(stats);
  };

  useEffect(() => {
    // Fetch initial health data
    fetchHealthData();
    
    // Update connection stats every 5 seconds
    const interval = setInterval(updateConnectionStats, 5000);
    
    // Fetch health data every 30 seconds
    const healthInterval = setInterval(fetchHealthData, 30000);
    
    return () => {
      clearInterval(interval);
      clearInterval(healthInterval);
    };
  }, []);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getConnectionStatusColor = (isConnected: boolean): string => {
    return isConnected ? 'text-green-500' : 'text-red-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          WebSocket Health Monitor
        </h2>
        <button
          onClick={fetchHealthData}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Server Health */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Server Health
          </h3>
          
          {healthData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Status:</span>
                <span className={`font-medium ${getStatusColor(healthData.status)}`}>
                  {healthData.status.toUpperCase()}
                </span>
              </div>
              
              {healthData.websocket && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Total Connections:</span>
                    <span className="font-medium">{healthData.websocket.totalConnections}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">WebSocket Transports:</span>
                    <span className="font-medium">{healthData.websocket.transports.websocket}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Polling Transports:</span>
                    <span className="font-medium">{healthData.websocket.transports.polling}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Tracked IPs:</span>
                    <span className="font-medium">{healthData.websocket.rateLimitStats.trackedIPs}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Max Connections/IP:</span>
                    <span className="font-medium">{healthData.websocket.rateLimitStats.maxConnectionsPerIP}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Client Connection Stats */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Client Connection
          </h3>
          
          {connectionStats && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Status:</span>
                <span className={`font-medium ${getConnectionStatusColor(connectionStats.isConnected)}`}>
                  {connectionStats.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Connecting:</span>
                <span className="font-medium">{connectionStats.isConnecting ? 'Yes' : 'No'}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Rate Limited:</span>
                <span className={`font-medium ${connectionStats.isRateLimited ? 'text-red-500' : 'text-green-500'}`}>
                  {connectionStats.isRateLimited ? 'Yes' : 'No'}
                </span>
              </div>
              
              {connectionStats.isRateLimited && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-300">Reset In:</span>
                  <span className="font-medium text-red-500">
                    {formatTime(connectionStats.timeUntilRateLimitReset)}
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Reconnect Attempts:</span>
                <span className="font-medium">
                  {connectionStats.reconnectAttempts}/{connectionStats.maxReconnectAttempts}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Recent Connections:</span>
                <span className="font-medium">{connectionStats.recentConnections}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Success Rate:</span>
                <span className="font-medium">
                  {connectionStats.recentConnections > 0 
                    ? `${Math.round((connectionStats.successfulConnections / connectionStats.recentConnections) * 100)}%`
                    : 'N/A'
                  }
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connection History */}
      {connectionStats && connectionStats.connectionHistory > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
            Connection History
          </h3>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Total attempts: {connectionStats.connectionHistory} | 
            Recent attempts: {connectionStats.recentConnections} | 
            Successful: {connectionStats.successfulConnections} | 
            Failed: {connectionStats.failedConnections}
          </div>
        </div>
      )}

      {/* Rate Limit Info */}
      {connectionStats?.isRateLimited && (
        <div className="mt-4 p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
          <div className="font-medium">Rate Limited</div>
          <div className="text-sm">
            You have exceeded the connection limit. Please wait {formatTime(connectionStats.timeUntilRateLimitReset)} before attempting to connect again.
          </div>
        </div>
      )}
    </div>
  );
}; 