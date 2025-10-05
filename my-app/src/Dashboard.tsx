import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, Cpu, Activity, Cloud, Clock, AlertTriangle, ChevronRight, RefreshCw, Shield, Wifi, Zap, Thermometer, Battery, Sun, Droplet, Wind, CloudRain, AlertCircle, TrendingUp, Download, Settings, MapPin } from 'lucide-react';

type SensorStatus = 'Online' | 'Offline';
interface SensorData {
  temperature: string | number; humidity: string | number; soilMoisture: string | number;
  lightIntensity: string | number; soilTemp: string | number; airQuality: string | number;
  phLevel: string | number; obstacleDistance: string | number;
  dht22Status: SensorStatus; soilSensorStatus: SensorStatus; lightSensorStatus: SensorStatus;
  phSensorStatus: SensorStatus; obstacleSensorStatus: SensorStatus;
}
interface ArduinoStatus {
  board: string; connection: 'CONNECTED' | 'DISCONNECTED'; battery: number; detected: boolean;
  signalStrength: number; uptime: string; mcuTemp: number; charging: boolean; voltage: number; runtime: string;
}
interface WeatherData {
  condition: string; location: string; temperature: number | string; humidity: number | string;
  rainfall: number | string; windSpeed: number | string; windDirection: string; uvIndex: number | string;
  cloudCover: number | string; evapotranspiration: number | string; frostRisk: string; growingDegreeDays: number | string;
}
interface RobotStatus { connected: boolean; waiting: boolean }
type NotificationType = 'success' | 'error' | 'warning' | 'info';
interface Notification { id: string; type: NotificationType; title: string; message: string }

const menuItems = [
  { id: 'microcontroller', label: 'Microcontroller', icon: Cpu },
  { id: 'sensors', label: 'Sensors', icon: Activity },
  { id: 'weather', label: 'Weather', icon: Cloud },
  { id: 'planting-log', label: 'Planting Log', icon: MapPin },
  { id: 'errors', label: 'Errors & Notifications', icon: AlertTriangle }
];

export default function AgriGuardDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState('microcontroller');
  const [isMobile, setIsMobile] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    board: 'Unknown Board', connection: 'DISCONNECTED', battery: 0, detected: false,
    signalStrength: 0, uptime: '0h 0m', mcuTemp: 0, charging: false, voltage: 0, runtime: '0h'
  });
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: '--', humidity: '--', soilMoisture: '--', lightIntensity: '--', soilTemp: '--',
    airQuality: '--', phLevel: '--', obstacleDistance: '--', dht22Status: 'Offline',
    soilSensorStatus: 'Offline', lightSensorStatus: 'Offline', phSensorStatus: 'Offline', obstacleSensorStatus: 'Offline'
  });
  const [weatherData] = useState<WeatherData>({
    condition: 'Partly Cloudy', location: 'Cainta, Calabarzon', temperature: 28, humidity: 65,
    rainfall: 20, windSpeed: 15, windDirection: 'NE', uvIndex: 7, cloudCover: 45,
    evapotranspiration: 4.5, frostRisk: 'Low', growingDegreeDays: 12
  });
  const [robotStatus] = useState<RobotStatus>({ connected: false, waiting: true });
  const [totalPlantedToday] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [serialPort, setSerialPort] = useState<any | null>(null);
  const [isReading, setIsReading] = useState(false);
  const readerRef = useRef<any>(null);
  const readableClosedRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addNotification = (type: NotificationType, title: string, message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 8000);
  };

  const ARDUINO_BOARDS: Record<string, string> = {
    'arduino:avr:uno': 'Arduino Uno', 'arduino:avr:nano': 'Arduino Nano', 'arduino:avr:mega': 'Arduino Mega 2560',
    'arduino:avr:leonardo': 'Arduino Leonardo', 'arduino:avr:micro': 'Arduino Micro', 'esp32': 'ESP32',
    'esp8266': 'ESP8266', 'unknown': 'Unknown Board'
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
    const idMap: Record<number, string> = { 0x0043: 'arduino:avr:uno', 0x0036: 'arduino:avr:leonardo', 0x8036: 'arduino:avr:leonardo', 0x0037: 'arduino:avr:micro', 0x8037: 'arduino:avr:micro', 0x0042: 'arduino:avr:mega', 0x0010: 'arduino:avr:mega' };
    return idMap[usbProductId] || 'unknown';
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
        if (batteryMatch) setArduinoStatus(prev => ({ ...prev, battery: parseInt(batteryMatch[1]) }));
        const tempMatch = data.match(/TEMP:([\d.-]+)/);
        const humMatch = data.match(/HUM:(\d+)/);
        const soilMatch = data.match(/SOIL:(\d+)/);
        const updates: Partial<SensorData> = {};
        if (tempMatch) updates.temperature = tempMatch[1];
        if (humMatch) updates.humidity = humMatch[1];
        if (soilMatch) updates.soilMoisture = soilMatch[1];
        if (Object.keys(updates).length > 0) {
          setSensorData(prev => ({ ...prev, ...updates, dht22Status: 'Online', soilSensorStatus: 'Online' }));
        }
      }
    } catch (error) {
      console.error('Serial read error:', error);
    } finally {
      try { if (readerRef.current) { await readerRef.current.cancel(); try { readerRef.current.releaseLock(); } catch {} readerRef.current = null; } } catch (e) {}
      try { if (readableClosedRef.current) await readableClosedRef.current; } catch {}
      readableClosedRef.current = null;
      setIsReading(false);
    }
  };

  const connectArduino = async () => {
    if (!('serial' in navigator)) { addNotification('error', 'Not Supported', 'Web Serial API not supported'); return; }
    if (serialPort) { addNotification('info', 'Already Connected', 'Port already connected'); return; }
    try {
      let port: any;
      try {
        port = await (navigator as any).serial.requestPort({ filters: [{ usbVendorId: 0x2341 }, { usbVendorId: 0x2A03 }, { usbVendorId: 0x1A86 }, { usbVendorId: 0x0403 }] });
      } catch (requestErr) {
        const ports = await (navigator as any).serial.getPorts();
        if (ports?.length > 0) { port = ports[0]; addNotification('info', 'Using Existing Port', 'Using previously granted port'); } else { throw requestErr; }
      }
      const baudOptions = [9600, 115200, 57600, 19200];
      let opened = false;
      for (const baud of baudOptions) { try { await port.open({ baudRate: baud }); opened = true; break; } catch { try { await port.close(); } catch {} } }
      if (!opened) throw new Error('Unable to open serial port');
      const info: any = port.getInfo?.() || {};
      const boardType = detectBoardType(info.usbProductId || 0, info.productName || '');
      const boardName = ARDUINO_BOARDS[boardType];
      const isUSBPowered = info.usbVendorId !== undefined;
      setSerialPort(port);
      setArduinoStatus({ board: boardName, connection: 'CONNECTED', battery: isUSBPowered ? 100 : 0, detected: true, signalStrength: 100, uptime: '0h 0m', mcuTemp: 0, charging: isUSBPowered, voltage: 5.0, runtime: isUSBPowered ? 'Unlimited (USB)' : '0h' });
      addNotification('success', 'Arduino Connected', `${boardName} connected successfully`);
      readSerialData(port);
    } catch (error: any) { addNotification('error', 'Connection Failed', error?.message || 'Failed to connect'); }
  };

  const disconnectArduino = async () => {
    if (serialPort) {
      try {
        if (readerRef.current) { await readerRef.current.cancel(); try { readerRef.current.releaseLock(); } catch {} readerRef.current = null; }
        try { if (readableClosedRef.current) await readableClosedRef.current; } catch {}
        await serialPort.close();
        setSerialPort(null);
        setArduinoStatus({ board: 'Unknown Board', connection: 'DISCONNECTED', battery: 0, detected: false, signalStrength: 0, uptime: '0h 0m', mcuTemp: 0, charging: false, voltage: 0, runtime: '0h' });
        setSensorData({ temperature: '--', humidity: '--', soilMoisture: '--', lightIntensity: '--', soilTemp: '--', airQuality: '--', phLevel: '--', obstacleDistance: '--', dht22Status: 'Offline', soilSensorStatus: 'Offline', lightSensorStatus: 'Offline', phSensorStatus: 'Offline', obstacleSensorStatus: 'Offline' });
        addNotification('warning', 'Disconnected', 'Arduino disconnected');
      } catch {}
    }
  };

  const debugSerial = async () => {
    if (!('serial' in navigator)) { addNotification('error', 'Not Supported', 'Web Serial API not supported'); return; }
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (!ports?.length) { addNotification('info', 'No Ports', 'No ports found'); return; }
      for (let i = 0; i < ports.length; i++) {
        const info: any = ports[i].getInfo?.() || {};
        const vendor = info.usbVendorId ? '0x' + info.usbVendorId.toString(16) : 'unknown';
        const product = info.usbProductId ? '0x' + info.usbProductId.toString(16) : 'unknown';
        addNotification('info', `Port ${i + 1}`, `vendor:${vendor} product:${product}`);
      }
    } catch (err: any) { addNotification('error', 'Debug Failed', String(err?.message || err)); }
  };

  const renderMicrocontroller = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold">Arduino Status</h2><button className="p-2 hover:bg-gray-50 rounded-lg border"><RefreshCw className="w-5 h-5 text-emerald-600" /></button></div>
        <div className="space-y-4">{[['Board', arduinoStatus.board], ['Connection', <span key="c" className={arduinoStatus.connection === 'CONNECTED' ? 'text-emerald-600' : 'text-red-600'}>{arduinoStatus.connection}</span>], ['Voltage', `${arduinoStatus.voltage}V`], ['Signal', `${arduinoStatus.signalStrength}%`], ['Uptime', arduinoStatus.uptime], ['MCU Temp', `${arduinoStatus.mcuTemp}°C`], ['Charging', <span key="ch" className={arduinoStatus.charging ? 'text-blue-600' : 'text-gray-600'}>{arduinoStatus.charging ? 'Charging' : 'Discharging'}</span>]].map(([label, value], i) => (<div key={i} className="flex justify-between py-3 border-b"><span className="text-gray-600">{label}:</span><span className="font-semibold">{value}</span></div>))}<div className="py-3 border-b"><div className="flex justify-between mb-2"><span className="text-gray-600">Battery:</span><span className="font-semibold">{arduinoStatus.battery}%</span></div><div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-emerald-600 h-2 rounded-full" style={{ width: `${arduinoStatus.battery}%` }}></div></div></div></div>
        <div className="mt-6 p-4 bg-blue-50 rounded-lg flex items-center"><Battery className="w-5 h-5 text-blue-600 mr-2" /><div><div className="font-semibold text-blue-900">Runtime</div><div className="text-sm text-blue-700">{arduinoStatus.runtime}</div></div></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><button onClick={arduinoStatus.connection === 'DISCONNECTED' ? connectArduino : disconnectArduino} className={`font-semibold py-3 rounded-lg text-white ${arduinoStatus.connection === 'DISCONNECTED' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>{arduinoStatus.connection === 'DISCONNECTED' ? 'Connect' : 'Disconnect'}</button><button onClick={debugSerial} className="bg-gray-200 hover:bg-gray-300 font-semibold py-3 rounded-lg">Debug</button></div>
      </div>
      <div className="bg-white rounded-lg shadow-md p-6"><h3 className="text-xl font-bold mb-4 flex items-center"><Activity className="w-5 h-5 mr-2 text-emerald-600" />Live Monitoring</h3><div className="grid grid-cols-2 gap-4">{[{ icon: Wifi, label: 'Signal', value: `${arduinoStatus.signalStrength}%`, color: 'blue' }, { icon: Clock, label: 'Uptime', value: arduinoStatus.uptime, color: 'green' }, { icon: Thermometer, label: 'MCU Temp', value: `${arduinoStatus.mcuTemp}°C`, color: 'orange' }, { icon: Zap, label: 'Voltage', value: `${arduinoStatus.voltage}V`, color: 'purple' }].map((item, i) => (<div key={i} className={`bg-gradient-to-br from-${item.color}-50 to-${item.color}-100 rounded-lg p-4`}><item.icon className={`w-8 h-8 text-${item.color}-600 mb-2`} /><div className="text-sm text-gray-600">{item.label}</div><div className="text-2xl font-bold">{item.value}</div></div>))}</div></div>
    </div>
  );

  const renderSensors = () => (
    <div className="bg-white rounded-lg shadow-md p-6"><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold flex items-center"><Activity className="w-6 h-6 text-emerald-600 mr-3" />Sensor Readings</h2><div className="flex gap-2"><button className="p-2 hover:bg-gray-50 rounded-lg border"><Download className="w-5 h-5 text-emerald-600" /></button><button className="p-2 hover:bg-gray-50 rounded-lg border"><Settings className="w-5 h-5 text-emerald-600" /></button></div></div><p className="text-gray-600 mb-6">Live data from Arduino sensors</p><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ icon: Thermometer, label: 'Temperature', value: sensorData.temperature, unit: '°C', color: 'red', status: sensorData.dht22Status }, { icon: Droplet, label: 'Humidity', value: sensorData.humidity, unit: '%', color: 'blue', status: sensorData.dht22Status }, { icon: Activity, label: 'Soil Moisture', value: sensorData.soilMoisture, unit: '%', color: 'amber', status: sensorData.soilSensorStatus }, { icon: Sun, label: 'Light', value: sensorData.lightIntensity, unit: '%', color: 'yellow', status: sensorData.lightSensorStatus }, { icon: Thermometer, label: 'Soil Temp', value: sensorData.soilTemp, unit: '°C', color: 'orange', status: sensorData.soilSensorStatus }, { icon: Activity, label: 'Air Quality', value: sensorData.airQuality, unit: '', color: 'green', status: 'Online' as SensorStatus }, { icon: Droplet, label: 'pH Level', value: sensorData.phLevel, unit: '', color: 'purple', status: sensorData.phSensorStatus }, { icon: AlertCircle, label: 'Obstacle', value: sensorData.obstacleDistance, unit: 'cm', color: 'cyan', status: sensorData.obstacleSensorStatus }].map((s, i) => (<div key={i} className={`bg-gradient-to-br from-${s.color}-50 to-${s.color}-100 rounded-lg p-4 text-center relative`}><div className="absolute top-2 right-2"><div className={`w-2 h-2 rounded-full ${s.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div></div><s.icon className={`w-10 h-10 text-${s.color}-600 mx-auto mb-2`} /><div className="text-3xl font-bold mb-1">{s.value}{s.unit}</div><div className="text-sm text-gray-600">{s.label}</div></div>))}</div>{arduinoStatus.connection === 'DISCONNECTED' && (<div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex"><AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" /><div><div className="font-semibold text-amber-900">Arduino Not Connected</div><div className="text-sm text-amber-700">Connect Arduino for live readings</div></div></div>)}</div>
  );

  const renderWeather = () => (<div className="bg-white rounded-lg shadow-md p-6"><h2 className="text-2xl font-bold mb-6 flex items-center"><Cloud className="w-6 h-6 text-blue-600 mr-3" />Weather - {weatherData.location}</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[{ icon: Thermometer, label: 'Temperature', value: weatherData.temperature, unit: '°C', color: 'blue' }, { icon: Droplet, label: 'Humidity', value: weatherData.humidity, unit: '%', color: 'cyan' }, { icon: CloudRain, label: 'Rain', value: weatherData.rainfall, unit: '%', color: 'indigo' }, { icon: Wind, label: `Wind (${weatherData.windDirection})`, value: weatherData.windSpeed, unit: 'km/h', color: 'teal' }, { icon: Sun, label: 'UV Index', value: weatherData.uvIndex, unit: '', color: 'yellow' }, { icon: Cloud, label: 'Cloud Cover', value: weatherData.cloudCover, unit: '%', color: 'gray' }, { icon: TrendingUp, label: 'ET', value: weatherData.evapotranspiration, unit: 'mm/d', color: 'green' }, { icon: Activity, label: 'GDD', value: weatherData.growingDegreeDays, unit: '', color: 'purple' }].map((w, i) => (<div key={i} className={`bg-gradient-to-br from-${w.color}-50 to-${w.color}-100 rounded-lg p-4 text-center`}><w.icon className={`w-10 h-10 text-${w.color}-600 mx-auto mb-2`} /><div className="text-3xl font-bold mb-1">{w.value}{w.unit}</div><div className="text-sm text-gray-600">{w.label}</div></div>))}</div></div>);

  const renderPlantingLog = () => (<div className="bg-white rounded-lg shadow-md p-6"><h2 className="text-2xl font-bold mb-4">Planting Log</h2><div className="mb-6"><span className="text-gray-700">Total planted today: </span><span className="text-emerald-600 font-bold text-xl">{totalPlantedToday}</span></div><div className="text-center py-12 bg-gray-50 rounded-lg"><MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" /><div className="text-xl font-semibold mb-2">No Robot Connected</div><p className="text-gray-600">Connect AgriGuard robot for planting data</p></div></div>);

  const renderErrors = () => (<div className="bg-white rounded-lg shadow-md p-6"><h2 className="text-2xl font-bold mb-6">Errors & Notifications</h2><div className="space-y-4">{arduinoStatus.connection === 'DISCONNECTED' && (<div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded flex"><AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" /><div><div className="font-semibold text-amber-900">Arduino Not Connected</div><div className="text-sm text-amber-700">Connect Arduino to monitor sensors</div></div></div>)}{!robotStatus.connected && (<div className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex"><AlertTriangle className="w-5 h-5 text-red-600 mr-3 mt-0.5" /><div><div className="font-semibold text-red-900">Robot Offline</div><div className="text-sm text-red-700">GPS tracking unavailable</div></div></div>)}</div></div>);

  return (
    <div className="flex h-screen bg-gray-100">
      <style>{`@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}.animate-slide-in-right{animation:slideInRight .3s ease-out}`}</style>
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">{notifications.map(n => (<div key={n.id} className={`animate-slide-in-right bg-white rounded-lg shadow-lg p-4 border-l-4 ${n.type === 'success' ? 'border-green-500' : n.type === 'error' ? 'border-red-500' : n.type === 'warning' ? 'border-amber-500' : 'border-blue-500'}`}><div className="flex items-start"><AlertTriangle className={`w-5 h-5 mr-3 ${n.type === 'success' ? 'text-green-500' : n.type === 'error' ? 'text-red-500' : n.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} /><div className="flex-1"><div className="font-semibold text-sm">{n.title}</div><div className="text-xs mt-1 text-gray-600">{n.message}</div></div><button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="ml-2 p-1 hover:bg-gray-50 rounded"><X className="w-4 h-4" /></button></div></div>))}</div>
      <aside className={`bg-white transition-all duration-300 flex-shrink-0 border-r ${sidebarOpen ? 'w-64' : 'w-0 md:w-16'} ${isMobile && sidebarOpen ? 'fixed inset-y-0 left-0 z-50 shadow-xl' : ''}`}><div className="h-full flex flex-col"><div className={`p-4 flex items-center justify-between border-b ${!sidebarOpen && 'md:justify-center'}`}>{sidebarOpen && (<div className="flex items-center"><div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center mr-3"><Shield className="w-6 h-6 text-white" /></div><div className="font-bold text-lg">AgriGuard</div></div>)}<button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-50 rounded-lg">{sidebarOpen ? <X className="w-5 h-5 text-emerald-600" /> : <Menu className="w-5 h-5 text-emerald-600" />}</button></div><nav className="flex-1 overflow-y-auto py-2 px-2">{menuItems.map(item => { const Icon = item.icon; const isActive = currentPage === item.id; return (<button key={item.id} onClick={() => { setCurrentPage(item.id); if (isMobile) setSidebarOpen(false); }} className={`w-full flex items-center px-4 py-3 mb-2 rounded-xl transition-colors ${isActive ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-white text-gray-600 hover:bg-emerald-600 hover:text-white shadow-sm'} ${!sidebarOpen && 'md:justify-center md:px-2'}`}><Icon className={`w-5 h-5 ${sidebarOpen ? 'mr-3' : ''}`} />{sidebarOpen && <span>{item.label}</span>}{sidebarOpen && isActive && <ChevronRight className="w-5 h-5 ml-auto" />}</button>); })}</nav></div></aside>
      {isMobile && sidebarOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setSidebarOpen(false)}></div>)}
      <main className="flex-1 overflow-y-auto bg-gray-100"><div className="bg-white border-b sticky top-0 z-10"><div className="px-6 py-4 flex items-center justify-between"><div className="flex items-center gap-6"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center"><Shield className="w-6 h-6 text-white" /></div><span className="text-lg font-semibold">AgriGuard</span></div><div className="h-6 w-px bg-gray-300"></div><h1 className="text-2xl font-bold capitalize">{currentPage === 'planting-log' ? 'Planting Log' : currentPage === 'errors' ? 'Errors & Notifications' : currentPage}</h1></div>{isMobile && !sidebarOpen && (<button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg"><Menu className="w-6 h-6" /></button>)}</div></div><div className="p-6">{currentPage === 'microcontroller' && renderMicrocontroller()}{currentPage === 'sensors' && renderSensors()}{currentPage === 'weather' && renderWeather()}{currentPage === 'planting-log' && renderPlantingLog()}{currentPage === 'errors' && renderErrors()}</div></main>
    </div>
  );
}
