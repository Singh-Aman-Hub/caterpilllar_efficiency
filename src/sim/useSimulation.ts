import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyDump,
  computeStats,
  createState,
  decideDump,
  GRID,
  lidarScan,
  Material,
  SimState,
  Truck,
} from "./engine";

export interface SimConfig {
  material: Material;
  loadVolume: number;
  numTrucks: number;
  speed: number; // 0.25 .. 4
  gapDistance: number; // Factor for overlapping boundaries (1.0 = normal, <1 = overlap, >1 = gap)
  polygon: {x: number, y: number}[];
  entryPoint: {x: number, y: number};
}

const DEFAULT: SimConfig = {
  material: "coal",
  loadVolume: 80,
  numTrucks: 3,
  speed: 1,
  gapDistance: 1.0,
  polygon: [
    {x: 8 / 0.5, y: 8 / 0.5},
    {x: 92 / 0.5, y: 8 / 0.5},
    {x: 92 / 0.5, y: 92 / 0.5},
    {x: 8 / 0.5, y: 92 / 0.5}
  ],
  entryPoint: {x: -8, y: 100}
};

// We use entryPoint from state instead of hardcoded

function pickIdleTruck(trucks: Truck[]) {
  return trucks.find((t) => t.state === "idle");
}

export function useSimulation() {
  const [config, setConfig] = useState<SimConfig>(DEFAULT);
  const [running, setRunning] = useState(false);
  const stateRef = useRef<SimState>(
    createState(DEFAULT.numTrucks, DEFAULT.material, DEFAULT.loadVolume, DEFAULT.polygon, DEFAULT.entryPoint),
  );
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const reset = useCallback(
    (cfg?: Partial<SimConfig>) => {
      const next = { ...config, ...(cfg ?? {}) };
      setConfig(next);
      stateRef.current = createState(next.numTrucks, next.material, next.loadVolume, next.polygon, next.entryPoint);
      setRunning(false);
      rerender();
    },
    [config, rerender],
  );

  const updateConfig = useCallback(
    (patch: Partial<SimConfig>) => {
      setConfig((c) => {
        const next = { ...c, ...patch };
        // if structural change, reset
        if (
          (patch.numTrucks !== undefined && patch.numTrucks !== c.numTrucks) ||
          patch.polygon !== undefined ||
          patch.entryPoint !== undefined
        ) {
          stateRef.current = createState(next.numTrucks, next.material, next.loadVolume, next.polygon, next.entryPoint);
        } else {
          // update truck material/load on the fly
          stateRef.current.trucks.forEach((t) => {
            t.material = next.material;
            t.loadVolume = next.loadVolume;
          });
        }
        return next;
      });
      rerender();
    },
    [rerender],
  );

  // Single simulation step
  const step = useCallback(() => {
    const s = stateRef.current;
    s.tick++;

    for (const truck of s.trucks) {
      switch (truck.state) {
        case "idle": {
          // dispatch with small staggered chance
          if (Math.random() < 0.5) {
            const dec = decideDump(s, truck.material, truck.loadVolume, truck.id, config.gapDistance);
            truck.state = "approaching";
            truck.x = s.entryPoint.x;
            truck.y = s.entryPoint.y;
            truck.progress = 0;
            truck.plannedDump = dec;
            truck.targetX = dec.cx;
            truck.targetY = dec.cy;
            s.log.unshift({ t: s.tick, msg: dec.reason });
          }
          break;
        }
        case "approaching": {
          truck.progress += 0.04 * config.speed;
          truck.x = s.entryPoint.x + (truck.targetX - s.entryPoint.x) * truck.progress;
          truck.y = s.entryPoint.y + (truck.targetY - s.entryPoint.y) * truck.progress;
          if (truck.progress >= 1) {
            truck.state = "scanning";
            truck.progress = 0;
            s.log.unshift({
              t: s.tick,
              msg: `T${truck.id} arrived at column. Running LiDAR scan…`,
            });
          }
          break;
        }
        case "scanning": {
          truck.progress += 0.08 * config.speed;
          if (truck.progress >= 1) {
            lidarScan(s);
            truck.state = "dumping";
            truck.progress = 0;
            s.log.unshift({ t: s.tick, msg: `T${truck.id} scan complete. Dump plan locked.` });
          }
          break;
        }
        case "dumping": {
          truck.progress += 0.06 * config.speed;
          if (truck.progress >= 1) {
            const dec =
              truck.plannedDump ?? decideDump(s, truck.material, truck.loadVolume, truck.id, config.gapDistance);
            applyDump(s, dec.cx, dec.cy, dec.rx, dec.ry, dec.peak, dec.angle);
            s.dumps.push({
              id: s.dumps.length + 1,
              truckId: truck.id,
              cx: dec.cx,
              cy: dec.cy,
              rx: dec.rx,
              ry: dec.ry,
              angle: dec.angle,
              peak: dec.peak,
              material: truck.material,
              loadVolume: truck.loadVolume,
              timestamp: s.tick,
            });
            truck.totalDumps++;
            s.totalVolume += truck.loadVolume;
            lidarScan(s);
            s.log.unshift({
              t: s.tick,
              msg: `T${truck.id} dump #${s.dumps.length} placed (${truck.loadVolume}m³ ${truck.material}).`,
            });
            if (s.log.length > 60) s.log.length = 60;
            truck.state = "leaving";
            truck.progress = 0;
            truck.plannedDump = null;
          }
          break;
        }
        case "leaving": {
          truck.progress += 0.05 * config.speed;
          truck.x = truck.targetX + (s.entryPoint.x - truck.targetX) * truck.progress;
          truck.y = truck.targetY + (s.entryPoint.y - truck.targetY) * truck.progress;
          if (truck.progress >= 1) {
            truck.state = "idle";
            truck.x = s.entryPoint.x;
            truck.y = s.entryPoint.y;
            truck.progress = 0;
            truck.plannedDump = null;
          }
          break;
        }
      }
    }
  }, [config.speed, config.gapDistance]);

  // animation loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      // fixed step around 60ms scaled by speed
      if (dt >= 50) {
        step();
        last = now;
        rerender();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, step, rerender]);

  const stats = computeStats(stateRef.current);

  return {
    state: stateRef.current,
    config,
    running,
    setRunning,
    step: () => {
      step();
      rerender();
    },
    reset,
    updateConfig,
    stats,
    GRID,
  };
}
