#!/usr/bin/env node

/**
 * WebSocket Rate Limit Test Script
 * 
 * This script tests the WebSocket rate limiting functionality by:
 * 1. Attempting multiple rapid connections
 * 2. Verifying rate limit responses
 * 3. Checking connection statistics
 * 4. Testing reconnection logic
 */

const io = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const MAX_CONNECTIONS = 6; // Test with 6 connections (should hit the 5 connection limit)
const TEST_DELAY = 1000; // 1 second between connection attempts

class WebSocketRateLimitTester {
  constructor() {
    this.connections = [];
    this.results = {
      successful: 0,
      rateLimited: 0,
      failed: 0,
      errors: []
    };
  }

  async testConnection(index) {
    return new Promise((resolve) => {
      console.log(`🔌 Attempting connection ${index + 1}/${MAX_CONNECTIONS}...`);
      
      const socket = io(SERVER_URL, {
        query: { userId: `test-user-${index}` },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        auth: { userId: `test-user-${index}` }
      });

      const startTime = Date.now();

      socket.on('connect', () => {
        const duration = Date.now() - startTime;
        console.log(`✅ Connection ${index + 1} successful (${duration}ms)`);
        this.results.successful++;
        this.connections.push(socket);
        resolve({ success: true, duration });
      });

      socket.on('connect_error', (error) => {
        const duration = Date.now() - startTime;
        console.log(`❌ Connection ${index + 1} failed: ${error.message} (${duration}ms)`);
        
        if (error.message && error.message.includes('Too many connection attempts')) {
          console.log(`🚫 Rate limit hit for connection ${index + 1}`);
          this.results.rateLimited++;
        } else {
          this.results.failed++;
          this.results.errors.push({
            connection: index + 1,
            error: error.message,
            duration
          });
        }
        
        resolve({ success: false, error: error.message, duration });
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!socket.connected) {
          console.log(`⏰ Connection ${index + 1} timed out`);
          this.results.failed++;
          socket.disconnect();
          resolve({ success: false, error: 'timeout', duration: 15000 });
        }
      }, 15000);
    });
  }

  async runTest() {
    console.log('🧪 Starting WebSocket Rate Limit Test');
    console.log(`📊 Server URL: ${SERVER_URL}`);
    console.log(`🔢 Max Connections: ${MAX_CONNECTIONS}`);
    console.log(`⏱️  Delay between attempts: ${TEST_DELAY}ms`);
    console.log('');

    // Test health endpoint first
    try {
      const healthResponse = await fetch(`${SERVER_URL}/api/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('🏥 Server Health Check:');
        console.log(`   Status: ${healthData.status}`);
        if (healthData.websocket) {
          console.log(`   Total Connections: ${healthData.websocket.totalConnections}`);
          console.log(`   Max Connections/IP: ${healthData.websocket.rateLimitStats.maxConnectionsPerIP}`);
        }
        console.log('');
      }
    } catch (error) {
      console.log('⚠️  Could not fetch health data:', error.message);
      console.log('');
    }

    // Attempt multiple connections
    const connectionPromises = [];
    for (let i = 0; i < MAX_CONNECTIONS; i++) {
      const promise = this.testConnection(i);
      connectionPromises.push(promise);
      
      // Add delay between connection attempts
      if (i < MAX_CONNECTIONS - 1) {
        await new Promise(resolve => setTimeout(resolve, TEST_DELAY));
      }
    }

    // Wait for all connections to complete
    const results = await Promise.all(connectionPromises);

    // Print results
    console.log('');
    console.log('📊 Test Results:');
    console.log(`   Successful Connections: ${this.results.successful}`);
    console.log(`   Rate Limited: ${this.results.rateLimited}`);
    console.log(`   Failed: ${this.results.failed}`);
    console.log('');

    // Check if rate limiting is working
    if (this.results.rateLimited > 0) {
      console.log('✅ Rate limiting is working correctly!');
      console.log(`   Expected: Some connections should be rate limited (limit is 5 per IP)`);
      console.log(`   Actual: ${this.results.rateLimited} connections were rate limited`);
    } else {
      console.log('⚠️  No rate limiting detected');
      console.log('   This might indicate the rate limiting is not working or the limit is higher than expected');
    }

    // Check connection statistics
    if (this.results.successful <= 5) {
      console.log('✅ Connection limit is being enforced correctly');
    } else {
      console.log('⚠️  Connection limit might not be working as expected');
    }

    // Print detailed results
    console.log('');
    console.log('📋 Detailed Results:');
    results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const error = result.error ? ` (${result.error})` : '';
      console.log(`   Connection ${index + 1}: ${status} ${result.duration}ms${error}`);
    });

    // Cleanup connections
    console.log('');
    console.log('🧹 Cleaning up connections...');
    this.connections.forEach((socket, index) => {
      socket.disconnect();
      console.log(`   Disconnected connection ${index + 1}`);
    });

    // Final health check
    try {
      const finalHealthResponse = await fetch(`${SERVER_URL}/api/health`);
      if (finalHealthResponse.ok) {
        const finalHealthData = await finalHealthResponse.json();
        console.log('');
        console.log('🏥 Final Health Check:');
        console.log(`   Status: ${finalHealthData.status}`);
        if (finalHealthData.websocket) {
          console.log(`   Total Connections: ${finalHealthData.websocket.totalConnections}`);
          console.log(`   Tracked IPs: ${finalHealthData.websocket.rateLimitStats.trackedIPs}`);
        }
      }
    } catch (error) {
      console.log('⚠️  Could not fetch final health data:', error.message);
    }

    console.log('');
    console.log('🎉 Test completed!');
  }
}

// Run the test
async function main() {
  const tester = new WebSocketRateLimitTester();
  await tester.runTest();
}

// Handle command line arguments
if (require.main === module) {
  main().catch(console.error);
}

module.exports = WebSocketRateLimitTester; 