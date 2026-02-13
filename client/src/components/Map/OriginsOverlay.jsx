import { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';

// Map place name fragments to ISO country names used in GeoJSON
const COUNTRY_MAPPINGS = {
  'australia': 'Australia',
  'new south wales': 'Australia',
  'nsw': 'Australia',
  'sydney': 'Australia',
  'england': 'United Kingdom',
  'wales': 'United Kingdom',
  'warwickshire': 'United Kingdom',
  'staffordshire': 'United Kingdom',
  'berkshire': 'United Kingdom',
  'hampshire': 'United Kingdom',
  'sri lanka': 'Sri Lanka',
  'ceylon': 'Sri Lanka',
  'colombo': 'Sri Lanka',
  'trincomalee': 'Sri Lanka',
  'galle': 'Sri Lanka',
  'jaffna': 'Sri Lanka',
  'india': 'India',
  'madras': 'India',
  'tamil nadu': 'India',
  'cuddalore': 'India',
  'vepery': 'India',
  'belgium': 'Belgium',
  'belgique': 'Belgium',
  'brugge': 'Belgium',
  'bruges': 'Belgium',
  'west-vlaanderen': 'Belgium',
  'france': 'France',
  'aquitaine': 'France',
  'gironde': 'France',
  'germany': 'Germany',
  'north rhine-westphalia': 'Germany',
  'minden': 'Germany',
  'kolberg': 'Germany',
  'ireland': 'Ireland',
  'antrim': 'Ireland',
  'cork': 'Ireland',
  'westmeath': 'Ireland',
  'county down': 'Ireland',
};

// Colors for different countries
const COUNTRY_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
];

/**
 * Extract country from a place string
 */
function extractCountry(place) {
  if (!place) return null;
  const lower = place.toLowerCase();

  for (const [fragment, country] of Object.entries(COUNTRY_MAPPINGS)) {
    if (lower.includes(fragment)) {
      return country;
    }
  }
  return null;
}

/**
 * Analyze events to get country counts
 */
function getCountryCounts(events) {
  const counts = {};
  for (const event of events) {
    // Try the event title for person name context, but use description or place-based extraction
    const place = event.title || event.description || '';
    // We also parse from lat/lon isn't practical, so we rely on the place data
    // embedded in the description or title

    // For GEDCOM events, titles are like "John Smith - Birth" with descriptions like "Born: 12 Oct 1982"
    // The place info was geocoded but we don't store the original place name in the event.
    // Instead, we can reverse-map from coordinates to approximate country
  }
  return counts;
}

// GeoJSON data URL - Natural Earth low-res countries
const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

// Smaller alternative - just the boundaries we need
const COUNTRIES_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

export default function OriginsOverlay({ events = [] }) {
  const [geoData, setGeoData] = useState(null);
  const [countryCounts, setCountryCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const map = useMap();

  // Determine which countries are represented using reverse geocoding from coordinates
  useEffect(() => {
    if (events.length === 0) {
      setCountryCounts({});
      return;
    }

    // Group events by approximate country using coordinate bounding boxes
    const counts = {};

    for (const event of events) {
      const lat = event.latitude;
      const lon = event.longitude;
      const country = getCountryFromCoords(lat, lon);
      if (country) {
        counts[country] = (counts[country] || 0) + 1;
      }
    }

    setCountryCounts(counts);
  }, [events]);

  // Fetch GeoJSON data when we have countries to show
  useEffect(() => {
    const countries = Object.keys(countryCounts);
    if (countries.length === 0 || geoData) return;

    setLoading(true);
    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(data => {
        setGeoData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load GeoJSON:', err);
        setLoading(false);
      });
  }, [countryCounts, geoData]);

  if (!showOverlay || events.length === 0) return null;

  const countries = Object.keys(countryCounts);
  if (countries.length === 0) return null;

  // Assign colors to countries
  const colorMap = {};
  countries.forEach((country, i) => {
    colorMap[country] = COUNTRY_COLORS[i % COUNTRY_COLORS.length];
  });

  // Filter GeoJSON to only include our countries
  const filteredGeo = geoData ? {
    type: 'FeatureCollection',
    features: geoData.features.filter(f => {
      const name = f.properties.ADMIN || f.properties.name || '';
      return countries.includes(name);
    })
  } : null;

  const styleFeature = (feature) => {
    const name = feature.properties.ADMIN || feature.properties.name || '';
    const color = colorMap[name] || '#3b82f6';
    return {
      fillColor: color,
      fillOpacity: 0.2,
      color: color,
      weight: 2,
      opacity: 0.7,
    };
  };

  const onEachFeature = (feature, layer) => {
    const name = feature.properties.ADMIN || feature.properties.name || '';
    const count = countryCounts[name] || 0;
    layer.bindTooltip(`${name}: ${count} event${count !== 1 ? 's' : ''}`, {
      sticky: true,
      className: 'origins-tooltip',
    });
  };

  return (
    <>
      {filteredGeo && filteredGeo.features.length > 0 && (
        <GeoJSON
          key={countries.join(',')}
          data={filteredGeo}
          style={styleFeature}
          onEachFeature={onEachFeature}
        />
      )}

      {/* Legend */}
      <div
        className="leaflet-bottom leaflet-left"
        style={{ zIndex: 1000 }}
      >
        <div className="leaflet-control bg-white/90 rounded-lg shadow-lg p-3 m-3 max-w-[200px]">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Origins</h4>
            <button
              onClick={() => setShowOverlay(false)}
              className="text-gray-400 hover:text-gray-600 text-xs"
            >
              Hide
            </button>
          </div>
          {loading && <p className="text-xs text-gray-500">Loading regions...</p>}
          <div className="space-y-1">
            {countries.sort().map(country => (
              <div key={country} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: colorMap[country], opacity: 0.7 }}
                />
                <span className="text-xs text-gray-700 truncate">
                  {country} ({countryCounts[country]})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Approximate country from lat/lon using bounding boxes
 * This avoids needing reverse geocoding API calls
 */
function getCountryFromCoords(lat, lon) {
  // Bounding boxes: [minLat, maxLat, minLon, maxLon]
  const boxes = [
    { name: 'Australia', bounds: [-44, -10, 112, 154] },
    { name: 'Sri Lanka', bounds: [5.9, 9.9, 79.5, 82] },
    { name: 'India', bounds: [6, 37, 68, 97] },
    { name: 'United Kingdom', bounds: [49.5, 61, -8.5, 2] },
    { name: 'Ireland', bounds: [51, 55.5, -11, -5.5] },
    { name: 'Belgium', bounds: [49.4, 51.6, 2.5, 6.5] },
    { name: 'France', bounds: [41, 51.2, -5.5, 9.5] },
    { name: 'Germany', bounds: [47, 55.1, 5.8, 15.1] },
    { name: 'Poland', bounds: [49, 55, 14, 24.2] },
  ];

  // Check smaller/more specific countries first to avoid overlap
  // Sort by area (smaller boxes first) for better precision
  const sorted = [...boxes].sort((a, b) => {
    const areaA = (a.bounds[1] - a.bounds[0]) * (a.bounds[3] - a.bounds[2]);
    const areaB = (b.bounds[1] - b.bounds[0]) * (b.bounds[3] - b.bounds[2]);
    return areaA - areaB;
  });

  for (const { name, bounds } of sorted) {
    const [minLat, maxLat, minLon, maxLon] = bounds;
    if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) {
      return name;
    }
  }

  return null;
}
