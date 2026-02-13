import { useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

/**
 * Calculate points along a curved arc between two coordinates.
 * The arc bulges perpendicular to the straight line, creating a nice visual curve.
 */
function getArcPoints(start, end, numPoints = 20) {
  const points = [];
  const [lat1, lon1] = start;
  const [lat2, lon2] = end;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const dist = Math.sqrt(dLat * dLat + dLon * dLon);

  const arcHeight = Math.min(dist * 0.3, 15);

  const perpLat = -dLon;
  const perpLon = dLat;
  const perpLen = Math.sqrt(perpLat * perpLat + perpLon * perpLon) || 1;
  const normPerpLat = perpLat / perpLen;
  const normPerpLon = perpLon / perpLen;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = lat1 + t * dLat;
    const lon = lon1 + t * dLon;
    const arcFactor = 4 * t * (1 - t) * arcHeight;

    points.push([
      lat + normPerpLat * arcFactor,
      lon + normPerpLon * arcFactor,
    ]);
  }

  return points;
}

/**
 * Renders curved dashed arcs between chronologically sequential events,
 * accumulating up to the current timeline position.
 */
export default function EventLines({ events = [], currentIndex = -1 }) {
  const map = useMap();

  useEffect(() => {
    if (events.length < 2 || currentIndex < 0) return;

    // Sort by date to guarantee chronological order
    const sorted = [...events]
      .filter(e => e != null)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    const lines = [];

    // Draw arcs from event 0→1, 1→2, ..., up to currentIndex
    const limit = Math.min(currentIndex, sorted.length - 1);
    for (let i = 0; i < limit; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];

      if (!from || !to) continue;

      // Skip if same location
      if (
        Math.abs(from.latitude - to.latitude) < 0.001 &&
        Math.abs(from.longitude - to.longitude) < 0.001
      ) {
        continue;
      }

      const arcPoints = getArcPoints(
        [from.latitude, from.longitude],
        [to.latitude, to.longitude]
      );

      const polyline = L.polyline(arcPoints, {
        color: '#6366f1',
        weight: 2,
        opacity: 0.5,
        dashArray: '8, 6',
        smoothFactor: 1,
        interactive: false,
      });

      polyline.addTo(map);
      lines.push(polyline);
    }

    return () => {
      lines.forEach(line => {
        if (map.hasLayer(line)) map.removeLayer(line);
      });
    };
  }, [events, currentIndex, map]);

  return null;
}
