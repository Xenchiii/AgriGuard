import { AlertTriangle, Battery, Clock, Droplets, MapPin, Shield, Thermometer, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

// Mock data for demonstration
const mockData = {
  battery: 0, // No robot connected
  temperature: 20.6,
  humidity: 66,
  isOnline: false,
  lastSeen: null,
  plantingLogs: []
};

const Dashboard = () => {
  const [data, setData] = useState(mockData);
  const [weatherAlert, setWeatherAlert] = useState("High winds expected in the afternoon.");

  // Simulate real-time updates (would be replaced with actual API calls)
  useEffect(() => {
    const interval = setInterval(() => {
      // In real implementation, this would fetch from your API
      setData(prev => ({
        ...prev,
        temperature: 20.6 + (Math.random() - 0.5) * 2,
        humidity: 66 + (Math.random() - 0.5) * 10
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const StatusIndicator = ({ isOnline }: { isOnline: boolean }) => (
    <div className="flex items-center gap-2">
      {isOnline ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
      <span className={`text-sm ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );

  const BatteryDisplay = ({ level }: { level: number }) => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">Battery Status</h3>
        <Battery className={`w-5 h-5 ${level > 20 ? 'text-green-500' : 'text-red-500'}`} />
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-2">{level}%</div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div 
          className={`h-3 rounded-full transition-all duration-500 ${
            level > 50 ? 'bg-green-500' : level > 20 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${level}%` }}
        />
      </div>
      {level === 0 && (
        <p className="text-sm text-red-500 mt-2">No robot connected</p>
      )}
    </div>
  );

  const WeatherCard = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full">
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="w-5 h-5 text-blue-500" />
        <h3 className="text-sm font-medium text-gray-600">Local Weather</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">Current conditions on the farm.</p>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <Thermometer className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">{data.temperature.toFixed(1)}°C</div>
          <div className="text-xs text-gray-500">Temperature</div>
        </div>
        <div className="text-center">
          <Droplets className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">{Math.round(data.humidity)}%</div>
          <div className="text-xs text-gray-500">Humidity</div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-yellow-800">Weather Alert</div>
            <div className="text-xs text-yellow-700">{weatherAlert}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const MapSection = () => (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden w-full h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <MapPin className="w-5 h-5 text-green-600" />
          Farm Map & Live Tracking
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Real-time location of the AgriGuard robot and soil humidity readings.
        </p>
        <StatusIndicator isOnline={data.isOnline} />
      </div>
      
      <div className="flex-1 relative bg-gray-100 min-h-[300px]">
        {/* Placeholder for Google Maps integration */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8">
            <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Robot Connected</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
              Connect your AgriGuard robot to see real-time location tracking and soil monitoring data on the map.
            </p>
            <div className="inline-flex items-center gap-2 text-xs text-gray-400">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              Waiting for robot connection...
            </div>
          </div>
        </div>
        
        {/* This would be replaced with actual Google Maps component */}
        <div className="absolute top-4 right-4 bg-white rounded-lg p-2 shadow-sm">
          <span className="text-xs text-gray-600">Scale: 1:1000</span>
        </div>
      </div>
    </div>
  );

  const PlantingLog = () => (
    <div className="bg-white rounded-lg p-6 shadow-sm w-full h-full flex flex-col">
      <div className="flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Precision Planting Log</h2>
        <p className="text-sm text-gray-600 mb-6">Live feed of seed planting events and depth verification.</p>
      </div>
      
      <div className="flex-1 overflow-hidden min-h-[200px]">
        <div className="grid grid-cols-3 gap-4 pb-3 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Time
          </div>
          <div>Depth</div>
          <div>Status</div>
        </div>
        
        {data.plantingLogs.length === 0 ? (
          <div className="py-12 text-center h-full flex items-center justify-center">
            <div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">No Planting Data</h3>
              <p className="text-xs text-gray-500">Planting logs will appear here when the robot is active.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {data.plantingLogs.map((log: any, index: number) => (
              <div key={index} className="grid grid-cols-3 gap-4 py-2 text-sm">
                <div className="text-gray-900">{log.time}</div>
                <div className="text-gray-900">{log.depth}</div>
                <div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    log.status === 'OK' ? 'bg-green-100 text-green-800' :
                    log.status === 'Shallow' ? 'bg-yellow-100 text-yellow-800' :
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
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 w-screen overflow-x-hidden">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">AgriGuard</h1>
            </div>
            <StatusIndicator isOnline={data.isOnline} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top row - Battery and Weather cards side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <BatteryDisplay level={data.battery} />
          <WeatherCard />
        </div>

        {/* Bottom row - Map (2/3 width) and Planting Log (1/3 width) side by side */}
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

export default Dashboard;