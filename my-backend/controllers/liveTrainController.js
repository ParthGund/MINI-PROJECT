/**
 * controllers/liveTrainController.js
 *
 * Handles all external IRCTC RapidAPI calls:
 *   - searchStations   → GET /api/live/stations?query=mumbai
 *   - getTrainsBetween → GET /api/live/trains?from=BCT&to=NDLS&date=2026-04-15
 *   - getTrainSchedule → GET /api/live/train/:trainNo
 *
 * Features:
 *   - In-memory caching (TTL-based) to prevent repeated API calls
 *   - Graceful fallback to mock data when API fails
 *   - Clean async/await error handling
 */

'use strict';

// ── In-memory cache ─────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ── RapidAPI config ─────────────────────────────────────────────────────────
function getApiHeaders() {
  return {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY || process.env.API_KEY || '',
    'x-rapidapi-host': process.env.RAPIDAPI_HOST || process.env.API_HOST || 'irctc1.p.rapidapi.com',
  };
}

const API_BASE = 'https://irctc1.p.rapidapi.com';

// ── Fallback / Mock Data ────────────────────────────────────────────────────
const MOCK_STATIONS = {
  mumbai: [
    { name: 'Mumbai Central', code: 'BCT' },
    { name: 'Chhatrapati Shivaji Terminus', code: 'CSMT' },
    { name: 'Mumbai Dadar', code: 'DR' },
    { name: 'Mumbai Bandra', code: 'BDTS' },
    { name: 'Mumbai LTT', code: 'LTT' },
  ],
  delhi: [
    { name: 'New Delhi', code: 'NDLS' },
    { name: 'Old Delhi', code: 'DLI' },
    { name: 'Hazrat Nizamuddin', code: 'NZM' },
    { name: 'Anand Vihar', code: 'ANVT' },
    { name: 'Delhi Sarai Rohilla', code: 'DEE' },
  ],
  pune: [
    { name: 'Pune Junction', code: 'PUNE' },
    { name: 'Shivajinagar', code: 'SVG' },
    { name: 'Khadki', code: 'KK' },
  ],
  bangalore: [
    { name: 'Bangalore City Junction', code: 'SBC' },
    { name: 'Yesvantpur Junction', code: 'YPR' },
    { name: 'Krishnarajapuram', code: 'KJM' },
  ],
  chennai: [
    { name: 'Chennai Central', code: 'MAS' },
    { name: 'Chennai Egmore', code: 'MS' },
    { name: 'Tambaram', code: 'TBM' },
  ],
  kolkata: [
    { name: 'Howrah Junction', code: 'HWH' },
    { name: 'Sealdah', code: 'SDAH' },
    { name: 'Kolkata', code: 'KOAA' },
  ],
  jaipur: [
    { name: 'Jaipur Junction', code: 'JP' },
    { name: 'Gandhinagar Jaipur', code: 'GADJ' },
  ],
  ahmedabad: [
    { name: 'Ahmedabad Junction', code: 'ADI' },
    { name: 'Sabarmati Junction', code: 'SBI' },
  ],
  hyderabad: [
    { name: 'Secunderabad Junction', code: 'SC' },
    { name: 'Hyderabad Deccan', code: 'HYB' },
    { name: 'Kacheguda', code: 'KCG' },
  ],
  lucknow: [
    { name: 'Lucknow NR', code: 'LKO' },
    { name: 'Lucknow Charbagh', code: 'LJN' },
  ],
};

const MOCK_TRAINS = [
  {
    train_number: '12951',
    train_name: 'Mumbai Rajdhani Express',
    from_sta: 'BCT',
    to_sta: 'NDLS',
    from_std: '16:35',
    to_std: '08:35',
    duration: '16h 0m',
    train_type: 'Rajdhani',
    run_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    classes: ['1A', '2A', '3A'],
  },
  {
    train_number: '12953',
    train_name: 'August Kranti Rajdhani',
    from_sta: 'BCT',
    to_sta: 'NZM',
    from_std: '17:40',
    to_std: '10:55',
    duration: '17h 15m',
    train_type: 'Rajdhani',
    run_days: ['Mon', 'Wed', 'Fri', 'Sun'],
    classes: ['1A', '2A', '3A'],
  },
  {
    train_number: '12137',
    train_name: 'Punjab Mail',
    from_sta: 'CSMT',
    to_sta: 'FZR',
    from_std: '19:40',
    to_std: '23:25',
    duration: '27h 45m',
    train_type: 'Mail',
    run_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    classes: ['1A', '2A', '3A', 'SL'],
  },
  {
    train_number: '12261',
    train_name: 'Howrah Duronto Express',
    from_sta: 'CSMT',
    to_sta: 'HWH',
    from_std: '15:55',
    to_std: '16:10',
    duration: '24h 15m',
    train_type: 'Duronto',
    run_days: ['Tue', 'Thu', 'Sat'],
    classes: ['1A', '2A', '3A'],
  },
  {
    train_number: '12627',
    train_name: 'Karnataka Express',
    from_sta: 'NDLS',
    to_sta: 'SBC',
    from_std: '21:20',
    to_std: '06:40',
    duration: '33h 20m',
    train_type: 'Superfast',
    run_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    classes: ['1A', '2A', '3A', 'SL', '2S'],
  },
];

const MOCK_SCHEDULE = {
  '12951': {
    train_number: '12951',
    train_name: 'Mumbai Rajdhani Express',
    source: 'BCT',
    destination: 'NDLS',
    route: [
      { station_name: 'Mumbai Central', station_code: 'BCT', arrive: 'Source', depart: '16:35', day: 1, halt: '-', distance: 0 },
      { station_name: 'Borivali', station_code: 'BVI', arrive: '17:03', depart: '17:05', day: 1, halt: '2 min', distance: 33 },
      { station_name: 'Surat', station_code: 'ST', arrive: '19:48', depart: '19:50', day: 1, halt: '2 min', distance: 263 },
      { station_name: 'Vadodara Junction', station_code: 'BRC', arrive: '21:07', depart: '21:12', day: 1, halt: '5 min', distance: 392 },
      { station_name: 'Ratlam Junction', station_code: 'RTM', arrive: '00:22', depart: '00:25', day: 2, halt: '3 min', distance: 622 },
      { station_name: 'Kota Junction', station_code: 'KOTA', arrive: '03:15', depart: '03:20', day: 2, halt: '5 min', distance: 828 },
      { station_name: 'Sawai Madhopur', station_code: 'SWM', arrive: '04:40', depart: '04:42', day: 2, halt: '2 min', distance: 929 },
      { station_name: 'New Delhi', station_code: 'NDLS', arrive: '08:35', depart: 'Destination', day: 2, halt: '-', distance: 1384 },
    ],
  },
  default: {
    train_number: '00000',
    train_name: 'Unknown Train',
    source: '---',
    destination: '---',
    route: [
      { station_name: 'Source Station', station_code: 'SRC', arrive: 'Source', depart: '00:00', day: 1, halt: '-', distance: 0 },
      { station_name: 'Intermediate 1', station_code: 'INT1', arrive: '03:00', depart: '03:05', day: 1, halt: '5 min', distance: 200 },
      { station_name: 'Intermediate 2', station_code: 'INT2', arrive: '06:30', depart: '06:35', day: 1, halt: '5 min', distance: 450 },
      { station_name: 'Destination Station', station_code: 'DST', arrive: '10:00', depart: 'Destination', day: 1, halt: '-', distance: 700 },
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch(url, headers) {
  // Dynamic import for fetch (Node 18+ has global fetch)
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/live/stations?query=mumbai
// ─────────────────────────────────────────────────────────────────────────────
const searchStations = async (req, res) => {
  const query = (req.query.query || '').trim().toLowerCase();
  if (!query || query.length < 2) {
    return res.status(400).json({ message: 'Query must be at least 2 characters', stations: [] });
  }

  const cacheKey = `stations:${query}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ stations: cached, source: 'cache' });
  }

  try {
    const headers = getApiHeaders();
    if (!headers['x-rapidapi-key']) throw new Error('No API key configured');

    const url = `${API_BASE}/api/v1/searchStation?query=${encodeURIComponent(query)}`;
    const data = await apiFetch(url, headers);

    // Normalize response
    const stations = (data.data || []).map(s => ({
      name: s.name || s.station_name || '',
      code: s.code || s.station_code || '',
    }));

    setCache(cacheKey, stations);
    return res.json({ stations, source: 'api' });

  } catch (err) {
    console.warn('[liveTrainController.searchStations] API failed, using fallback:', err.message);

    // Fallback: search mock data
    const fallback = [];
    for (const [key, stns] of Object.entries(MOCK_STATIONS)) {
      if (key.includes(query)) {
        fallback.push(...stns);
      } else {
        for (const s of stns) {
          if (s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query)) {
            fallback.push(s);
          }
        }
      }
    }

    // De-duplicate
    const unique = [...new Map(fallback.map(s => [s.code, s])).values()];
    setCache(cacheKey, unique);
    return res.json({ stations: unique, source: 'fallback' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/live/trains?from=BCT&to=NDLS&date=2026-04-15
// ─────────────────────────────────────────────────────────────────────────────
const getTrainsBetween = async (req, res) => {
  const from = (req.query.from || '').trim().toUpperCase();
  const to = (req.query.to || '').trim().toUpperCase();
  const dateOfJourney = req.query.date || new Date().toISOString().split('T')[0];

  if (!from || !to) {
    return res.status(400).json({ message: 'Both "from" and "to" station codes are required', trains: [] });
  }

  const cacheKey = `trains:${from}:${to}:${dateOfJourney}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ trains: cached, source: 'cache', from, to, date: dateOfJourney });
  }

  try {
    const headers = getApiHeaders();
    if (!headers['x-rapidapi-key']) throw new Error('No API key configured');

    const url = `${API_BASE}/api/v3/trainBetweenStations?fromStationCode=${encodeURIComponent(from)}&toStationCode=${encodeURIComponent(to)}&dateOfJourney=${encodeURIComponent(dateOfJourney)}`;
    const data = await apiFetch(url, headers);

    const trains = (data.data || []).map(t => ({
      train_number: t.train_number || '',
      train_name: t.train_name || '',
      from_sta: t.from_sta || t.train_src || from,
      to_sta: t.to_sta || t.train_dstn || to,
      from_std: t.from_std || t.from || '',
      to_std: t.to_std || t.to || '',
      duration: t.duration || '',
      train_type: t.train_type || '',
      run_days: t.run_days || [],
      classes: t.class_type || t.classes || [],
    }));

    setCache(cacheKey, trains);
    return res.json({ trains, source: 'api', from, to, date: dateOfJourney });

  } catch (err) {
    console.warn('[liveTrainController.getTrainsBetween] API failed, using fallback:', err.message);

    // Fallback: filter mock trains
    const fallback = MOCK_TRAINS.filter(t => {
      const matchFrom = t.from_sta === from || !from;
      const matchTo = t.to_sta === to || !to;
      return matchFrom || matchTo || true; // return all mock trains as fallback
    });

    setCache(cacheKey, fallback);
    return res.json({ trains: fallback, source: 'fallback', from, to, date: dateOfJourney });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/live/train/:trainNo
// ─────────────────────────────────────────────────────────────────────────────
const getTrainSchedule = async (req, res) => {
  const trainNo = (req.params.trainNo || '').trim();
  if (!trainNo) {
    return res.status(400).json({ message: 'Train number is required' });
  }

  const cacheKey = `schedule:${trainNo}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ schedule: cached, source: 'cache' });
  }

  try {
    const headers = getApiHeaders();
    if (!headers['x-rapidapi-key']) throw new Error('No API key configured');

    const url = `${API_BASE}/api/v1/getTrainSchedule?trainNo=${encodeURIComponent(trainNo)}`;
    const data = await apiFetch(url, headers);

    const schedule = {
      train_number: data.data?.train_number || trainNo,
      train_name: data.data?.train_name || '',
      source: data.data?.source || '',
      destination: data.data?.destination || '',
      route: (data.data?.route || []).map(stop => ({
        station_name: stop.station_name || '',
        station_code: stop.station_code || '',
        arrive: stop.arrive || stop.arrival || '',
        depart: stop.depart || stop.departure || '',
        day: stop.day || 1,
        halt: stop.halt || '-',
        distance: stop.distance || 0,
      })),
    };

    setCache(cacheKey, schedule);
    return res.json({ schedule, source: 'api' });

  } catch (err) {
    console.warn('[liveTrainController.getTrainSchedule] API failed, using fallback:', err.message);

    const fallback = MOCK_SCHEDULE[trainNo] || {
      ...MOCK_SCHEDULE.default,
      train_number: trainNo,
      train_name: `Train ${trainNo}`,
    };

    setCache(cacheKey, fallback);
    return res.json({ schedule: fallback, source: 'fallback' });
  }
};

// ── Cache management endpoint ───────────────────────────────────────────────
const clearCache = (req, res) => {
  const size = cache.size;
  cache.clear();
  res.json({ message: `Cache cleared (${size} entries removed)` });
};

module.exports = {
  searchStations,
  getTrainsBetween,
  getTrainSchedule,
  clearCache,
};
