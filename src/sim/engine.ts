// Autonomous Truck Dumping Simulation Engine
// Grid: 200x200 cells, 0.5m each = 100m x 100m yard.

export const GRID = 200;
export const CELL = 0.5; // metres
export const OCC_SCALE = 2;
export const OCC_GRID = GRID * OCC_SCALE;
export const OCC_CELL = CELL / OCC_SCALE;
export const MAX_H = 10.0;
export const SLOPE_THRESH = 0.85;
export const LIDAR_NOISE = 0.06;

export type Material = "coal" | "iron_ore" | "limestone" | "overburden";

export const MATERIAL_PARAMS: Record<
  Material,
  { k: number; matFactor: number; peakFactor: number; color: string; label: string }
> = {
  coal: { k: 1.8, matFactor: 1.2, peakFactor: 1.0, color: "#2a2a2a", label: "Coal" },
  iron_ore: { k: 1.4, matFactor: 0.9, peakFactor: 1.3, color: "#8a3a1a", label: "Iron Ore" },
  limestone: { k: 1.6, matFactor: 1.0, peakFactor: 1.1, color: "#c9b899", label: "Limestone" },
  overburden: { k: 2.0, matFactor: 1.3, peakFactor: 0.9, color: "#5a4a3a", label: "Overburden" },
};

export interface DumpRecord {
  id: number;
  truckId: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  peak: number;
  material: Material;
  loadVolume: number;
  timestamp: number;
}

export interface Truck {
  id: number;
  state: "idle" | "approaching" | "scanning" | "dumping" | "leaving";
  // position in grid coords
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number; // 0..1 for current state animation
  loadVolume: number;
  material: Material;
  totalDumps: number;
  plannedDump: DumpDecision | null;
}

export interface SimState {
  H: Float32Array; // true heights, length GRID*GRID
  Hmeas: Float32Array; // last LiDAR-measured heights
  occupancy: Float32Array;
  frontier: Uint8Array; // 1 if frontier cell
  dumps: DumpRecord[];
  trucks: Truck[];
  tick: number;
  totalVolume: number;
  log: { t: number; msg: string }[];
  polygon: {x: number, y: number}[];
  entryPoint: {x: number, y: number};
}

export function pointInPolygon(point: {x: number, y: number}, vs: {x: number, y: number}[]) {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export const idx = (x: number, y: number) => y * GRID + x;
export const occIdx = (x: number, y: number) => y * OCC_GRID + x;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function jitter(value: number, spread: number, min?: number, max?: number) {
  const next = value * (1 + randRange(-spread, spread));
  if (min === undefined || max === undefined) {
    return next;
  }
  return clamp(next, min, max);
}

export function createState(
  numTrucks: number, 
  material: Material, 
  loadVolume: number,
  polygon: {x: number, y: number}[],
  entryPoint: {x: number, y: number}
): SimState {
  const H = new Float32Array(GRID * GRID);
  const Hmeas = new Float32Array(GRID * GRID);
  const occupancy = new Float32Array(OCC_GRID * OCC_GRID);
  const frontier = new Uint8Array(GRID * GRID);
  const trucks: Truck[] = [];
  for (let i = 0; i < numTrucks; i++) {
    trucks.push({
      id: i + 1,
      state: "idle",
      x: -10,
      y: 20 + i * 25,
      targetX: 0,
      targetY: 0,
      progress: 0,
      loadVolume,
      material,
      totalDumps: 0,
      plannedDump: null,
    });
  }
  return { H, Hmeas, occupancy, frontier, dumps: [], trucks, tick: 0, totalVolume: 0, log: [], polygon, entryPoint };
}

export function lidarScan(state: SimState) {
  for (let i = 0; i < state.H.length; i++) {
    state.Hmeas[i] = state.H[i] + (Math.random() * 2 - 1) * LIDAR_NOISE;
  }
  computeFrontier(state);
}

export function computeFrontier(state: SimState) {
  const { Hmeas, frontier } = state;
  frontier.fill(0);
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const i = idx(x, y);
      if (Hmeas[i] <= 0.05) continue;
      if (
        Hmeas[idx(x + 1, y)] <= 0.05 ||
        Hmeas[idx(x - 1, y)] <= 0.05 ||
        Hmeas[idx(x, y + 1)] <= 0.05 ||
        Hmeas[idx(x, y - 1)] <= 0.05
      ) {
        frontier[i] = 1;
      }
    }
  }
}

export function slopeAt(state: SimState, x: number, y: number): number {
  if (x <= 0 || x >= GRID - 1 || y <= 0 || y >= GRID - 1) return 0;
  const H = state.Hmeas;
  const dx = (H[idx(x + 1, y)] - H[idx(x - 1, y)]) / (2 * CELL);
  const dy = (H[idx(x, y + 1)] - H[idx(x, y - 1)]) / (2 * CELL);
  return Math.sqrt(dx * dx + dy * dy);
}

export function pileParams(material: Material, loadVolume: number) {
  const p = MATERIAL_PARAMS[material];
  const cube = Math.cbrt(loadVolume);
  // Smaller, tighter elliptical dumps for crisscross packing.
  const rxMetres = p.k * cube * p.matFactor * 0.55;
  const peak = Math.min(MAX_H, p.peakFactor * cube * 1.25);
  const rx = rxMetres / CELL;
  const ry = rx * 0.72;
  return { rx, ry, peak };
}

function markOccupancy(
  state: SimState,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const occRx = Math.max(1, rx * OCC_SCALE * 1.25);
  const occRy = Math.max(1, ry * OCC_SCALE * 1.25);
  const cxOcc = cx * OCC_SCALE;
  const cyOcc = cy * OCC_SCALE;
  const x0 = Math.max(0, Math.floor(cxOcc - occRx));
  const x1 = Math.min(OCC_GRID - 1, Math.ceil(cxOcc + occRx));
  const y0 = Math.max(0, Math.floor(cyOcc - occRy));
  const y1 = Math.min(OCC_GRID - 1, Math.ceil(cyOcc + occRy));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const localX = (x + 0.5 - cxOcc) / occRx;
      const localY = (y + 0.5 - cyOcc) / occRy;
      const rotX = localX * cos + localY * sin;
      const rotY = -localX * sin + localY * cos;
      const radius = Math.sqrt(rotX * rotX + rotY * rotY);
      if (radius > 1.15) continue;
      const coverage = clamp(1 - radius / 1.15, 0, 1);
      const i = occIdx(x, y);
      if (coverage > state.occupancy[i]) state.occupancy[i] = coverage;
    }
  }
}

export function applyDump(
  state: SimState,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  peak: number,
  angle = 0,
) {
  const r = Math.ceil(Math.max(rx, ry) * 3);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(GRID - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(GRID - 1, Math.ceil(cy + r));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const rotX = (dx * cos + dy * sin) / rx;
      const rotY = (-dx * sin + dy * cos) / ry;
      const add = peak * Math.exp(-(rotX * rotX + rotY * rotY));
      const i = idx(x, y);
      state.H[i] = Math.min(MAX_H, state.H[i] + add);
    }
  }
  markOccupancy(state, cx, cy, rx, ry, angle);
}

// ── DECISION: where should the truck dump? ────────────────────────────────
// Column-wise packing: dumps are placed in vertical columns starting from the
// extreme right side, then moving left column by column. Each slot holds one
// ellipse only, and the occupancy map is used to skip already-taken space.
export interface DumpDecision {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  peak: number;
  reason: string;
}

const YARD_LEFT_M = 8;
const YARD_RIGHT_M = 92;
const YARD_TOP_M = 8;
const YARD_BOTTOM_M = 92;

export function decideDump(
  state: SimState,
  material: Material,
  loadVolume: number,
  truckId: number,
  gapDistance: number = 1.0,
): DumpDecision {
  const base = pileParams(material, loadVolume);
  const angle = -Math.PI / 3;

  const xs = state.polygon.map(p => p.x);
  const ys = state.polygon.map(p => p.y);
  const left = Math.min(...xs) + base.rx + 2;
  const right = Math.max(...xs) - base.rx - 2;
  const top = Math.min(...ys) + base.ry + 2;
  const bottom = Math.max(...ys) - base.ry - 2;
  const slotIndex = nextColumnSlotIndex(state);
  const slots = buildColumnSlots(left, right, top, bottom, base.rx, base.ry, gapDistance, state.polygon, state.entryPoint);
  const chosen = chooseColumnSlot(state, slots, slotIndex);

  // Apply jitter to the actual placed pile dimensions with a larger fraction (up to 20%) for noticeable non-identical dumps
  const rx = jitter(base.rx, 0.20, base.rx * 0.8, base.rx * 1.25);
  const ry = jitter(base.ry, 0.20, base.ry * 0.8, base.ry * 1.25);
  const peak = jitter(base.peak, 0.15, base.peak * 0.85, base.peak * 1.20);

  const reason = `T${truckId}: column ${chosen.column + 1} row ${chosen.row + 1} @ (${(chosen.cx * CELL).toFixed(1)}m, ${(chosen.cy * CELL).toFixed(1)}m)`;
  return { cx: chosen.cx, cy: chosen.cy, rx, ry, angle, peak, reason };
}

function nextColumnSlotIndex(state: SimState) {
  const reserved = state.trucks.reduce((count, truck) => count + (truck.plannedDump ? 1 : 0), 0);
  return state.dumps.length + reserved;
}

type ColumnSlot = { cx: number; cy: number; column: number; row: number };

function buildColumnSlots(
  left: number,
  right: number,
  top: number,
  bottom: number,
  rx: number,
  ry: number,
  gapDistance: number,
  polygon: {x: number, y: number}[],
  entryPoint: {x: number, y: number}
) {
  const slots: ColumnSlot[] = [];
  const xStep = Math.max(rx * 1.15 * gapDistance, 5.0);
  const yStep = Math.max(ry * 1.4 * gapDistance, 4.0);
  const midY = (top + bottom) / 2;

  let column = 0;
  for (let baseCx = right; baseCx >= left; baseCx -= xStep, column++) {
    let row = 0;
    for (let cy = top; cy <= bottom + yStep; cy += yStep, row++) {
      let actualCy = cy;
      if (column % 2 === 1) {
        actualCy += yStep / 2;
      }
      if (actualCy > bottom) continue;

      const dy = actualCy - midY;
      const curveShift = 0.0035 * dy * dy;
      const cx = baseCx - curveShift;

      if (cx >= left && cx <= right) {
        if (pointInPolygon({x: cx, y: actualCy}, polygon)) {
          slots.push({ cx, cy: actualCy, column, row });
        }
      }
    }
  }

  const dxLeft = Math.abs(left - entryPoint.x);
  const dxRight = Math.abs(right - entryPoint.x);
  const startFromRight = dxRight >= dxLeft;

  const dyTop = Math.abs(top - entryPoint.y);
  const dyBottom = Math.abs(bottom - entryPoint.y);
  const startFromBottom = dyBottom >= dyTop;

  slots.sort((a, b) => {
    if (a.column !== b.column) {
      return startFromRight ? a.column - b.column : b.column - a.column;
    }
    return startFromBottom ? b.cy - a.cy : a.cy - b.cy;
  });

  return slots;
}

function chooseColumnSlot(state: SimState, slots: ColumnSlot[], startIndex: number) {
  if (slots.length === 0) {
    return {
      cx: rightFallback(state),
      cy: topFallback(state),
      column: 0,
      row: 0,
    };
  }
  // Strictly assign exactly one dump per slot to avoid repetitive overlapping
  return slots[startIndex % slots.length];
}

function isSlotAvailable(state: SimState, cx: number, cy: number) {
  const ix = clamp(Math.round(cx), 0, GRID - 1);
  const iy = clamp(Math.round(cy), 0, GRID - 1);
  if (state.Hmeas[idx(ix, iy)] > MAX_H * 0.7) return false;

  const occX = clamp(Math.round(cx * OCC_SCALE), 0, OCC_GRID - 1);
  const occY = clamp(Math.round(cy * OCC_SCALE), 0, OCC_GRID - 1);
  return state.occupancy[occIdx(occX, occY)] < 0.95;
}

function rightFallback(state: SimState) {
  return Math.max(0, GRID - 1 - (state.dumps.length % GRID));
}

function topFallback(state: SimState) {
  return Math.min(GRID - 1, 10 + (state.dumps.length % 12) * 4);
}

// ── stats ─────────────────────────────────────────────────────────────────
export function computeStats(state: SimState) {
  let occupied = 0;
  let sumH = 0;
  let maxH = 0;
  let sumSlope = 0;
  let frontierCount = 0;
  for (let i = 0; i < state.H.length; i++) {
    if (state.H[i] > 0.1) {
      occupied++;
      sumH += state.H[i];
    }
    if (state.H[i] > maxH) maxH = state.H[i];
    if (state.frontier[i]) frontierCount++;
  }
  let occupancyCells = 0;
  for (let i = 0; i < state.occupancy.length; i++) {
    if (state.occupancy[i] > 0.2) occupancyCells++;
  }
  // sample slopes
  let samples = 0;
  for (let y = 2; y < GRID - 2; y += 4) {
    for (let x = 2; x < GRID - 2; x += 4) {
      if (state.H[idx(x, y)] > 0.1) {
        sumSlope += slopeAt(state, x, y);
        samples++;
      }
    }
  }
  const avgSlope = samples > 0 ? sumSlope / samples : 0;
  const yardArea = state.occupancy.length;
  const utilisation = occupancyCells / yardArea;
  // packing density: actual volume vs ideal volume (occupied area * maxH)
  const volume = sumH * CELL * CELL;
  const idealVolume = occupied * MAX_H * CELL * CELL;
  const packing = idealVolume > 0 ? volume / idealVolume : 0;
  return {
    occupied,
    occupancyCells,
    utilisation,
    avgHeight: occupied > 0 ? sumH / occupied : 0,
    maxHeight: maxH,
    avgSlope,
    frontierCount,
    volume,
    packing,
    totalDumps: state.dumps.length,
  };
}
