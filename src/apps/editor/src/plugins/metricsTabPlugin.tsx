import { useEffect, useState, useRef } from "react";
import { theme } from "../theme";
import type { ClientEngine } from "@repo/client";

// Extend Performance type to include memory (Chrome-specific)
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

type MetricsTabProps = {
  engine: ClientEngine | null;
};

export const MetricsTab = ({ engine }: MetricsTabProps) => {
  const [fps, setFps] = useState(0);
  const [actorCount, setActorCount] = useState(0);
  const [deltaTime, setDeltaTime] = useState(0);
  const [memoryUsed, setMemoryUsed] = useState(0);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [cpuTime, setCpuTime] = useState(0);
  const lastFrameTimeRef = useRef(performance.now());

  useEffect(() => {
    if (!engine) {
      return;
    }

    const intervalId = setInterval(() => {
      setFps(engine.getFPS());
      setActorCount(engine.getActorsCount());
      // getDeltaTime may not be exposed; we can calculate from FPS
      setDeltaTime(engine.getFPS() > 0 ? 1 / engine.getFPS() : 0);

      // Memory metrics (if available - Chrome only)
      const perf = performance as PerformanceWithMemory;
      if (perf.memory) {
        setMemoryUsed(perf.memory.usedJSHeapSize / 1024 / 1024); // Convert to MB
        setMemoryTotal(perf.memory.totalJSHeapSize / 1024 / 1024); // Convert to MB
      }

      // CPU time approximation based on frame duration
      const now = performance.now();
      const frameTime = now - lastFrameTimeRef.current;
      setCpuTime(frameTime);
      lastFrameTimeRef.current = now;
    }, 100); // Update metrics 10 times per second

    return () => clearInterval(intervalId);
  }, [engine]);

  if (!engine) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: theme.text }}>
        <div className="opacity-60 text-sm">Engine not initialized</div>
      </div>
    );
  }

  const performanceMetrics = [
    { label: "FPS", value: fps.toFixed(1), unit: "" },
    { label: "Frame Time", value: fps > 0 ? (1000 / fps).toFixed(2) : "0.00", unit: "ms" },
    { label: "Delta Time", value: (deltaTime * 1000).toFixed(2), unit: "ms" },
    { label: "CPU Time", value: cpuTime.toFixed(2), unit: "ms" },
  ];

  const resourceMetrics = [
    { label: "Actors", value: actorCount.toString(), unit: "" },
    { label: "Memory Used", value: memoryUsed.toFixed(1), unit: "MB" },
    { label: "Memory Total", value: memoryTotal.toFixed(1), unit: "MB" },
    { label: "Memory %", value: memoryTotal > 0 ? ((memoryUsed / memoryTotal) * 100).toFixed(1) : "0", unit: "%" },
  ];

  return (
    <div className="h-full flex flex-col px-4 py-3 overflow-y-auto">
      {/* Performance Metrics */}
      <div className="mb-4">
        <h3 className="text-[10px] uppercase tracking-wider opacity-60 mb-2" style={{ color: theme.text }}>
          Performance
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {performanceMetrics.map((metric) => (
            <div
              key={metric.label}
              className="p-3 rounded-lg border"
              style={{
                backgroundColor: "rgba(8, 247, 254, 0.05)",
                borderColor: "rgba(8, 247, 254, 0.2)",
              }}
            >
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1" style={{ color: theme.text }}>
                {metric.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ color: theme.neon.cyan }}>
                  {metric.value}
                </span>
                {metric.unit && (
                  <span className="text-xs opacity-60" style={{ color: theme.text }}>
                    {metric.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resource Metrics */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider opacity-60 mb-2" style={{ color: theme.text }}>
          Resources
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {resourceMetrics.map((metric) => (
            <div
              key={metric.label}
              className="p-3 rounded-lg border"
              style={{
                backgroundColor: "rgba(8, 247, 254, 0.05)",
                borderColor: "rgba(8, 247, 254, 0.2)",
              }}
            >
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1" style={{ color: theme.text }}>
                {metric.label}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ color: theme.neon.cyan }}>
                  {metric.value}
                </span>
                {metric.unit && (
                  <span className="text-xs opacity-60" style={{ color: theme.text }}>
                    {metric.unit}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
