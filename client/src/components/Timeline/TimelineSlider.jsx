import { useMemo } from 'react';

export default function TimelineSlider({ events, currentIndex, onIndexChange }) {
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }, [events]);

  if (sortedEvents.length === 0) {
    return null;
  }

  const minYear = new Date(sortedEvents[0].event_date).getFullYear();
  const maxYear = new Date(sortedEvents[sortedEvents.length - 1].event_date).getFullYear();
  const currentEvent = sortedEvents[currentIndex];

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Current event display */}
        <div className="text-center mb-4">
          <h3 className="font-semibold text-lg text-gray-800">
            {currentEvent?.title || 'Select an event'}
          </h3>
          {currentEvent && (
            <p className="text-sm text-gray-500">{formatDate(currentEvent.event_date)}</p>
          )}
        </div>

        {/* Slider */}
        <div className="relative px-4">
          <input
            type="range"
            min={0}
            max={sortedEvents.length - 1}
            value={currentIndex}
            onChange={(e) => onIndexChange(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />

          {/* Year labels */}
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>

        {/* Event dots */}
        <div className="relative h-6 mt-2">
          {sortedEvents.map((event, index) => {
            const position = (index / (sortedEvents.length - 1)) * 100 || 0;
            return (
              <button
                key={event.id}
                onClick={() => onIndexChange(index)}
                className={`absolute w-3 h-3 rounded-full transform -translate-x-1/2 transition-all ${
                  index === currentIndex
                    ? 'bg-blue-600 scale-150'
                    : 'bg-gray-400 hover:bg-blue-400'
                }`}
                style={{ left: `${position}%` }}
                title={`${event.title} - ${formatDate(event.event_date)}`}
              />
            );
          })}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &larr; Previous
          </button>
          <span className="py-2 text-gray-600">
            {currentIndex + 1} of {sortedEvents.length}
          </span>
          <button
            onClick={() => onIndexChange(Math.min(sortedEvents.length - 1, currentIndex + 1))}
            disabled={currentIndex === sortedEvents.length - 1}
            className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
