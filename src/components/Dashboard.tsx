import { useState } from "react";
import { useSimulation } from "@/sim/useSimulation";
import { MATERIAL_PARAMS, Material } from "@/sim/engine";
import YardCanvas from "./YardCanvas";
import HeightLegend from "./HeightLegend";

const MATERIALS: Material[] = ["coal", "iron_ore", "limestone", "overburden"];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold text-foreground">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const sim = useSimulation();
  const [showFrontier, setShowFrontier] = useState(true);
  const [showTargets, setShowTargets] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--cat-yellow))] text-black font-black">
              ⛏
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Autonomous Truck Dumping Optimisation
              </h1>
              <p className="text-xs text-muted-foreground">
                LiDAR-guided columnar dump strategy · Caterpillar Hackathon Demo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="font-mono">SYSTEM ONLINE · tick {sim.state.tick}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[300px_1fr_340px]">
        {/* Left controls */}
        <aside className="space-y-4">
          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Simulation Control
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => sim.setRunning(!sim.running)}
                className="flex-1 rounded-md bg-[hsl(var(--cat-yellow))] px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110"
              >
                {sim.running ? "❚❚ Pause" : "▶ Run"}
              </button>
              <button
                onClick={sim.step}
                className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium transition hover:bg-secondary/80"
              >
                Step
              </button>
              <button
                onClick={() => sim.reset()}
                className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium transition hover:bg-destructive/30"
              >
                Reset
              </button>
            </div>
            <div className="mt-4">
              <label className="text-xs text-muted-foreground">Speed: {sim.config.speed.toFixed(2)}×</label>
              <input
                type="range" min={0.25} max={4} step={0.25}
                value={sim.config.speed}
                onChange={(e) => sim.updateConfig({ speed: parseFloat(e.target.value) })}
                className="mt-1 w-full accent-[hsl(var(--cat-yellow))]"
              />
            </div>
            <div className="mt-4">
              <label className="text-xs text-muted-foreground">
                Gap Distance (Overlap): {sim.config.gapDistance.toFixed(2)}x
              </label>
              <input
                type="range" min={0.5} max={1.5} step={0.05}
                value={sim.config.gapDistance}
                onChange={(e) => sim.updateConfig({ gapDistance: parseFloat(e.target.value) })}
                className="mt-1 w-full accent-[hsl(var(--cat-yellow))]"
              />
            </div>
          </section>

          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Material
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {MATERIALS.map((m) => {
                const p = MATERIAL_PARAMS[m];
                const active = sim.config.material === m;
                return (
                  <button
                    key={m}
                    onClick={() => sim.updateConfig({ material: m })}
                    className={`rounded-md border p-2 text-left text-xs transition ${
                      active
                        ? "border-[hsl(var(--cat-yellow))] bg-[hsl(var(--cat-yellow))]/10"
                        : "border-border bg-secondary/40 hover:border-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-border"
                        style={{ background: p.color }}
                      />
                      <span className="font-semibold">{p.label}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      k={p.k} · pf={p.peakFactor}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Load & Fleet
            </h2>
            <div>
              <label className="text-xs text-muted-foreground">
                Load Volume: <span className="font-mono">{sim.config.loadVolume} m³</span>
              </label>
              <input
                type="range" min={20} max={200} step={5}
                value={sim.config.loadVolume}
                onChange={(e) => sim.updateConfig({ loadVolume: parseInt(e.target.value) })}
                className="mt-1 w-full accent-[hsl(var(--cat-yellow))]"
              />
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted-foreground">
                Trucks: <span className="font-mono">{sim.config.numTrucks}</span>
              </label>
              <input
                type="range" min={1} max={6} step={1}
                value={sim.config.numTrucks}
                onChange={(e) => sim.updateConfig({ numTrucks: parseInt(e.target.value) })}
                className="mt-1 w-full accent-[hsl(var(--cat-yellow))]"
              />
            </div>
          </section>

          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Overlays
            </h2>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showFrontier} onChange={(e) => setShowFrontier(e.target.checked)} />
              Frontier (LiDAR edge)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showTargets} onChange={(e) => setShowTargets(e.target.checked)} />
              Past dump footprints
            </label>
          </section>
        </aside>

        {/* Center: yard */}
        <section className="rounded-md border border-border bg-card/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Dump Yard · 100 m × 100 m · LiDAR Heightmap</h2>
              <p className="text-xs text-muted-foreground">
                Trucks enter from the left, scan, and dump at the slope-critical saddle of the active column.
              </p>
            </div>
            <HeightLegend />
          </div>
          <YardCanvas
            state={sim.state}
            showFrontier={showFrontier}
            showTargets={showTargets}
            width={760}
            height={760}
          />
        </section>

        {/* Right: stats + log */}
        <aside className="space-y-4">
          <section className="grid grid-cols-2 gap-2">
            <StatCard label="Total Dumps" value={sim.stats.totalDumps.toString()} />
            <StatCard label="Yard Used" value={(sim.stats.utilisation * 100).toFixed(1) + "%"} />
            <StatCard label="Avg Height" value={sim.stats.avgHeight.toFixed(2) + " m"} />
            <StatCard label="Max Height" value={sim.stats.maxHeight.toFixed(2) + " m"} />
            <StatCard label="Avg Slope" value={sim.stats.avgSlope.toFixed(3)} sub="threshold 0.85" />
            <StatCard label="Packing" value={(sim.stats.packing * 100).toFixed(1) + "%"} />
            <StatCard label="Volume" value={sim.stats.volume.toFixed(0) + " m³"} />
            <StatCard label="Frontier" value={sim.stats.frontierCount.toString()} sub="cells" />
          </section>

          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Fleet Status
            </h2>
            <ul className="space-y-2">
              {sim.state.trucks.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded border border-border bg-secondary/40 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[hsl(var(--cat-yellow))]">T{t.id}</span>
                    <span className="capitalize text-muted-foreground">{t.state}</span>
                  </div>
                  <div className="font-mono text-muted-foreground">
                    {t.totalDumps} dumps · {t.loadVolume}m³
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-md border border-border bg-card/60 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Event Log
            </h2>
            <div className="max-h-72 overflow-y-auto">
              {sim.state.log.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events yet. Press Run to begin.</p>
              ) : (
                <ul className="space-y-1 font-mono text-[11px]">
                  {sim.state.log.map((e, i) => (
                    <li key={i} className="flex gap-2 border-b border-border/40 py-1">
                      <span className="shrink-0 text-muted-foreground">[{e.t.toString().padStart(5, "0")}]</span>
                      <span className="text-foreground/90">{e.msg}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        LiDAR scan ε ∈ ±6 cm · Slope threshold 0.85 · Gaussian pile model · Columnar fill (10 cols × 8 m)
      </footer>
    </div>
  );
}
