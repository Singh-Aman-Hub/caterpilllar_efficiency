import { useEffect, useRef } from "react";
import { GRID, MAX_H, SimState, MATERIAL_PARAMS } from "@/sim/engine";

interface Props {
  state: SimState;
  width?: number;
  height?: number;
  showFrontier: boolean;
  showTargets: boolean;
}

// Height -> color (blue -> teal -> yellow -> orange -> red)
function heightColor(h: number): [number, number, number] {
  if (h <= 0.05) return [12, 16, 22];
  const t = Math.min(1, h / MAX_H);
  // viridis-like ramp
  const stops: [number, [number, number, number]][] = [
    [0.0, [25, 35, 60]],
    [0.2, [40, 90, 120]],
    [0.45, [70, 160, 140]],
    [0.65, [200, 200, 80]],
    [0.85, [230, 140, 50]],
    [1.0, [220, 60, 50]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ];
    }
  }
  return [220, 60, 50];
}

export default function YardCanvas({
  state,
  width = 600,
  height = 600,
  showFrontier,
  showTargets,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);

  // build offscreen heightmap
  useEffect(() => {
    if (!offRef.current) {
      const oc = document.createElement("canvas");
      oc.width = GRID;
      oc.height = GRID;
      offRef.current = oc;
    }
    const oc = offRef.current!;
    const octx = oc.getContext("2d")!;
    const img = octx.createImageData(GRID, GRID);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        // flip y so top of canvas = top of yard (further = up looks nicer)
        const di = ((GRID - 1 - y) * GRID + x) * 4;
        const h = state.H[i];
        const [r, g, b] = heightColor(h);
        // shade with frontier
        let rr = r,
          gg = g,
          bb = b;
        if (showFrontier && state.frontier[i]) {
          rr = 255;
          gg = 255;
          bb = 255;
        }
        img.data[di] = rr;
        img.data[di + 1] = gg;
        img.data[di + 2] = bb;
        img.data[di + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);

    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(oc, 0, 0, width, height);

    // (no rigid column guides — placement is adaptive / density-based)

    const sx = (gx: number) => (gx / GRID) * width;
    const sy = (gy: number) => ((GRID - 1 - gy) / GRID) * height;

    // dump markers
    if (showTargets) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      for (const d of state.dumps) {
        ctx.beginPath();
        ctx.ellipse(
          sx(d.cx),
          sy(d.cy),
          (d.rx / GRID) * width,
          (d.ry / GRID) * height,
          d.angle ?? 0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }

    // trucks
    for (const t of state.trucks) {
      const px = sx(t.x);
      const py = sy(t.y);
      const mat = MATERIAL_PARAMS[t.material];
      // body
      ctx.fillStyle = "#facc15";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.5;
      ctx.fillRect(px - 12, py - 7, 24, 14);
      ctx.strokeRect(px - 12, py - 7, 24, 14);
      // load bin
      ctx.fillStyle = mat.color;
      ctx.fillRect(px - 10, py - 5, 14, 10);
      // cab
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(px + 4, py - 5, 6, 10);
      // state badge
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(px - 14, py - 20, 28, 10);
      ctx.fillStyle = "#fff";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`T${t.id}·${t.state[0].toUpperCase()}`, px, py - 12);

      // scanning rays
      if (t.state === "scanning") {
        ctx.strokeStyle = `rgba(34,197,94,${0.5 + 0.5 * Math.sin(performance.now() / 100)})`;
        ctx.lineWidth = 1;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 + performance.now() / 500;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(ang) * 40, py + Math.sin(ang) * 40);
          ctx.stroke();
        }
      }
      // dumping indicator
      if (t.state === "dumping") {
        ctx.fillStyle = "rgba(250, 204, 21, 0.4)";
        ctx.beginPath();
        ctx.arc(px, py + 10, 8 + Math.sin(performance.now() / 80) * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // target line
      if (t.state !== "idle" && t.state !== "leaving") {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.4)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx(t.targetX), sy(t.targetY));
        ctx.stroke();
        ctx.setLineDash([]);
        // target X
        ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
        const tx = sx(t.targetX),
          ty = sy(t.targetY);
        ctx.beginPath();
        ctx.moveTo(tx - 6, ty - 6);
        ctx.lineTo(tx + 6, ty + 6);
        ctx.moveTo(tx + 6, ty - 6);
        ctx.lineTo(tx - 6, ty + 6);
        ctx.stroke();
      }
    }

    // border
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  });

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block w-full h-auto rounded-md border border-border bg-[#0a0e14]"
    />
  );
}
