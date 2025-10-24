import React, { useState, useRef, useEffect } from 'react';
import { Menu, X, Cpu, Activity, Cloud, AlertTriangle, ChevronRight, RefreshCw, Shield, Wifi, Zap, Thermometer, Battery, Sun, Droplet, Wind, CloudRain, AlertCircle, TrendingUp, Download, Settings, MapPin, Clock } from 'lucide-react';

type SensorStatus = 'Online' | 'Offline';

import axios from "axios";

const API_KEY = "9866020b69400c7ad805b65040a0ed5e"
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

interface SensorData {
  temperature: string | number;
  humidity: string | number;
  soilMoisture: string | number;
  obstacleDistance: string | number;
  dht22Status: SensorStatus;
  soilSensorStatus: SensorStatus;
  obstacleSensorStatus: SensorStatus;
}


interface ArduinoStatus {
  board: string;
  connection: 'CONNECTED' | 'DISCONNECTED' | string;
  battery: number;
  detected: boolean;
  signalStrength: number;
  uptime: string;
  mcuTemp: number;
  charging: boolean;
  voltage: number;
  runtime: string;
}

interface WeatherData {
  condition: string;
  location: string;
  temperature: number | string;
  humidity: number | string;
  rainfall: number | string;
  windSpeed: number | string;
  windDirection: string;
  uvIndex: number | string;
  cloudCover: number | string;
  evapotranspiration: number | string;
  frostRisk: string;
  growingDegreeDays: number | string;
  alertAvailable: boolean;
  alerts: any[];
}

interface RobotStatus {
  connected: boolean;
  waiting: boolean;
}

interface PlantingLogEntry {
  time: string;
  depth: string | number;
  status: string;
}

type NotificationType = 'success' | 'error' | 'warning' | 'info';
interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: any;
}

const menuItems: MenuItem[] = [
  { id: 'microcontroller', label: 'Microcontroller', icon: Cpu },
  { id: 'sensors', label: 'Sensors', icon: Activity },
  { id: 'weather', label: 'Weather', icon: Cloud },
  { id: 'planting-log', label: 'Planting Log', icon: MapPin },
  { id: 'errors', label: 'Errors', icon: AlertTriangle }
];

export default function AgriGuardDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('microcontroller');
  const [isMobile, setIsMobile] = useState(false);

  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    board: 'Unknown Board',
    connection: 'DISCONNECTED',
    battery: 0,
    detected: false,
    signalStrength: 0,
    uptime: '0h 0m',
    mcuTemp: 0,
    charging: false,
    voltage: 0,
    runtime: '0h'
  });

  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: '--',
    humidity: '--',
    soilMoisture: '--',
    obstacleDistance: '--',
    dht22Status: 'Offline',
    soilSensorStatus: 'Offline',
    obstacleSensorStatus: 'Offline'
  });
//Fetch sensor weather data (temperature and humidity from OpenWeather)
  const fetchSensorWeatherData = async () => {
    try {
      const response = await axios.get(`${BASE_URL}?q=Cainta,PH&appid=${API_KEY}&units=metric`);
      const data = response.data;
      
      setSensorData((prev: SensorData) => ({
        ...prev,
        temperature: Math.round(data.main.temp),
        humidity: Math.round(data.main.humidity),
        dht22Status: 'Online'
      }));
    } catch (error) {
      console.error('Error fetching sensor weather data:', error);
    }
  };
  const [weatherData, setWeatherData] = useState<WeatherData>({
    condition: '',
    location: '',
    temperature: 0,
    humidity: 0,
    rainfall: 0,
    windSpeed: 0,
    windDirection: '--',
    uvIndex: 0,
    cloudCover: 0,
    evapotranspiration: 0,
    frostRisk: 'Low',
    growingDegreeDays: 0,
    alertAvailable: false,
    alerts: []
  });

  const [robotStatus, setRobotStatus] = useState<RobotStatus>({ connected: false, waiting: true });
  const [plantingLog, setPlantingLog] = useState<PlantingLogEntry[]>([]);
  const [totalPlantedToday, setTotalPlantedToday] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [serialPort, setSerialPort] = useState<any | null>(null);
  const [isReading, setIsReading] = useState(false);
  const readerRef = useRef<any>(null);
  const readableClosedRef = useRef<Promise<void> | null>(null);

  // Fetch weather data
  const fetchWeatherData = async () => {
    try {
      // Default location (Manila, Philippines) - you can make this dynamic
      const response = await axios.get(`${BASE_URL}?q=Cainta,PH&appid=${API_KEY}&units=metric`);

      const data = response.data;
      
      // Calculate rain chance (using cloud cover as proxy if rain data not available)
      const rainChance = data.rain ? Math.min(100, data.rain['1h'] * 10) : Math.min(100, data.clouds.all);
      
      // Calculate wind direction from degrees
      const windDeg = data.wind.deg;
      const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
      const windDirection = directions[Math.round(windDeg / 22.5) % 16];
      
      // Calculate agricultural metrics (simplified)
      const temp = data.main.temp;
      const humidity = data.main.humidity;
      const evapotranspiration = (temp * 0.1 + humidity * 0.05).toFixed(1);
      const growingDegreeDays = Math.max(0, temp - 10).toFixed(1);
      
      setWeatherData({
        condition: data.weather[0].description,
        location: `${data.name}, ${data.sys.country}`,
        temperature: Math.round(temp),
        humidity: Math.round(humidity),
        rainfall: Math.round(rainChance),
        windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
        windDirection: windDirection,
        uvIndex: 'Moderate', // OpenWeather doesn't provide UV in free tier
        cloudCover: data.clouds.all,
        evapotranspiration: evapotranspiration,
        frostRisk: temp > 5 ? 'Low' : 'High',
        growingDegreeDays: growingDegreeDays,
        alertAvailable: false,
        alerts: []
      });
      
      addNotification('success', 'Weather Updated', 'Latest weather data fetched successfully');
    } catch (error) {
      console.error('Error fetching weather data:', error);
      addNotification('error', 'Weather Error', 'Failed to fetch weather data');
    }
  };

  // Fetch weather data on component mount and when weather page is active
  useEffect(() => {
    if (currentPage === 'weather') {
      fetchWeatherData();
    }
  }, [currentPage]);

  const getPageName = (pageId: string): string => {
    const item = menuItems.find(m => m.id === pageId);
    return item?.label || 'Dashboard';
  };
  

















































  
  const addNotification = (type: NotificationType, title: string, message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 8000);
  };

  const ARDUINO_BOARDS: Record<string, string> = {
    'arduino:avr:uno': 'Arduino Uno',
    'arduino:avr:nano': 'Arduino Nano',
    'arduino:avr:mega': 'Arduino Mega 2560',
    'arduino:avr:leonardo': 'Arduino Leonardo',
    'arduino:avr:micro': 'Arduino Micro',
    'esp32': 'ESP32',
    'esp8266': 'ESP8266',
    'unknown': 'Unknown Board'
  };

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

  const readSerialData = async (port: any) => {
    if (!port || isReading) return;
    setIsReading(true);
    try {
      const textDecoder = new TextDecoderStream();
      readableClosedRef.current = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const data = value as string;
        
        const batteryMatch = data.match(/BAT:(\d+)/);
        if (batteryMatch) {
          setArduinoStatus(prev => ({ ...prev, battery: parseInt(batteryMatch[1]) }));
        }

        const tempMatch = data.match(/TEMP:([\d.-]+)/);
        const humMatch = data.match(/HUM:(\d+)/);
        const soilMatch = data.match(/SOIL:(\d+)/);

        const sensorUpdates: Partial<SensorData> = {};
        if (tempMatch) sensorUpdates.temperature = tempMatch[1];
        if (humMatch) sensorUpdates.humidity = humMatch[1];
        if (soilMatch) sensorUpdates.soilMoisture = soilMatch[1];

        if (Object.keys(sensorUpdates).length > 0) {
          setSensorData(prev => ({
            ...prev,
            ...sensorUpdates,
            dht22Status: 'Online',
            soilSensorStatus: 'Online'
          }));
        }
      }
    } catch (error) {
      console.error('Serial read error:', error);
    } finally {
      try {
        if (readerRef.current) {
          await readerRef.current.cancel();
          try { readerRef.current.releaseLock(); } catch {}
          readerRef.current = null;
        }
      } catch (e) {}
      setIsReading(false);
    }
  };

  const connectArduino = async () => {
    if (!('serial' in navigator)) {
      addNotification('error', 'Not Supported', 'Web Serial API not supported');
      return;
    }
    if (serialPort) {
      addNotification('info', 'Already Connected', 'Serial port already connected');
      return;
    }

    try {
      let port: any;
      try {
        port = await (navigator as any).serial.requestPort({
          filters: [
            { usbVendorId: 0x2341 },
            { usbVendorId: 0x2A03 },
            { usbVendorId: 0x1A86 },
            { usbVendorId: 0x0403 }
          ]
        });
      } catch (requestErr) {
        const ports = await (navigator as any).serial.getPorts();
        if (ports && ports.length > 0) {
          port = ports[0];
          addNotification('info', 'Using Existing Port', 'Previously granted serial port');
        } else {
          throw requestErr;
        }
      }

      const baudOptions = [9600, 115200, 57600, 19200];
      let opened = false;
      for (const baud of baudOptions) {
        try {
          await port.open({ baudRate: baud });
          opened = true;
          break;
        } catch (openErr) {
          try { if (typeof port.close === 'function') await port.close(); } catch (e) {}
        }
      }

      if (!opened) throw new Error('Unable to open serial port');

      const info: any = (typeof port.getInfo === 'function') ? port.getInfo() : {};
      const boardType = detectBoardType(info.usbProductId || 0, info.productName || '');
      const boardName = ARDUINO_BOARDS[boardType];
      const isUSBPowered = info.usbVendorId !== undefined;

      setSerialPort(port);
      setArduinoStatus({
        board: boardName,
        connection: 'CONNECTED',
        battery: isUSBPowered ? 100 : 0,
        detected: true,
        signalStrength: 100,
        uptime: '0h 0m',
        mcuTemp: 0,
        charging: isUSBPowered,
        voltage: 5.0,
        runtime: isUSBPowered ? 'Unlimited (USB)' : '0h'
      });

      addNotification('success', 'Arduino Connected', `${boardName} connected via USB`);
      readSerialData(port).catch(err => {
        addNotification('error', 'Read Error', String((err as any)?.message || err));
      });

    } catch (error: any) {
      addNotification('error', 'Connection Failed', error?.message || 'Unknown error');
    }
  };

  const disconnectArduino = async () => {
    if (serialPort) {
      try {
        if (readerRef.current) {
          await readerRef.current.cancel();
          try { readerRef.current.releaseLock(); } catch {}
          readerRef.current = null;
        }
        await serialPort.close();
        setSerialPort(null);
        setArduinoStatus({
          board: 'Unknown Board',
          connection: 'DISCONNECTED',
          battery: 0,
          detected: false,
          signalStrength: 0,
          uptime: '0h 0m',
          mcuTemp: 0,
          charging: false,
          voltage: 0,
          runtime: '0h'
        });
        setSensorData({
          temperature: '--',
          humidity: '--',
          soilMoisture: '--',
          obstacleDistance: '--',
          dht22Status: 'Offline',
          soilSensorStatus: 'Offline',
          obstacleSensorStatus: 'Offline'
        });
        addNotification('warning', 'Arduino Disconnected', 'Disconnected successfully');
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  };

  const debugSerial = async () => {
    if (!('serial' in navigator)) {
      addNotification('error', 'Not Supported', 'Web Serial API not supported');
      return;
    }
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (!ports || ports.length === 0) {
        addNotification('info', 'No Ports', 'No previously granted ports');
        return;
      }
      for (let i = 0; i < ports.length; i++) {
        const p = ports[i];
        const info: any = (typeof p.getInfo === 'function') ? p.getInfo() : {};
        const vendor = info.usbVendorId ? `0x${info.usbVendorId.toString(16)}` : 'unknown';
        const product = info.usbProductId ? `0x${info.usbProductId.toString(16)}` : 'unknown';
        addNotification('info', `Port ${i + 1}`, `vendor:${vendor} product:${product}`);
      }
    } catch (err: any) {
      addNotification('error', 'Debug Failed', String(err?.message || err));
    }
  };

  const downloadPlantingLogCSV = () => {
    if (plantingLog.length === 0) {
      addNotification('warning', 'No Data', 'No planting log data to export');
      return;
    }

    const headers = ['Time', 'Depth', 'Status'];
    const csvContent = [
      headers.join(','),
      ...plantingLog.map(log => `${log.time},"${log.depth}",${log.status}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `planting_log_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addNotification('success', 'Export Complete', 'Planting log exported to CSV');
  };

  const renderMicrocontroller = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Arduino Status</h2>
          <button className="p-2 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200">
            <RefreshCw className="w-5 h-5 text-emerald-600" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Board:</span>
            <span className="font-semibold text-gray-800">{arduinoStatus.board}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Connection:</span>
            <span className={`font-semibold ${arduinoStatus.connection === 'CONNECTED' ? 'text-emerald-600' : 'text-red-600'}`}>
              {arduinoStatus.connection}
            </span>
          </div>
          <div className="py-3 border-b">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Battery:</span>
              <span className="font-semibold text-gray-800">{arduinoStatus.battery}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-emerald-600 h-2 rounded-full transition-all duration-500" style={{ width: `${arduinoStatus.battery}%` }}></div>
            </div>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Voltage:</span>
            <span className="font-semibold text-gray-800">{arduinoStatus.voltage}V</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Signal Strength:</span>
            <span className="font-semibold text-gray-800">{arduinoStatus.signalStrength}%</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Uptime:</span>
            <span className="font-semibold text-gray-800">{arduinoStatus.uptime}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">MCU Temperature:</span>
            <span className="font-semibold text-gray-800">{arduinoStatus.mcuTemp}°C</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b">
            <span className="text-gray-600">Charging Status:</span>
            <span className={`font-semibold ${arduinoStatus.charging ? 'text-blue-600' : 'text-gray-600'}`}>
              {arduinoStatus.charging ? 'Charging' : 'Discharging'}
            </span>
          </div>
        </div>
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center">
            <Battery className="w-5 h-5 text-blue-600 mr-2" />
            <div>
              <div className="font-semibold text-blue-900">Estimated Runtime</div>
              <div className="text-sm text-blue-700">{arduinoStatus.runtime} remaining</div>
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {arduinoStatus.connection === 'DISCONNECTED' ? (
            <button onClick={connectArduino} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
              Connect Arduino
            </button>
          ) : (
            <button onClick={disconnectArduino} className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg">
              Disconnect Arduino
            </button>
          )}
          <button onClick={debugSerial} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 rounded-lg">
            Debug Serial
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-emerald-600" />
            Live Monitoring
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <Wifi className="w-8 h-8 text-blue-600 mb-2" />
              <div className="text-sm text-gray-600">Signal Strength</div>
              <div className="text-2xl font-bold text-gray-800">{arduinoStatus.signalStrength}%</div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
              <Clock className="w-8 h-8 text-green-600 mb-2" />
              <div className="text-sm text-gray-600">Uptime</div>
              <div className="text-2xl font-bold text-gray-800">{arduinoStatus.uptime}</div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
              <Thermometer className="w-8 h-8 text-orange-600 mb-2" />
              <div className="text-sm text-gray-600">MCU Temp</div>
              <div className="text-2xl font-bold text-gray-800">{arduinoStatus.mcuTemp}°C</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <Zap className="w-8 h-8 text-purple-600 mb-2" />
              <div className="text-sm text-gray-600">Voltage</div>
              <div className="text-2xl font-bold text-gray-800">{arduinoStatus.voltage}V</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-yellow-600" />
            Power & Battery
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Battery Level</div>
                <div className="text-xl font-bold text-gray-800">{arduinoStatus.battery}%</div>
              </div>
              <Battery className="w-10 h-10 text-green-600" />
            </div>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Voltage Reading</div>
                <div className="text-xl font-bold text-gray-800">{arduinoStatus.voltage}V</div>
              </div>
              <Zap className="w-10 h-10 text-blue-600" />
            </div>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Estimated Runtime</div>
                <div className="text-xl font-bold text-gray-800">{arduinoStatus.runtime}</div>
              </div>
              <Clock className="w-10 h-10 text-purple-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSensors = () => (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Activity className="w-6 h-6 text-emerald-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Sensor Readings</h2>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200">
              <Download className="w-5 h-5 text-emerald-600" />
            </button>
            <button className="p-2 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200">
              <Settings className="w-5 h-5 text-emerald-600" />
            </button>
          </div>
        </div>
        
        <p className="text-gray-600 mb-6">Live data from Arduino sensors</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 text-center relative">
            <div className="absolute top-2 right-2">
              <div className={`w-2 h-2 rounded-full ${sensorData.dht22Status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <Thermometer className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{sensorData.temperature}°C</div>
            <div className="text-sm text-gray-600">Temperature</div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center relative">
            <div className="absolute top-2 right-2">
              <div className={`w-2 h-2 rounded-full ${sensorData.dht22Status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <Droplet className="w-10 h-10 text-blue-500 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{sensorData.humidity}%</div>
            <div className="text-sm text-gray-600">Air Humidity</div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 text-center relative">
            <div className="absolute top-2 right-2">
              <div className={`w-2 h-2 rounded-full ${sensorData.soilSensorStatus === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <Activity className="w-10 h-10 text-amber-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{sensorData.soilMoisture}%</div>
            <div className="text-sm text-gray-600">Soil Moisture</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 text-center relative">
            <div className="absolute top-2 right-2">
              <div className={`w-2 h-2 rounded-full ${sensorData.obstacleSensorStatus === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <AlertCircle className="w-10 h-10 text-cyan-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{sensorData.obstacleDistance}cm</div>
            <div className="text-sm text-gray-600">Obstacle Distance</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Sensor Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>DHT22/AM2302:</span>
                <span className={sensorData.dht22Status === 'Online' ? 'text-green-600' : 'text-red-600'}>{sensorData.dht22Status}</span>
              </div>
              <div className="flex justify-between">
                <span>Soil Moisture:</span>
                <span className={sensorData.soilSensorStatus === 'Online' ? 'text-green-600' : 'text-red-600'}>{sensorData.soilSensorStatus}</span>
              </div>
              
              <div className="flex justify-between">
                <span>Obstacle Sensor:</span>
                <span className={sensorData.obstacleSensorStatus === 'Online' ? 'text-green-600' : 'text-red-600'}>{sensorData.obstacleSensorStatus}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Threshold Alerts</h3>
            <div className="space-y-2 text-sm">
              {sensorData.soilMoisture !== '--' && parseInt(String(sensorData.soilMoisture)) < 30 && (
                <div className="flex items-center text-amber-700">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Soil moisture low - irrigation recommended
                </div>
              )}
              {sensorData.temperature !== '--' && parseInt(String(sensorData.temperature)) > 32 && (
                <div className="flex items-center text-red-700">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  High temperature detected
                </div>
              )}
              {arduinoStatus.connection === 'DISCONNECTED' && (
                <div className="flex items-center text-gray-600">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Connect Arduino for live monitoring
                </div>
              )}
            </div>
          </div>
        </div>

        {arduinoStatus.connection === 'DISCONNECTED' && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start">
            <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-amber-900">Arduino Not Connected</div>
              <div className="text-sm text-amber-700 mt-1">Connect your Arduino to see live sensor readings</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderWeather = () => (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <Cloud className="w-6 h-6 text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Weather Conditions</h2>
        </div>
        
        <p className="text-gray-600 mb-6">External weather data for {weatherData.location}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 text-center">
            <Thermometer className="w-10 h-10 text-blue-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.temperature}°C</div>
            <div className="text-sm text-gray-600">Temperature</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 text-center">
            <Droplet className="w-10 h-10 text-cyan-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.humidity}%</div>
            <div className="text-sm text-gray-600">Humidity</div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 text-center">
            <CloudRain className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.rainfall}%</div>
            <div className="text-sm text-gray-600">Rain Chance</div>
          </div>

          <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 text-center">
            <Wind className="w-10 h-10 text-teal-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.windSpeed} km/h</div>
            <div className="text-sm text-gray-600">Wind ({weatherData.windDirection})</div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 text-center">
            <Sun className="w-10 h-10 text-yellow-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.uvIndex}</div>
            <div className="text-sm text-gray-600">UV Index</div>
          </div>

          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 text-center">
            <Cloud className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.cloudCover}%</div>
            <div className="text-sm text-gray-600">Cloud Cover</div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 text-center">
            <TrendingUp className="w-10 h-10 text-green-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.evapotranspiration}</div>
            <div className="text-sm text-gray-600">ET (mm/day)</div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 text-center">
            <Activity className="w-10 h-10 text-purple-600 mx-auto mb-2" />
            <div className="text-3xl font-bold text-gray-800 mb-1">{weatherData.growingDegreeDays}</div>
            <div className="text-sm text-gray-600">Growing Degree Days</div>
          </div>
        </div>

        <div className="text-center py-6 mb-6 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg">
          <div className="text-4xl font-bold text-gray-800 mb-2 capitalize">{weatherData.condition}</div>
          <div className="text-gray-600">Current weather conditions</div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Today's Forecast</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="font-semibold text-blue-900 mb-1">Morning</div>
              <div className="text-sm text-blue-700">24°C, Clear skies</div>
            </div>
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
              <div className="font-semibold text-orange-900 mb-1">Afternoon</div>
              <div className="text-sm text-orange-700">32°C, Partly cloudy</div>
            </div>
            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded">
              <div className="font-semibold text-indigo-900 mb-1">Evening</div>
              <div className="text-sm text-indigo-700">26°C, Clear</div>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Agriculture-Specific Indicators</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
              <div className="font-semibold text-green-900 mb-1">Evapotranspiration (ET)</div>
              <div className="text-sm text-green-700">{weatherData.evapotranspiration} mm/day - Moderate water loss</div>
            </div>
            <div className="bg-cyan-50 border-l-4 border-cyan-500 p-4 rounded">
              <div className="font-semibold text-cyan-900 mb-1">Soil Drying Prediction</div>
              <div className="text-sm text-cyan-700">Moderate - irrigation recommended within 2 days</div>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <div className="font-semibold text-blue-900 mb-1">Frost Risk</div>
              <div className="text-sm text-blue-700">{weatherData.frostRisk} - no protective measures needed tonight</div>
            </div>
            <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
              <div className="font-semibold text-purple-900 mb-1">Growing Degree Days (GDD)</div>
              <div className="text-sm text-purple-700">{weatherData.growingDegreeDays} accumulated today</div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-4">Weather Alerts & Notifications</h3>
          <div className="space-y-3">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded flex items-start">
              <CloudRain className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-blue-900">Rain Alert</div>
                <div className="text-sm text-blue-700">Rain expected in 2 hours - {weatherData.rainfall}% probability</div>
              </div>
            </div>
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded flex items-start">
              <Wind className="w-5 h-5 text-orange-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-orange-900">Strong Wind Warning</div>
                <div className="text-sm text-orange-700">Wind speeds may reach 30 km/h - secure lightweight equipment</div>
              </div>
            </div>
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex items-start">
              <Sun className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-red-900">Extreme Heat Warning</div>
                <div className="text-sm text-red-700">Temp may exceed 35°C - irrigation recommended for sensitive crops</div>
              </div>
            </div>
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded flex items-start">
              <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold text-amber-900">Weather Alert</div>
                <div className="text-sm text-amber-700">Unable to fetch current weather alerts for your location</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPlantingLog = () => (
    <div className="w-full space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-gray-800">Precision Planting Log</h2>
          <button 
            onClick={downloadPlantingLogCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            disabled={plantingLog.length === 0}
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
        <p className="text-gray-600 mb-6">Live feed of actual seed planting events with GPS coordinates (Philippines time).</p>
        
        <div className="mb-6">
          <span className="text-gray-700">Total planted today: </span>
          <span className="text-emerald-600 font-bold text-xl">{totalPlantedToday}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-2 text-gray-700 font-semibold">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Time (PHT)
                </th>
                <th className="text-left py-3 px-2 text-gray-700 font-semibold">Depth</th>
                <th className="text-left py-3 px-2 text-gray-700 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {plantingLog.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-8 text-gray-500">No planting events recorded today</td>
                </tr>
              ) : (
                plantingLog.map((log, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 px-2">{log.time}</td>
                    <td className="py-3 px-2">{log.depth}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded text-sm ${log.status === 'Success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <MapPin className="w-6 h-6 text-emerald-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Live Farm Tracking</h2>
        </div>
        
        <p className="text-gray-600 mb-6">Real-time GPS tracking with precision planting markers.</p>

        <div className="flex items-center text-red-600 mb-6">
          <X className="w-5 h-5 mr-2" />
          <span className="font-semibold">Offline</span>
        </div>

        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="w-24 h-24 bg-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-12 h-12 text-gray-500" />
          </div>
          <div className="text-xl font-semibold text-gray-800 mb-2">No Robot Connected</div>
          <p className="text-gray-600 mb-4">Connect your AgriGuard robot to see real-time GPS tracking and precision planting data.</p>
          <div className="flex items-center justify-center text-red-600">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
            <span className="text-sm">Waiting for robot connection...</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderErrors = () => (
    <div className="w-full">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center mb-6">
          <AlertTriangle className="w-6 h-6 text-red-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Errors & Notifications</h2>
        </div>
        
        <div className="space-y-4">
          {arduinoStatus.connection === 'DISCONNECTED' && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900">Arduino Not Connected</div>
                  <div className="text-sm text-amber-700 mt-1">Please connect your Arduino to monitor sensor data</div>
                  <div className="text-xs text-amber-600 mt-2">Just now</div>
                </div>
              </div>
            </div>
          )}

          {!robotStatus.connected && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-red-900">Robot Offline</div>
                  <div className="text-sm text-red-700 mt-1">GPS tracking and planting functions unavailable</div>
                  <div className="text-xs text-red-600 mt-2">Just now</div>
                </div>
              </div>
            </div>
          )}

          {!weatherData.alertAvailable && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900">Weather Alert Unavailable</div>
                  <div className="text-sm text-amber-700 mt-1">Unable to fetch current weather alerts for your location</div>
                  <div className="text-xs text-amber-600 mt-2">5 minutes ago</div>
                </div>
              </div>
            </div>
          )}

          {sensorData.soilMoisture !== '--' && parseInt(String(sensorData.soilMoisture)) < 30 && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
              <div className="flex items-start">
                <Droplet className="w-5 h-5 text-orange-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold text-orange-900">Low Soil Moisture</div>
                  <div className="text-sm text-orange-700 mt-1">Soil moisture at {sensorData.soilMoisture}% - irrigation recommended</div>
                  <div className="text-xs text-orange-600 mt-2">10 minutes ago</div>
                </div>
              </div>
            </div>
          )}

          {arduinoStatus.connection === 'CONNECTED' && robotStatus.connected && weatherData.alertAvailable && (
            <div className="text-center py-16 text-gray-500">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Activity className="w-10 h-10 text-green-600" />
              </div>
              <div className="text-lg font-semibold mb-2 text-green-700">All Systems Operational</div>
              <div className="text-sm text-gray-600">No errors or notifications at this time</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden" style={{ margin: 0, padding: 0, width: '100vw', maxWidth: '100vw' }}>
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out;
        }
        .page-transition {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>

      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`animate-slide-in-right bg-white rounded-lg shadow-lg p-4 border-l-4 ${
              notif.type === 'success' ? 'border-green-500' :
              notif.type === 'error' ? 'border-red-500' :
              notif.type === 'warning' ? 'border-amber-500' :
              'border-blue-500'
            }`}
          >
            <div className="flex items-start">
              <div className={`flex-shrink-0 mr-3 ${
                notif.type === 'success' ? 'text-green-500' :
                notif.type === 'error' ? 'text-red-500' :
                notif.type === 'warning' ? 'text-amber-500' :
                'text-blue-500'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900 text-sm">{notif.title}</div>
                <div className="text-gray-600 text-xs mt-1">{notif.message}</div>
              </div>
              <button
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                className="ml-2 p-1 bg-white hover:bg-gray-50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-emerald-600" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <aside className={`bg-white text-gray-800 transition-all duration-300 flex-shrink-0 border-r border-gray-200 ${
        sidebarOpen ? 'w-64' : 'w-0 md:w-16'
      } ${isMobile && sidebarOpen ? 'fixed inset-y-0 left-0 z-50 shadow-xl' : ''}`}>
        <div className="h-full flex flex-col">
          <div className={`p-4 flex items-center justify-between border-b border-gray-200 ${!sidebarOpen && 'md:justify-center'}`}>
            {sidebarOpen && (
              <div className="flex items-center">
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center mr-3">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-gray-800">AgriGuard</div>
                  <div className="text-xs text-gray-500">Farm Monitor</div>
                </div>
              </div>
            )}
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 bg-white hover:bg-gray-50 rounded-lg transition-colors border border-gray-200"
            >
              {sidebarOpen ? <X className="w-6 h-6 text-emerald-600" /> : <Menu className="w-6 h-6 text-emerald-600" />}
            </button>
          </div>

          {sidebarOpen && (
            <div className="px-4 py-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">MENU</div>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto py-2 px-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 mb-2 rounded-xl transition-colors ${
                    isActive 
                      ? 'bg-emerald-100 text-emerald-800 font-semibold' 
                      : 'bg-white text-gray-600 hover:bg-emerald-600 hover:text-white shadow-sm'
                  } ${!sidebarOpen && 'md:justify-center md:px-2'}`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${sidebarOpen ? 'mr-3' : ''}`} />
                  {sidebarOpen && <span className="font-medium">{item.label}</span>}
                  {sidebarOpen && isActive && <ChevronRight className="w-5 h-5 ml-auto" />}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <main className="flex-1 overflow-y-auto bg-gray-100 flex flex-col">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              {isMobile && (
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors mr-3"
                >
                  <Menu className="w-6 h-6 text-gray-800" />
                </button>
              )}
              <div>
                <p className="text-3xl font-bold text-gray-800 h-10 overflow-hidden">
                  <span key={currentPage} className="block page-transition">
                    {getPageName(currentPage)}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Today at</p>
              <p className="text-lg font-semibold text-gray-800">
                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-6 py-6">
            <div key={currentPage} className="page-transition">
              {currentPage === 'microcontroller' && renderMicrocontroller()}
              {currentPage === 'sensors' && renderSensors()}
              {currentPage === 'weather' && renderWeather()}
              {currentPage === 'planting-log' && renderPlantingLog()}
              {currentPage === 'errors' && renderErrors()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
