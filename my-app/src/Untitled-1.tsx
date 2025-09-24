// GoogleMapsComponent.tsx
import React, { useEffect, useRef, useState } from 'react';

interface RobotLocation {
  id: string;
  latitude: number;
  longitude: number;
  battery: number;
  isOnline: boolean;
  lastSeen: Date;
}

interface PlantingPoint {
  latitude: number;
  longitude: number;
  depth: number;
  status: 'OK' | 'Shallow' | 'Deep';
  timestamp: Date;
}

interface GoogleMapsProps {
  apiKey: string;
  robots: RobotLocation[];
  plantingPoints: PlantingPoint[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onRobotClick?: (robot: RobotLocation) => void;
}

/// <reference types="vite/client" />

declare global {
  interface Window {
    google: {
      maps: {
        Map: typeof google.maps.Map;
        // Add other Google Maps types you need
        LatLng: typeof google.maps.LatLng;
        LatLngBounds: typeof google.maps.LatLngBounds;
        // ... etc
      };
    };
    initMap?: () => void;
  }
}

export { };
const GoogleMapsComponent: React.FC<GoogleMapsProps> = ({
  apiKey,
  robots = [],
  plantingPoints = [],
  center = { lat: 14.5995, lng: 120.9842 }, // Default to Philippines
  zoom = 15,
  onRobotClick
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [markers, setMarkers] = useState<any[]>([]);

  // Load Google Maps API
  useEffect(() => {
    if (window.google) {
      setIsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
    script.async = true;
    script.defer = true;

    window.initMap = () => {
      setIsLoaded(true);
    };

    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      delete window.initMap;
    };
  }, [apiKey]);

  // Initialize map
  useEffect(() => {
    if (isLoaded && mapRef.current && !map) {
      const googleMap = new window.google.maps.Map(mapRef.current, {
        center,
        zoom,
        mapTypeId: 'satellite',
        styles: [
          {
            featureType: 'all',
            elementType: 'labels',
            stylers: [{ visibility: 'on' }]
          }
        ]
      });

      setMap(googleMap);
    }
  }, [isLoaded, center, zoom, map]);

  // Update markers when robots or planting points change
  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));
    const newMarkers: any[] = [];

    // Add robot markers
    robots.forEach(robot => {
      const marker = new window.google.maps.Marker({
        position: { lat: robot.latitude, lng: robot.longitude },
        map,
        title: `Robot ${robot.id}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: robot.isOnline ? '#10b981' : '#ef4444',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div class="p-3">
            <h3 class="font-semibold text-gray-900">Robot ${robot.id}</h3>
            <div class="mt-2 space-y-1 text-sm">
              <div class="flex items-center gap-2">
                ${robot.isOnline ? 
                  '<span class="w-2 h-2 bg-green-500 rounded-full"></span>Online' : 
                  '<span class="w-2 h-2 bg-red-500 rounded-full"></span>Offline'
                }
              </div>
              <div>Battery: ${robot.battery}%</div>
              <div>Last seen: ${robot.lastSeen.toLocaleString()}</div>
            </div>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
        if (onRobotClick) onRobotClick(robot);
      });

      newMarkers.push(marker);
    });

    // Add planting point markers
    plantingPoints.forEach((point, index) => {
      const marker = new window.google.maps.Marker({
        position: { lat: point.latitude, lng: point.longitude },
        map,
        title: `Planting Point ${index + 1}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: point.status === 'OK' ? '#10b981' : 
                    point.status === 'Shallow' ? '#f59e0b' : '#ef4444',
          fillOpacity: 0.8,
          strokeColor: '#ffffff',
          strokeWeight: 1
        }
      });

      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div class="p-2">
            <h4 class="font-medium">Planting Point</h4>
            <div class="mt-1 text-sm">
              <div>Depth: ${point.depth} cm</div>
              <div>Status: <span class="${
                point.status === 'OK' ? 'text-green-600' :
                point.status === 'Shallow' ? 'text-yellow-600' : 'text-red-600'
              }">${point.status}</span></div>
              <div>Time: ${point.timestamp.toLocaleTimeString()}</div>
            </div>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);
  }, [map, robots, plantingPoints, onRobotClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markers.forEach(marker => marker.setMap(null));
    };
  }, [markers]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      
      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white p-3 rounded-lg shadow-lg">
        <h4 className="font-semibold mb-2 text-sm">Legend</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>Online Robot</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span>Offline Robot</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Good Planting</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>Shallow Planting</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Deep Planting</span>
          </div>
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Active Robots</div>
            <div className="font-semibold text-lg">
              {robots.filter(r => r.isOnline).length}/{robots.length}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Planting Points</div>
            <div className="font-semibold text-lg">{plantingPoints.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleMapsComponent;