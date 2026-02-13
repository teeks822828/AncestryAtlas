/**
 * Geocoder utility using Nominatim API with caching and rate limiting
 */

const https = require('https');
const http = require('http');

// In-memory cache for geocoding results
const cache = new Map();

/**
 * Clean place names for better geocoding results
 * Handles historical names like Ceylon → Sri Lanka, strips parentheticals, etc.
 */
function cleanPlaceName(place) {
  if (!place || place === '?') return null;

  let cleaned = place
    // Remove " - Burial" suffix and similar annotations
    .replace(/\s*-\s*Burial.*$/i, '')
    // Replace "Ceylon" with "Sri Lanka"
    .replace(/\bCeylon\b/gi, 'Sri Lanka')
    // Remove parenthetical annotations like "(Sri Lanka)" since we already have Sri Lanka
    .replace(/\(Sri Lanka\)/gi, '')
    // Remove "(Ceylon)" since we replaced it
    .replace(/\(Ceylon\)/gi, '')
    // Clean "Colombo, Western Prov., Ceylon. (Sri Lanka)" patterns
    .replace(/Western Prov\./gi, 'Western Province')
    // Strip common GEDCOM noise
    .replace(/\bEngnd\b/gi, 'England')
    .replace(/\bBelgique\b/gi, 'Belgium')
    // Remove extra commas and whitespace
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/g, '')
    .replace(/^\s*,/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Handle "Brugge" without country - add Belgium
  if (/^Brugge$/i.test(cleaned)) {
    cleaned = 'Brugge, Belgium';
  }

  // Handle "Kolberg" - historical name for Kołobrzeg, Poland
  if (/^Kolberg$/i.test(cleaned)) {
    cleaned = 'Kołobrzeg, Poland';
  }

  return cleaned || null;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an HTTPS GET request and return parsed JSON
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'AncestryAtlas/1.0 (educational genealogy project)',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

let lastRequestTime = 0;

/**
 * Geocode a place name using Nominatim API
 * @param {string} place - Raw place name from GEDCOM
 * @returns {Promise<{lat: number, lon: number} | null>}
 */
async function geocode(place) {
  const cleaned = cleanPlaceName(place);
  if (!cleaned) return null;

  // Check cache
  if (cache.has(cleaned)) {
    return cache.get(cleaned);
  }

  // Rate limit: at least 1 second between requests
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await sleep(1100 - elapsed);
  }
  lastRequestTime = Date.now();

  try {
    const query = encodeURIComponent(cleaned);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    const results = await fetchJson(url);

    if (results && results.length > 0) {
      const result = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
      cache.set(cleaned, result);
      return result;
    }

    // Try a simplified version: just take last 2-3 parts (city, country)
    const parts = cleaned.split(',').map(p => p.trim());
    if (parts.length > 2) {
      const simplified = parts.slice(-2).join(', ');
      await sleep(1100);
      lastRequestTime = Date.now();

      const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(simplified)}&format=json&limit=1`;
      const results2 = await fetchJson(url2);

      if (results2 && results2.length > 0) {
        const result = { lat: parseFloat(results2[0].lat), lon: parseFloat(results2[0].lon) };
        cache.set(cleaned, result);
        return result;
      }
    }

    // Cache null so we don't retry
    cache.set(cleaned, null);
    return null;
  } catch (err) {
    console.error(`Geocoding failed for "${cleaned}":`, err.message);
    cache.set(cleaned, null);
    return null;
  }
}

/**
 * Geocode multiple unique places with progress callback
 * @param {string[]} places - Array of place names
 * @param {function} onProgress - Called with (completed, total) counts
 * @returns {Promise<Map<string, {lat, lon}>>}
 */
async function geocodeAll(places, onProgress) {
  const unique = [...new Set(places.filter(p => p && p !== '?'))];
  const results = new Map();
  let completed = 0;

  for (const place of unique) {
    const coords = await geocode(place);
    if (coords) {
      results.set(place, coords);
    }
    completed++;
    if (onProgress) onProgress(completed, unique.length);
  }

  return results;
}

module.exports = { geocode, geocodeAll, cleanPlaceName };
