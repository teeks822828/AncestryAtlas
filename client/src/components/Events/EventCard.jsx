import { getCategoryColor, getCategoryLabel } from '../../constants/categories';
import { UPLOADS_URL } from '../../hooks/useApi';

export default function EventCard({ event, index, isSelected, onClick, onEdit, onDelete, readOnly = false }) {
  const dateOpts = { year: 'numeric', month: 'long', day: 'numeric' };
  const startDate = new Date(event.event_date).toLocaleDateString('en-US', dateOpts);
  const endDate = event.end_date
    ? new Date(event.end_date).toLocaleDateString('en-US', dateOpts)
    : null;
  const formattedDate = endDate ? `${startDate} - ${endDate}` : startDate;
  const catColor = getCategoryColor(event.category);

  return (
    <div
      onClick={() => onClick(event)}
      className={`p-3 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-100 border-2 border-blue-500'
          : 'bg-white border border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: catColor }}
        >
          {index + 1}
        </div>
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 truncate">{event.title}</h3>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: catColor }}>
              {getCategoryLabel(event.category)}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{formattedDate}</p>
          {event.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
          )}
          {event.photos && event.photos.length > 0 && (
            <div className="flex gap-1 mt-2">
              {event.photos.slice(0, 3).map((photo) => (
                <img
                  key={photo.id}
                  src={`${UPLOADS_URL}/${photo.filename}`}
                  alt=""
                  className="w-10 h-10 rounded object-cover"
                />
              ))}
              {event.photos.length > 3 && (
                <span className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                  +{event.photos.length - 3}
                </span>
              )}
            </div>
          )}
          {event.user_name && (
            <p className="text-xs text-purple-600 mt-1">By {event.user_name}</p>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(event);
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Are you sure you want to delete this event?')) {
                onDelete(event.id);
              }
            }}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
