import { useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import EventMarker from './EventMarker';
import OriginsOverlay from './OriginsOverlay';
import EventLines from './EventLines';

// Fix Leaflet default marker icons issue
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapClickHandler({ onMapClick, isAddingEvent }) {
  useMapEvents({
    click: (e) => {
      if (isAddingEvent) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

function MapViewController({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 13, { duration: 1 });
    }
  }, [center, zoom, map]);

  return null;
}

function SearchFlasher({ position }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;

    const latlng = [position.lat || position[0], position.lon || position.lng || position[1]];

    // Add pulsing CSS animation to map container if not already there
    const container = map.getContainer();
    if (!container.querySelector('#search-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'search-pulse-style';
      style.textContent = `
        @keyframes search-pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        .search-pulse-ring {
          animation: search-pulse 1.2s ease-out infinite;
        }
        .search-pulse-ring-delayed {
          animation: search-pulse 1.2s ease-out 0.4s infinite;
        }
      `;
      container.appendChild(style);
    }

    // Create pulsing SVG overlay
    const svgIcon = L.divIcon({
      className: '',
      html: `
        <svg width="80" height="80" viewBox="0 0 80 80" style="position:absolute;left:-40px;top:-40px;">
          <circle cx="40" cy="40" r="8" fill="none" stroke="#2563eb" stroke-width="3" opacity="0.6" class="search-pulse-ring"/>
          <circle cx="40" cy="40" r="8" fill="none" stroke="#2563eb" stroke-width="2" opacity="0.4" class="search-pulse-ring-delayed"/>
          <circle cx="40" cy="40" r="6" fill="#2563eb" opacity="0.85"/>
          <circle cx="40" cy="40" r="3" fill="white" opacity="0.9"/>
        </svg>
      `,
      iconSize: [0, 0],
    });

    const marker = L.marker(latlng, { icon: svgIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);

    const timer = setTimeout(() => {
      map.removeLayer(marker);
    }, 4000);

    return () => {
      clearTimeout(timer);
      if (map.hasLayer(marker)) map.removeLayer(marker);
    };
  }, [position, map]);

  return null;
}

export default function MapView({
  events = [],
  familyEvents = [],
  selectedEvent,
  onEventClick,
  onMapClick,
  isAddingEvent,
  mapCenter,
  mapZoom,
  searchLocation,
  showOrigins = false,
  showLines = false,
  currentLineIndex = -1,
}) {
  const defaultCenter = [39.8283, -98.5795];
  const defaultZoom = 4;

  // Filter out user's own events from family events to avoid duplicates
  const otherFamilyEvents = familyEvents.filter(
    (fe) => !events.find((e) => e.id === fe.id)
  );

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onMapClick={onMapClick} isAddingEvent={isAddingEvent} />
        <MapViewController center={mapCenter} zoom={mapZoom} />
        <SearchFlasher position={searchLocation} />

        {showOrigins && <OriginsOverlay events={[...events, ...familyEvents]} />}
        {showLines && <EventLines events={events} currentIndex={currentLineIndex} />}

        {/* User's own events */}
        {events.map((event, index) => (
          <EventMarker
            key={event.id}
            event={event}
            index={index}
            isSelected={selectedEvent?.id === event.id}
            onClick={onEventClick}
          />
        ))}

        {/* Family members' events */}
        {otherFamilyEvents.map((event, index) => (
          <EventMarker
            key={`family-${event.id}`}
            event={event}
            index={events.length + index}
            isSelected={selectedEvent?.id === event.id}
            onClick={onEventClick}
          />
        ))}
      </MapContainer>

      {isAddingEvent && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-[1000]">
          Click on the map to place your event
        </div>
      )}
    </div>
  );
}
