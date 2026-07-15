import React, { useEffect, useRef, useState } from 'react';

interface EmployeeLocationMapProps {
  latitude: number;
  longitude: number;
  employeeName: string;
  actionType: 'Clock In' | 'Clock Out' | 'Lokasi' | string;
  timeStr?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  storeRadius?: number;
  storeName?: string;
}

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    // Check if L is already globally defined
    if ((window as any).L) {
      resolve((window as any).L);
      return;
    }

    // Insert Leaflet Stylesheet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.crossOrigin = '';
    document.head.appendChild(link);

    // Insert Leaflet Script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.crossOrigin = '';
    script.onload = () => {
      resolve((window as any).L);
    };
    script.onerror = () => {
      reject(new Error('Gagal memuat peta Leaflet. Silakan periksa koneksi internet Anda.'));
    };
    document.head.appendChild(script);
  });

  return leafletPromise;
}

export const EmployeeLocationMap: React.FC<EmployeeLocationMapProps> = ({
  latitude,
  longitude,
  employeeName,
  actionType,
  timeStr,
  storeLatitude,
  storeLongitude,
  storeRadius,
  storeName = 'Kantor/Toko Pusat',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    loadLeaflet()
      .then((L) => {
        if (!isMounted || !mapContainerRef.current) return;
        setLoading(false);

        // Clean up previous map instance if it exists
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        try {
          // Initialize map centered at employee's location
          const map = L.map(mapContainerRef.current, {
            zoomControl: true,
            scrollWheelZoom: true,
          }).setView([latitude, longitude], 16);

          mapInstanceRef.current = map;

          // Add beautiful OpenStreetMap tile layer
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map);

          // Custom modern SVG-based DivIcons for pixel-perfect display and no asset issues
          const employeeIcon = L.divIcon({
            className: 'custom-leaflet-div-icon',
            html: `
              <div class="relative flex items-center justify-center w-10 h-10">
                <div class="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping"></div>
                <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white shadow-lg border-2 border-white">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });

          const storeIcon = L.divIcon({
            className: 'custom-leaflet-div-icon',
            html: `
              <div class="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 text-white shadow-lg border-2 border-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });

          // Create standard markers
          const empMarker = L.marker([latitude, longitude], { icon: employeeIcon })
            .addTo(map)
            .bindPopup(`
              <div class="p-1 font-sans text-xs max-w-[200px]">
                <div class="font-bold text-indigo-700 leading-tight">${employeeName}</div>
                <div class="font-semibold text-slate-700 text-[10px] mt-1 bg-indigo-50 px-1.5 py-0.5 rounded inline-block uppercase">
                  ${actionType} ${timeStr ? `• ${timeStr}` : ''}
                </div>
                <div class="text-slate-400 font-mono text-[9px] mt-1.5">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div>
              </div>
            `);

          // Open popup automatically for high clarity
          setTimeout(() => {
            if (isMounted && mapInstanceRef.current) {
              empMarker.openPopup();
            }
          }, 400);

          // If store location details are supplied, overlay store marker and radius circle
          if (storeLatitude !== undefined && storeLongitude !== undefined) {
            const storeMarker = L.marker([storeLatitude, storeLongitude], { icon: storeIcon })
              .addTo(map)
              .bindPopup(`
                <div class="p-1 font-sans text-xs">
                  <div class="font-bold text-emerald-700 leading-tight">${storeName}</div>
                  <div class="text-slate-500 text-[10px] mt-0.5">Koordinat Absensi Resmi</div>
                  ${storeRadius ? `<div class="text-slate-400 text-[9px] mt-1">Radius Izin: ${storeRadius} meter</div>` : ''}
                </div>
              `);

            // Add the geofencing circle
            if (storeRadius) {
              L.circle([storeLatitude, storeLongitude], {
                color: '#10b981',
                fillColor: '#10b981',
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: '4, 4',
                radius: storeRadius,
              }).addTo(map);
            }

            // Draw a linking line between employee and store
            L.polyline([[latitude, longitude], [storeLatitude, storeLongitude]], {
              color: '#6366f1',
              weight: 1.5,
              opacity: 0.5,
              dashArray: '5, 5',
            }).addTo(map);

            // Fit bounds to cover both coordinates
            const bounds = L.latLngBounds([
              [latitude, longitude],
              [storeLatitude, storeLongitude],
            ]);
            map.fitBounds(bounds.pad(0.35));
          }
        } catch (mapErr: any) {
          console.error('Error rendering Leaflet Map:', mapErr);
          setError(mapErr.message || 'Gagal merender peta');
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Gagal memuat aset peta');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, employeeName, actionType, timeStr, storeLatitude, storeLongitude, storeRadius, storeName]);

  return (
    <div id="map-visualizer-container" className="relative w-full h-full rounded-xl overflow-hidden border border-slate-100 bg-slate-50 shadow-inner flex flex-col justify-center items-center min-h-[320px]">
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/90 text-slate-500 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-indigo-600 animate-spin"></div>
          <span className="text-xs font-semibold">Memuat Peta Lokasi...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-rose-50/95 text-rose-600 p-6 text-center gap-2">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider">Kesalahan Peta</span>
          <p className="text-xs text-slate-500 max-w-xs">{error}</p>
        </div>
      )}

      <div ref={mapContainerRef} className="w-full h-full min-h-[320px] z-0" />
    </div>
  );
};
