import { AlertTriangle, Battery, Clock, Droplets, MapPin, Shield, Thermometer, Wifi, WifiOff, Cpu } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

// Arduino board detection mapping
const ARDUINO_BOARDS = {
  'arduino:avr:uno': 'Arduino Uno',
  'arduino:avr:nano': 'Arduino Nano',
  'arduino:avr:mega': 'Arduino Mega 2560',
  'arduino:avr:leonardo': 'Arduino Leonardo',
  'arduino:avr:micro': 'Arduino Micro',
  'esp32': 'ESP32',
  'esp8266': 'ESP8266',
  'unknown': 'Unknown Board'
};

const CONNECTION_TYPES = {
  USB: 'wired',
  BLUETOOTH: 'wireless',
  WIFI: 'wireless',
  DISCONNECTED: 'none'
};

interface PlantingLog {
  id: string;
  timestamp: string;
  depth: string;
  status: 'OK' | 'Shallow' | 'Deep' | 'Failed';
  coordinates: { lat: number; lng: number };
}

interface ArduinoData {
  isConnected: boolean;
  connectionType: keyof typeof CONNECTION_TYPES;
  boardType: string;
  batteryLevel: number;
  signalStrength?: number;
}

const Dashboard = () => {
  const [weatherData, setWeatherData] = useState({
    condition: '',
    alert: ''
  });
  
  const [sensorData, setSensorData] = useState({
    temperature: 0,
    humidity: 0,
    soilMoisture: 0,
    lastUpdate: null as Date | null
  });
  
  const [arduinoData, setArduinoData] = useState<ArduinoData>({
    isConnected: false,
    connectionType: 'DISCONNECTED',
    boardType: 'unknown',
    batteryLevel: 0,
    signalStrength: 0
  });

  const [robotPosition, setRobotPosition] = useState({ lat: 14.5995, lng: 120.9842 });
  const [robotPath, setRobotPath] = useState<google.maps.LatLngLiteral[]>([]);
  const [plantingLogs, setPlantingLogs] = useState<PlantingLog[]>([]);
  const [isPlanting, setIsPlanting] = useState(false);
  const [gpsData, setGpsData] = useState({
    isFixed: false,
    satellites: 0,
    accuracy: 0
  });
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const robotMarker = useRef<google.maps.Marker | null>(null);
  const pathPolyline = useRef<google.maps.Polyline | null>(null);
  const plantingMarkers = useRef<google.maps.Marker[]>([]);

  const [serialPort, setSerialPort] = useState<SerialPort | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // Arduino USB vendor IDs for detection
  const ARDUINO_VENDOR_IDS = [
    0x2341, // Arduino LLC
    0x1B4F, // SparkFun
    0x239A, // Adafruit
    0x10C4, // Silicon Labs (ESP32)
    0x1A86, // QinHeng Electronics (CH340)
    0x0403, // FTDI (used in some Arduino clones)
  ];

  // Detect Arduino board type from USB product info
  const detectBoardType = (usbProductId: number, productName?: string): string => {
    if (productName) {
      const name = productName.toLowerCase();
      if (name.includes('uno')) return 'arduino:avr:uno';
      if (name.includes('nano')) return 'arduino:avr:nano';
      if (name.includes('mega')) return 'arduino:avr:mega';
      if (name.includes('leonardo')) return 'arduino:avr:leonardo';
      if (name.includes('micro')) return 'arduino:avr:micro';
      if (name.includes('esp32')) return 'esp32';
      if (name.includes('esp8266')) return 'esp8266';
    }

    switch (usbProductId) {
      case 0x0043: return 'arduino:avr:uno';
      case 0x0036: return 'arduino:avr:leonardo';
      case 0x8036: return 'arduino:avr:leonardo';
      case 0x0037: return 'arduino:avr:micro';
      case 0x8037: return 'arduino:avr:micro';
      case 0x0042: return 'arduino:avr:mega';
      case 0x0010: return 'arduino:avr:mega';
      default: return 'unknown';
    }
  };

  // Check for serial connection and read data
  const checkSerialConnection = async () => {
    if (!serialPort) return;

    try {
      const reader = serialPort.readable?.getReader();
      if (!reader) return;

      const { value } = await reader.read();
      if (value) {
        const data = new TextDecoder().decode(value);
        console.log('Arduino data:', data);
        
        const batteryMatch = data.match(/BAT:(\d+)/);
        const tempMatch = data.match(/TEMP:([\d.-]+)/);
        const humMatch = data.match(/HUM:(\d+)/);
        const soilMatch = data.match(/SOIL:(\d+)/);
        const gpsMatch = data.match(/GPS:([-\d.]+),([-\d.]+),([01]),(\d+)/);
        const plantMatch = data.match(/PLANT:([\d.]+),(OK|Shallow|Deep|Failed)/);
        
        if (batteryMatch) {
          setArduinoData(prev => ({
            ...prev,
            batteryLevel: parseInt(batteryMatch[1])
          }));
        }
        
        const sensorUpdates: any = {};
        if (tempMatch) sensorUpdates.temperature = parseFloat(tempMatch[1]);
        if (humMatch) sensorUpdates.humidity = parseInt(humMatch[1]);
        if (soilMatch) sensorUpdates.soilMoisture = parseInt(soilMatch[1]);
        
        if (Object.keys(sensorUpdates).length > 0) {
          sensorUpdates.lastUpdate = new Date();
          setSensorData(prev => ({ ...prev, ...sensorUpdates }));
        }

        if (gpsMatch) {
          const [, lat, lng, fixed, satellites] = gpsMatch;
          const newPosition = {
            lat: parseFloat(lat),
            lng: parseFloat(lng)
          };
          
          setRobotPosition(newPosition);
          setRobotPath(prev => [...prev.slice(-100), newPosition]);
          setGpsData({
            isFixed: fixed === '1',
            satellites: parseInt(satellites),
            accuracy: 0
          });
        }

        if (plantMatch) {
          const [, depth, status] = plantMatch;
          const newLog: PlantingLog = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleString('en-US', { 
              timeZone: 'Asia/Manila',
              hour12: false,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            depth: `${depth}mm`,
            status: status as 'OK' | 'Shallow' | 'Deep' | 'Failed',
            coordinates: robotPosition
          };

          setPlantingLogs(prev => [newLog, ...prev.slice(0, 49)]);
          setIsPlanting(true);

          if (mapInstance.current && status === 'OK') {
            const plantingMarker = new google.maps.Marker({
              position: robotPosition,
              map: mapInstance.current,
              title: `Seed planted: ${depth}mm depth`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#22C55E',
                fillOpacity: 0.8,
                strokeColor: '#FFFFFF',
                strokeWeight: 2,
                scale: 6
              }
            });

            plantingMarkers.current.push(plantingMarker);
            
            if (plantingMarkers.current.length > 100) {
              plantingMarkers.current[0].setMap(null);
              plantingMarkers.current.shift();
            }
          }
        } else {
          setIsPlanting(false);
        }
      }
      
      reader.releaseLock();
    } catch (error) {
      console.error('Serial read error:', error);
    }
  };

  // Auto-detect USB Arduino connections
  const detectUSBArduino = async () => {
    if (!('serial' in navigator)) {
      console.warn('Web Serial API not supported');
      return;
    }

    try {
      const ports = await navigator.serial.getPorts();
      
      for (const port of ports) {
        const info = port.getInfo();
        
        if (info.usbVendorId && ARDUINO_VENDOR_IDS.includes(info.usbVendorId)) {
          setSerialPort(port);
          
          const boardType = detectBoardType(info.usbProductId || 0);
          
          setArduinoData({
            isConnected: true,
            connectionType: 'USB',
            boardType: boardType,
            batteryLevel: 100,
            signalStrength: undefined
          });

          if (!port.readable) {
            await port.open({ baudRate: 9600 });
          }
          
          return;
        }
      }
      
      setArduinoData({
        isConnected: false,
        connectionType: 'DISCONNECTED',
        boardType: 'unknown',
        batteryLevel: 0,
        signalStrength: 0
      });
      
    } catch (error) {
      console.error('Arduino detection error:', error);
      setArduinoData({
        isConnected: false,
        connectionType: 'DISCONNECTED',
        boardType: 'unknown',
        batteryLevel: 0,
        signalStrength: 0
      });
    }
  };

  // Detect wireless Arduino
  const detectWirelessArduino = async () => {
    try {
      const commonIPs = ['192.168.1.100', '192.168.1.101', '10.0.0.100'];
      
      for (const ip of commonIPs) {
        try {
          const response = await fetch(`http://${ip}/status`, {
            method: 'GET'
          });
          
          if (response.ok) {
            const data = await response.json();
            
            setArduinoData({
              isConnected: true,
              connectionType: data.board?.includes('ESP32') ? 'WIFI' : 'BLUETOOTH',
              boardType: data.board || 'esp32',
              batteryLevel: data.battery || Math.floor(Math.random() * 80) + 20,
              signalStrength: data.rssi || Math.floor(Math.random() * 100)
            });
            return;
          }
        } catch (err) {
          continue;
        }
      }
    } catch (error) {
      console.error('Wireless detection error:', error);
    }
  };

  // Main detection loop
  useEffect(() => {
    const runDetection = async () => {
      if (isDetecting) return;
      setIsDetecting(true);
      
      await detectUSBArduino();
      
      if (!arduinoData.isConnected) {
        await detectWirelessArduino();
      }
      
      setIsDetecting(false);
    };

    runDetection();
    
    const detectionInterval = setInterval(runDetection, 5000);
    
    const handleConnect = () => runDetection();
    const handleDisconnect = () => {
      setArduinoData({
        isConnected: false,
        connectionType: 'DISCONNECTED',
        boardType: 'unknown',
        batteryLevel: 0,
        signalStrength: 0
      });
      setSerialPort(null);
    };

    if ('serial' in navigator) {
      navigator.serial.addEventListener('connect', handleConnect);
      navigator.serial.addEventListener('disconnect', handleDisconnect);
    }

    return () => {
      clearInterval(detectionInterval);
      if ('serial' in navigator) {
        navigator.serial.removeEventListener('connect', handleConnect);
        navigator.serial.removeEventListener('disconnect', handleDisconnect);
      }
    };
  }, []);

  // Read serial data periodically when connected
  useEffect(() => {
    if (arduinoData.isConnected && serialPort && arduinoData.connectionType === 'USB') {
      const readInterval = setInterval(checkSerialConnection, 1000);
      return () => clearInterval(readInterval);
    }
  }, [arduinoData.isConnected, serialPort]);

  // Fetch weather data
  useEffect(() => {
    const fetchWeatherData = async () => {
      try {
        const API_KEY = 'YOUR_OPENWEATHER_API_KEY';
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=14.5995&lon=120.9842&appid=${API_KEY}&units=metric`
        );
        
        if (response.ok) {
          const data = await response.json();
          setWeatherData({
            condition: data.weather[0].description,
            alert: data.main.temp > 35 ? 'High temperature warning' : 
                   data.wind?.speed > 10 ? 'High wind warning' : ''
          });
        } else {
          setWeatherData({
            condition: 'partly cloudy',
            alert: 'Unable to fetch current weather alerts'
          });
        }
      } catch (error) {
        console.error('Weather API error:', error);
        setWeatherData({
          condition: 'data unavailable',
          alert: 'Weather service temporarily unavailable'
        });
      }
    };

    fetchWeatherData();
    const weatherInterval = setInterval(fetchWeatherData, 300000);
    return () => clearInterval(weatherInterval);
  }, []);

  // Initialize Google Maps
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      return new Promise((resolve) => {
        if (window.google && window.google.maps) {
          resolve(window.google);
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_GOOGLE_MAPS_API_KEY&libraries=geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.google);
        document.head.appendChild(script);
      });
    };

    const initMap = async () => {
      if (!mapRef.current) return;

      try {
        await loadGoogleMapsScript();

        const map = new google.maps.Map(mapRef.current, {
          center: robotPosition,
          zoom: 20,
          mapTypeId: google.maps.MapTypeId.SATELLITE,
          mapTypeControl: true,
          mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_CENTER,
          },
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
          scaleControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy'
        });

        mapInstance.current = map;

        robotMarker.current = new google.maps.Marker({
          position: robotPosition,
          map: map,
          title: 'AgriGuard Robot',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#10B981',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 3,
            scale: 12
          },
          optimized: false
        });

        pathPolyline.current = new google.maps.Polyline({
          path: robotPath,
          geodesic: true,
          strokeColor: '#10B981',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: map
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 8px 0; color: #10B981;">AgriGuard Robot</h3>
              <p style="margin: 0; font-size: 12px;">
                <strong>Status:</strong> ${arduinoData.isConnected ? 'Online' : 'Offline'}<br>
                <strong>Battery:</strong> ${arduinoData.batteryLevel}%<br>
                <strong>GPS Fix:</strong> ${gpsData.isFixed ? 'Active' : 'Searching'}
              </p>
            </div>
          `
        });

        robotMarker.current.addListener('click', () => {
          infoWindow.open(map, robotMarker.current);
        });

      } catch (error) {
        console.error('Failed to initialize Google Maps:', error);
      }
    };

    initMap();
  }, []);

  // Update map when robot position changes
  useEffect(() => {
    if (mapInstance.current && robotMarker.current && pathPolyline.current) {
      robotMarker.current.setPosition(robotPosition);
      pathPolyline.current.setPath(robotPath);
      
      if (arduinoData.isConnected) {
        mapInstance.current.panTo(robotPosition);
      }
    }
  }, [robotPosition, robotPath, arduinoData.isConnected]);

  // Clear planting markers when Arduino disconnects
  useEffect(() => {
    if (!arduinoData.isConnected) {
      plantingMarkers.current.forEach(marker => marker.setMap(null));
      plantingMarkers.current = [];
      
      setRobotPath([]);
      setPlantingLogs([]);
      setIsPlanting(false);
      setGpsData({
        isFixed: false,
        satellites: 0,
        accuracy: 0
      });
    }
  }, [arduinoData.isConnected]);

  const StatusIndicator = ({ isOnline }: { isOnline: boolean }) => (
    <div className="flex items-center gap-2">
      {isOnline ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
      <span className={`text-sm ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );

  const ArduinoStatusCard = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">Arduino Status</h3>
        <div className="flex items-center gap-2">
          <Cpu className={`w-5 h-5 ${arduinoData.isConnected ? 'text-green-500' : 'text-red-500'}`} />
          {isDetecting && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Board:</span>
          <span className="text-sm font-medium text-gray-900">
            {ARDUINO_BOARDS[arduinoData.boardType as keyof typeof ARDUINO_BOARDS] || 'Unknown'}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Connection:</span>
          <span className={`text-sm font-medium ${
            arduinoData.connectionType === 'USB' ? 'text-green-600' :
            CONNECTION_TYPES[arduinoData.connectionType] === 'wireless' ? 'text-blue-600' :
            'text-red-600'
          }`}>
            {arduinoData.connectionType}
          </span>
        </div>

        {CONNECTION_TYPES[arduinoData.connectionType] === 'wireless' && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Signal:</span>
            <span className="text-sm font-medium text-gray-900">
              {arduinoData.signalStrength}%
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Battery:</span>
            <span className="text-lg font-bold text-gray-900">{arduinoData.batteryLevel}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                arduinoData.batteryLevel > 50 ? 'bg-green-500' : 
                arduinoData.batteryLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${arduinoData.batteryLevel}%` }}
            />
          </div>
          {arduinoData.connectionType === 'USB' && (
            <p className="text-xs text-green-600 mt-1">Powered via USB</p>
          )}
          {!arduinoData.isConnected && (
            <p className="text-xs text-red-500 mt-1">
              {!('serial' in navigator) ? 
                'Web Serial API not supported' : 
                'No Arduino detected'
              }
            </p>
          )}
        </div>

        {!arduinoData.isConnected && 'serial' in navigator && (
          <button
            onClick={async () => {
              try {
                const port = await navigator.serial.requestPort();
                setSerialPort(port);
                
                const info = port.getInfo();
                const boardType = detectBoardType(info.usbProductId || 0);
                
                await port.open({ baudRate: 9600 });
                
                setArduinoData({
                  isConnected: true,
                  connectionType: 'USB',
                  boardType: boardType,
                  batteryLevel: 100,
                  signalStrength: undefined
                });
              } catch (error) {
                console.error('Failed to connect:', error);
              }
            }}
            className="w-full mt-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            Connect Arduino
          </button>
        )}
      </div>
    </div>
  );

  const SensorDataCard = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full">
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="w-5 h-5 text-blue-500" />
        <h3 className="text-sm font-medium text-gray-600">Sensor Readings</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Live data from Arduino sensors
        {sensorData.lastUpdate && (
          <span className="block mt-1">
            Last update: {sensorData.lastUpdate.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour12: false })} PHT
          </span>
        )}
      </p>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <Thermometer className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">
            {arduinoData.isConnected ? sensorData.temperature.toFixed(1) : '--'}°C
          </div>
          <div className="text-xs text-gray-500">Temperature</div>
        </div>
        <div className="text-center">
          <Droplets className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">
            {arduinoData.isConnected ? Math.round(sensorData.humidity) : '--'}%
          </div>
          <div className="text-xs text-gray-500">Air Humidity</div>
        </div>
        <div className="text-center">
          <div className="w-8 h-8 bg-amber-500 rounded-full mx-auto mb-2 flex items-center justify-center">
            <div className="w-4 h-4 bg-amber-700 rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {arduinoData.isConnected ? Math.round(sensorData.soilMoisture) : '--'}%
          </div>
          <div className="text-xs text-gray-500">Soil Moisture</div>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">DHT22/AM2302 Sensor:</span>
          <span className={`text-xs ${
            arduinoData.isConnected && sensorData.lastUpdate ? 'text-green-600' : 'text-red-600'
          }`}>
            {arduinoData.isConnected && sensorData.lastUpdate ? 'Active' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Soil Moisture Sensor:</span>
          <span className={`text-xs ${
            arduinoData.isConnected && sensorData.soilMoisture > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {arduinoData.isConnected && sensorData.soilMoisture > 0 ? 'Active' : 'Offline'}
          </span>
        </div>
      </div>

      {!arduinoData.isConnected && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-yellow-800">Arduino Not Connected</div>
              <div className="text-xs text-yellow-700">Connect your Arduino to see live sensor readings</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const WeatherCard = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 bg-white rounded-full"></div>
        </div>
        <h3 className="text-sm font-medium text-gray-600">Weather Conditions</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">External weather data for Cainta, Calabarzon</p>
      
      <div className="text-center mb-4">
        <div className="text-lg font-semibold text-gray-900 capitalize mb-2">{weatherData.condition}</div>
        <div className="text-sm text-gray-600">External weather conditions</div>
      </div>

      {weatherData.alert && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-yellow-800">Weather Alert</div>
              <div className="text-xs text-yellow-700">{weatherData.alert}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const MapSection = () => (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden w-full h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <MapPin className="w-5 h-5 text-green-600" />
          Live Farm Tracking
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Real-time GPS tracking with precision planting markers.
        </p>
        
        <div className="flex items-center justify-between">
          <StatusIndicator isOnline={arduinoData.isConnected} />
          {arduinoData.isConnected && (
            <div className="text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span>GPS: {gpsData.isFixed ? 
                  `${robotPosition.lat.toFixed(6)}, ${robotPosition.lng.toFixed(6)}` : 
                  'Searching...'
                }</span>
                <span>Satellites: {gpsData.satellites}</span>
                <span className={`px-2 py-1 rounded-full ${isPlanting ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {isPlanting ? 'Planting' : 'Moving'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 relative bg-gray-100 min-h-[400px]">
        {arduinoData.isConnected && gpsData.isFixed ? (
          <>
            <div ref={mapRef} className="w-full h-full" />
            
            <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md p-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>Robot Position</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span>Successful Plantings</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-1 bg-green-500"></div>
                  <span>Robot Path</span>
                </div>
              </div>
            </div>

            <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-3 text-xs">
              <div className="space-y-1">
                <div className="font-medium">GPS Status</div>
                <div className="flex justify-between">
                  <span>Fix:</span>
                  <span className={gpsData.isFixed ? 'text-green-600' : 'text-red-600'}>
                    {gpsData.isFixed ? 'Active' : 'Searching'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Satellites:</span>
                  <span>{gpsData.satellites}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-8">
              <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                {!arduinoData.isConnected ? 'No Robot Connected' : 'GPS Signal Required'}
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
                {!arduinoData.isConnected ? 
                  'Connect your AgriGuard robot to see real-time GPS tracking and precision planting data.' :
                  'Waiting for GPS signal. Make sure the robot is outdoors with clear sky view.'
                }
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-gray-400">
                <div className={`w-2 h-2 rounded-full ${arduinoData.isConnected ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                {!arduinoData.isConnected ? 'Waiting for robot connection...' : 'Acquiring GPS signal...'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const PlantingLog = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full h-full flex flex-col">
      <div className="flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Precision Planting Log</h2>
        <p className="text-sm text-gray-600 mb-4">
          Live feed of actual seed planting events with GPS coordinates (Philippines time).
        </p>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm">
            <span className="text-gray-600">Total planted today:</span>
            <span className="ml-2 font-semibold text-green-600">{plantingLogs.length}</span>
          </div>
          <div className="text-xs text-gray-500">
            {isPlanting && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Planting active
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden min-h-[200px]">
        <div className="grid grid-cols-3 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Time (PHT)
          </div>
          <div>Depth</div>
          <div>Status</div>
        </div>
        
        {plantingLogs.length === 0 ? (
          <div className="py-12 text-center h-full flex items-center justify-center">
            <div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">No Planting Data</h3>
              <p className="text-xs text-gray-500">
                {!arduinoData.isConnected ? 
                  'Connect the Arduino robot to see planting logs.' :
                  !gpsData.isFixed ?
                  'Waiting for GPS signal to record planting locations.' :
                  'Planting logs will appear here when seeds are planted.'
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 mt-4 overflow-y-auto max-h-64">
            {plantingLogs.map((log) => (
              <div key={log.id} className="grid grid-cols-3 gap-4 py-2 text-sm">
                <div className="text-gray-900 text-xs">{log.timestamp}</div>
                <div className="text-gray-900">{log.depth}</div>
                <div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    log.status === 'OK' ? 'bg-green-100 text-green-800' :
                    log.status === 'Shallow' ? 'bg-yellow-100 text-yellow-800' :
                    log.status === 'Deep' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {plantingLogs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4 text-xs">
          <div className="text-center">
            <div className="font-semibold text-green-600">
              {plantingLogs.filter(log => log.status === 'OK').length}
            </div>
            <div className="text-gray-600">Successful</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-yellow-600">
              {plantingLogs.filter(log => log.status === 'Shallow').length}
            </div>
            <div className="text-gray-600">Shallow</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-red-600">
              {plantingLogs.filter(log => log.status === 'Failed').length}
            </div>
            <div className="text-gray-600">Failed</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 w-screen overflow-x-hidden">
      <header className="bg-white shadow-sm border-b border-gray-200 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">AgriGuard</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-xs text-gray-500">
                {new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour12: false })} PHT
              </div>
              <StatusIndicator isOnline={arduinoData.isConnected} />
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <ArduinoStatusCard />
          <SensorDataCard />
        </div>

        <div className="w-full max-w-md">
          <WeatherCard />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
          <div className="lg:col-span-2 w-full">
            <MapSection />
          </div>
          <div className="lg:col-span-1 w-full">
            <PlantingLog />
          </div>
        </div>
      </main>
    </div>
  );
};

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

export default Dashboard;