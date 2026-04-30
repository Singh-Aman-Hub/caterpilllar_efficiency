import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Autonomous Truck Dumping Optimisation · Caterpillar Demo" },
      {
        name: "description",
        content:
          "Interactive LiDAR-guided autonomous truck dumping simulation for mine sites. Columnar dump strategy with slope-critical saddle detection.",
      },
    ],
  }),
});
