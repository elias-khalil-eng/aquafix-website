// Rule-based pool equipment sizing. The trained model only decides WHEN to run this;
// the numbers come from standard pool engineering rules of thumb below.

const TURNOVER_HOURS = 6;          // residential pools: filter the full volume every 6 hours
const DEFAULT_DEPTH = 1.5;         // used when the customer gives no depth
const FEET_TO_M = 0.3048;
const SDIC_G_PER_M3_PER_PPM = 1.8; // SDIC is ~56% available chlorine: 1 / 0.56 g per m3 per ppm
const START_PPM = 3;

// Sand filter capacity at ~50 m3/h per m2 of filter bed (high-rate residential filters).
// Sand amounts are typical values; the exact figure is printed on each filter.
const FILTERS = [
  { diameterMm: 400, maxFlow: 6, sandKg: 50 },
  { diameterMm: 500, maxFlow: 9, sandKg: 100 },
  { diameterMm: 600, maxFlow: 14, sandKg: 150 },
  { diameterMm: 650, maxFlow: 16, sandKg: 175 },
  { diameterMm: 750, maxFlow: 22, sandKg: 250 },
  { diameterMm: 900, maxFlow: 31, sandKg: 425 },
];

// Pump power needed to push that flow through a typical residential system (~10 m head).
const PUMPS = [
  { maxFlow: 6, hp: 0.5 },
  { maxFlow: 9, hp: 0.75 },
  { maxFlow: 14, hp: 1 },
  { maxFlow: 18, hp: 1.5 },
  { maxFlow: 24, hp: 2 },
  { maxFlow: 31, hp: 3 },
];

const HOSE_LENGTHS = [8, 10, 12, 15, 20];

const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Read pool dimensions from free text.
 * Understands "8x4x1.5", "8 by 4, 1.6 deep", "60 m3", "round 5m diameter 1.2 deep", feet.
 * Returns null when no usable size is found.
 */
export function parsePoolSize(text) {
  const t = text.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  const inFeet = /\b(ft|feet|foot)\b|'/.test(t);
  const unit = inFeet ? FEET_TO_M : 1;

  const volumeMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:m3|m³|cbm|cubic|cu\.?\s*m)/);
  if (volumeMatch) {
    const volume = Number(volumeMatch[1]);
    return volume >= 1 && volume <= 3000 ? { shape: 'volume', volume } : null;
  }

  const numbers = (t.match(/\d+(?:\.\d+)?/g) || []).map((n) => Number(n) * unit);
  const depthOk = (d) => d >= 0.3 && d <= 5;
  const sideOk = (s) => s >= 1 && s <= 60;

  if (/round|circle|circular|diameter/.test(t) && numbers.length >= 1) {
    const [diameter, depth = DEFAULT_DEPTH] = numbers;
    if (!sideOk(diameter) || !depthOk(depth)) return null;
    return { shape: 'round', diameter, depth, depthAssumed: numbers.length < 2 };
  }

  if (numbers.length >= 2) {
    const [length, width, depth = DEFAULT_DEPTH] = numbers;
    if (!sideOk(length) || !sideOk(width) || !depthOk(depth)) return null;
    return { shape: 'rect', length, width, depth, depthAssumed: numbers.length < 3 };
  }
  return null;
}

/** Turn a parsed size into an equipment plan. */
export function calculatePool(size) {
  let volume;
  let surfaceArea;
  let longestSide;
  const depth = size.depth ?? DEFAULT_DEPTH;

  if (size.shape === 'rect') {
    surfaceArea = size.length * size.width;
    volume = surfaceArea * depth;
    longestSide = Math.max(size.length, size.width);
  } else if (size.shape === 'round') {
    surfaceArea = Math.PI * (size.diameter / 2) ** 2;
    volume = surfaceArea * depth;
    longestSide = size.diameter;
  } else {
    volume = size.volume;
    surfaceArea = volume / DEFAULT_DEPTH;
    // assume a 2:1 rectangle to estimate the longest side for the vacuum hose
    longestSide = Math.sqrt(surfaceArea * 2);
  }

  const flowRate = volume / TURNOVER_HOURS;
  const filter = FILTERS.find((f) => f.maxFlow >= flowRate) || null;
  const pump = PUMPS.find((p) => p.maxFlow >= flowRate) || null;
  const hoseNeed = longestSide + depth + 1;
  const hoseLength = HOSE_LENGTHS.find((h) => h >= hoseNeed) || HOSE_LENGTHS.at(-1);

  return {
    volume: round(volume),
    surfaceArea: round(surfaceArea),
    flowRate: round(flowRate),
    turnoverHours: TURNOVER_HOURS,
    // Pools over ~186 m3 need multiple filters or a commercial design
    commercial: !filter || !pump,
    filter,
    pump,
    accessories: {
      skimmers: Math.max(1, Math.ceil(surfaceArea / 25)),
      mainDrains: 2, // two drains per pump suction to prevent entrapment
      returnInlets: Math.max(2, Math.ceil(surfaceArea / 20)),
      lights: Math.max(1, Math.ceil(surfaceArea / 20)),
      hoseLength,
    },
    chemicals: {
      startChlorineKg: round((volume * SDIC_G_PER_M3_PER_PPM * START_PPM) / 1000, 2),
      startPpm: START_PPM,
    },
  };
}
