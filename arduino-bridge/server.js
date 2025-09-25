const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

// Configuration
const ARDUINO_PORT = '/dev/tty.usbserial-A5069RR4'; // Change this to your Arduino port (COM3, COM4, etc. on Windows, /dev/ttyUSB0 on Linux)
const SERVER_PORT = 3001;
const WEBSOCKET_PORT = 8080;

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Middleware
app.use(cors());
app.use(express.json());

// Data storage
let currentData = {
  battery: 0,
  temperature: 20.6,
  humidity: 66,
  isOnline: false,
  lastSeen: null,
  plantingLogs: []
};

// Initialize Serial connection to Arduino
let serialPort;
let parser;

function initializeSerial() {
  try {
    serialPort = new SerialPort({
      path: ARDUINO_PORT,
      baudRate: 9600
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.on('open', () => {
      console.log(`✅ Connected to Arduino on ${ARDUINO_PORT}`);
      currentData.isOnline = true;
      broadcastToClients({ type: 'connection', status: 'connected' });
    });

    serialPort.on('error', (err) => {
      console.error('❌ Serial port error:', err.message);
      currentData.isOnline = false;
      broadcastToClients({ type: 'connection', status: 'error', error: err.message });
      
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        initializeSerial();
      }, 5000);
    });

    serialPort.on('close', () => {
      console.log('🔌 Serial connection closed');
      currentData.isOnline = false;
      broadcastToClients({ type: 'connection', status: 'disconnected' });
    });

    // Parse incoming data from Arduino
    parser.on('data', (data) => {
      try {
        const jsonData = JSON.parse(data.trim());
        handleArduinoData(jsonData);
      } catch (error) {
        console.log('📝 Raw data:', data.trim());
      }
    });

  } catch (error) {
    console.error('❌ Failed to initialize serial connection:', error.message);
    currentData.isOnline = false;
  }
}

function handleArduinoData(data) {
  console.log('📊 Received data:', data);

  switch (data.type) {
    case 'system_status':
      currentData.battery = data.battery || 0;
      currentData.temperature = data.temperature || 20.6;
      currentData.humidity = data.humidity || 66;
      currentData.lastSeen = new Date().toISOString();
      currentData.isOnline = true;
      
      broadcastToClients({
        type: 'system_update',
        data: currentData
      });
      break;

    case 'planting_event':
      const plantingEvent = {
        time: new Date().toLocaleTimeString(),
        depth: `${data.depth}cm`,
        status: data.status,
        timestamp: Date.now()
      };
      
      currentData.plantingLogs.unshift(plantingEvent);
      
      // Keep only last 50 entries
      if (currentData.plantingLogs.length > 50) {
        currentData.plantingLogs = currentData.plantingLogs.slice(0, 50);
      }
      
      broadcastToClients({
        type: 'planting_event',
        event: plantingEvent,
        logs: currentData.plantingLogs
      });
      break;

    case 'log':
      console.log('🤖 Arduino log:', data.message);
      broadcastToClients({
        type: 'log',
        message: data.message,
        timestamp: new Date().toISOString()
      });
      break;
  }
}

function broadcastToClients(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('🔗 New WebSocket client connected');
  
  // Send current data to new client
  ws.send(JSON.stringify({
    type: 'initial_data',
    data: currentData
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle commands from web client
      if (data.type === 'command' && serialPort && serialPort.isOpen) {
        serialPort.write(data.command + '\n');
      }
    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket client disconnected');
  });
});

// REST API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: currentData,
    arduinoConnected: currentData.isOnline
  });
});

app.post('/api/command', (req, res) => {
  const { command } = req.body;
  
  if (!serialPort || !serialPort.isOpen) {
    return res.status(503).json({
      success: false,
      message: 'Arduino not connected'
    });
  }

  serialPort.write(command + '\n');
  res.json({
    success: true,
    message: `Command "${command}" sent to Arduino`
  });
});

app.get('/api/logs', (req, res) => {
  res.json({
    success: true,
    logs: currentData.plantingLogs
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    arduinoConnected: currentData.isOnline
  });
});

// Start the server
app.listen(SERVER_PORT, () => {
  console.log(`🚀 Server running on http://localhost:${SERVER_PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${WEBSOCKET_PORT}`);
});

// Initialize serial connection
initializeSerial();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (serialPort && serialPort.isOpen) {
    serialPort.close();
  }
  
  wss.close();
  server.close();
  process.exit(0);
});