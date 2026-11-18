/**
 * Distance-based routes: grade and target speed along the road.
 * Built-in profiles are representative of Portuguese roads (not surveyed elevation data);
 * import a GPX track for a real trip.
 */
export interface RouteSegment {
  lengthM: number;
  gradePct: number;
  speedKmh: number;
  /** Full stop at the end of the segment (traffic light, roundabout, junction). */
  stop?: number; // seconds standing
}

export interface Route {
  id: string;
  label: string;
  description: string;
  segments: RouteSegment[];
}

/** Precomputed lookup arrays (every 10 m). */
export interface RouteProfile {
  route: Route;
  lengthM: number;
  step: number;
  elevation: Float64Array;
  grade: Float64Array;
  speed: Float64Array; // km/h limit
  stops: { x: number; seconds: number }[];
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

function rolling(seed: number, km: number, speed: number, amp: number, wavelengthM: number): RouteSegment[] {
  const r = rng(seed);
  const segs: RouteSegment[] = [];
  let left = km * 1000;
  while (left > 0) {
    const len = Math.min(left, wavelengthM * (0.5 + r()));
    segs.push({ lengthM: len, gradePct: (r() * 2 - 1) * amp, speedKmh: speed });
    left -= len;
  }
  // Return to the starting elevation: remove the net climb.
  const total = segs.reduce((a, s) => a + s.lengthM, 0);
  const mean = segs.reduce((a, s) => a + s.lengthM * s.gradePct, 0) / total;
  for (const s of segs) s.gradePct -= mean;
  return segs;
}

function city(seed: number, km: number): RouteSegment[] {
  const r = rng(seed);
  const segs: RouteSegment[] = [];
  let left = km * 1000;
  while (left > 0) {
    const len = Math.min(left, 150 + r() * 450);
    const stop = r() < 0.55 ? 10 + r() * 35 : undefined;
    segs.push({ lengthM: len, gradePct: (r() * 2 - 1) * 6, speedKmh: r() < 0.3 ? 30 : 50, stop });
    left -= len;
  }
  return segs;
}

export const ROUTES: Route[] = [
  {
    id: 'a1',
    label: 'A1 motorway, rolling (60 km)',
    description: 'Lisbon–Porto style motorway at 120 km/h with long ±3 % undulations.',
    segments: rolling(11, 60, 120, 3, 2500),
  },
  {
    id: 'estrela-up',
    label: 'Covilhã → Torre climb (19 km)',
    description: 'Serra da Estrela N339: ≈ +1300 m at 6–8 %, bends at 40–60 km/h.',
    segments: [
      { lengthM: 1500, gradePct: 5, speedKmh: 50 },
      { lengthM: 3000, gradePct: 7, speedKmh: 60 },
      { lengthM: 2500, gradePct: 8, speedKmh: 45 },
      { lengthM: 3000, gradePct: 6.5, speedKmh: 60 },
      { lengthM: 2000, gradePct: 7.5, speedKmh: 40 },
      { lengthM: 3500, gradePct: 6, speedKmh: 60 },
      { lengthM: 2500, gradePct: 7, speedKmh: 50 },
      { lengthM: 1000, gradePct: 4, speedKmh: 40, stop: 10 },
    ],
  },
  {
    id: 'estrela-down',
    label: 'Torre → Covilhã descent (19 km)',
    description: 'The same road downhill: long fuel-cut stretches with engine braking.',
    segments: [
      { lengthM: 1000, gradePct: -4, speedKmh: 40 },
      { lengthM: 2500, gradePct: -7, speedKmh: 50 },
      { lengthM: 3500, gradePct: -6, speedKmh: 60 },
      { lengthM: 2000, gradePct: -7.5, speedKmh: 40 },
      { lengthM: 3000, gradePct: -6.5, speedKmh: 60 },
      { lengthM: 2500, gradePct: -8, speedKmh: 45 },
      { lengthM: 3000, gradePct: -7, speedKmh: 60 },
      { lengthM: 1500, gradePct: -5, speedKmh: 50, stop: 10 },
    ],
  },
  {
    id: 'lisbon',
    label: 'Lisbon city, hilly (8 km)',
    description: 'Stop-and-go at 30–50 km/h, lights every few hundred metres, ±6 % hills.',
    segments: city(5, 8),
  },
  {
    id: 'commute',
    label: 'Mixed commute (40 km)',
    description: '5 km city, 15 km IC road at 90 km/h, 20 km motorway at 120 km/h.',
    segments: [...city(9, 5), ...rolling(3, 15, 90, 2.5, 1500), ...rolling(4, 20, 120, 2, 2500)],
  },
];

export function buildProfile(route: Route, step = 10): RouteProfile {
  const total = route.segments.reduce((a, s) => a + s.lengthM, 0);
  const n = Math.ceil(total / step) + 1;
  const grade = new Float64Array(n);
  const speed = new Float64Array(n);
  const elevation = new Float64Array(n);
  const stops: { x: number; seconds: number }[] = [];
  let x0 = 0;
  for (const seg of route.segments) {
    const i0 = Math.floor(x0 / step);
    const i1 = Math.min(n - 1, Math.ceil((x0 + seg.lengthM) / step));
    for (let i = i0; i <= i1; i++) {
      grade[i] = seg.gradePct;
      speed[i] = seg.speedKmh;
    }
    x0 += seg.lengthM;
    if (seg.stop) stops.push({ x: x0, seconds: seg.stop });
  }
  // Smooth grade transitions over ~80 m (vertical curves).
  const w = Math.max(1, Math.round(40 / step));
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let c = 0;
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < n) { acc += grade[j]; c++; }
    sm[i] = acc / c;
  }
  for (let i = 1; i < n; i++) elevation[i] = elevation[i - 1] + (sm[i] / 100) * step;
  return { route, lengthM: total, step, elevation, grade: sm, speed, stops };
}

export function sampleProfile(p: RouteProfile, x: number, arr: Float64Array): number {
  const f = Math.max(0, Math.min(arr.length - 1.001, x / p.step));
  const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}

/** Parse a GPX track into a route (grade from elevation, speed from timestamps when present). */
export function routeFromGpx(xml: string, name: string, defaultSpeedKmh = 90): Route {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const pts = Array.from(doc.getElementsByTagName('trkpt')).concat(Array.from(doc.getElementsByTagName('rtept')));
  const data = pts
    .map((p) => ({
      lat: parseFloat(p.getAttribute('lat') ?? 'NaN'),
      lon: parseFloat(p.getAttribute('lon') ?? 'NaN'),
      ele: parseFloat(p.getElementsByTagName('ele')[0]?.textContent ?? 'NaN'),
      time: Date.parse(p.getElementsByTagName('time')[0]?.textContent ?? ''),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (data.length < 2) throw new Error('No track points found in GPX file');
  const hav = (a: (typeof data)[0], b: (typeof data)[0]) => {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };
  // Resample into ~100 m segments to tame GPS elevation noise.
  const segs: RouteSegment[] = [];
  let acc = 0;
  let start = data[0];
  let tStart = data[0].time;
  for (let i = 1; i < data.length; i++) {
    acc += hav(data[i - 1], data[i]);
    if (acc >= 100 || i === data.length - 1) {
      const end = data[i];
      const dz = Number.isFinite(end.ele) && Number.isFinite(start.ele) ? end.ele - start.ele : 0;
      const grade = Math.max(-15, Math.min(15, (dz / acc) * 100));
      let speed = defaultSpeedKmh;
      if (Number.isFinite(end.time) && Number.isFinite(tStart) && end.time > tStart) {
        speed = Math.max(10, Math.min(140, (acc / ((end.time - tStart) / 1000)) * 3.6));
      }
      segs.push({ lengthM: acc, gradePct: grade, speedKmh: Math.round(speed / 5) * 5 });
      acc = 0;
      start = end;
      tStart = end.time;
    }
  }
  return { id: `gpx-${name}`, label: `GPX: ${name}`, description: `${data.length} track points`, segments: segs };
}
