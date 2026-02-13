import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { getCategoryColor, getCategoryLabel } from '../../constants/categories';

function createNumberedIcon(number, category = 'other', isSelected = false) {
  const baseColor = getCategoryColor(category);
  const borderColor = isSelected ? '#dc2626' : 'white';
  const borderWidth = isSelected ? 4 : 3;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${baseColor};
        color: white;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        border: ${borderWidth}px solid ${borderColor};
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      ">
        ${number}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

export default function EventMarker({ event, index, isSelected, onClick }) {
  const icon = createNumberedIcon(index + 1, event.category, isSelected);
  const formattedDate = new Date(event.event_date).toLocaleDateString();
  const endDate = event.end_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : '';

  return (
    <Marker
      position={[event.latitude, event.longitude]}
      icon={icon}
      eventHandlers={{
        click: () => onClick(event),
      }}
    >
      <Popup>
        <div className="min-w-[150px]">
          <div className="flex items-center gap-1 mb-1">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: getCategoryColor(event.category) }}
            />
            <span className="text-xs text-gray-500">{getCategoryLabel(event.category)}</span>
          </div>
          <h3 className="font-bold text-lg">{event.title}</h3>
          <p className="text-gray-600 text-sm">{formattedDate}{endDate}</p>
          {event.description && (
            <p className="mt-2 text-sm">{event.description}</p>
          )}
          {event.user_name && (
            <p className="mt-2 text-xs text-purple-600">By {event.user_name}</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
