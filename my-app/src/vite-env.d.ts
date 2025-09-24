/// <reference types="vite/client" />
declare module '*.css';
declare module '*.svg' {
  const src: string;
  export default src;
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
