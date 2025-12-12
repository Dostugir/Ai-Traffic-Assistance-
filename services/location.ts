
export interface GeoPosition {
  lat: number;
  lng: number;
}

export const getLiveLocation = (): Promise<GeoPosition> => {
  return new Promise((resolve, reject) => {
    // 1. Check if browser supports Geolocation
    if (navigator.geolocation) {
      
      // 2. Request the position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Success! We found the user.
          const userPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          // (Note: Map visual updates moved to UI component or omitted as no Map instance exists here)
          console.log("Live location found:", userPos);
          resolve(userPos);
        },
        (error) => {
          // Error: User denied permission or GPS failed
          // Mapping error codes to readable messages similar to handleLocationError
          let msg = "The Geolocation service failed.";
          if (error.code === 1) msg = "Location permission denied.";
          else if (error.code === 3) msg = "Location request timed out.";
          reject(new Error(msg));
        },
        {
           enableHighAccuracy: true,
           timeout: 10000,
           maximumAge: 0
        }
      );
    } else {
      // Browser doesn't support Geolocation
      reject(new Error("Your browser doesn't support geolocation."));
    }
  });
};
