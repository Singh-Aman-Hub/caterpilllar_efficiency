import { MAX_H } from "@/sim/engine";

export default function HeightLegend() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>0 m</span>
      <div
        className="h-2 w-40 rounded-sm border border-border"
        style={{
          background:
            "linear-gradient(to right, rgb(25,35,60), rgb(40,90,120), rgb(70,160,140), rgb(200,200,80), rgb(230,140,50), rgb(220,60,50))",
        }}
      />
      <span>{MAX_H.toFixed(0)} m</span>
    </div>
  );
}
