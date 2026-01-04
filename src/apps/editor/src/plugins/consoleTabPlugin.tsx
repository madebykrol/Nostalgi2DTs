import { useEffect, useRef } from "react";
import { theme } from "../theme";
import type { EditorUIPlugin } from "@repo/engine";
import { useConsole } from "../contexts/ConsoleContext";

export type ConsoleEntryType = "log" | "warn" | "error";

export type ConsoleEntry = {
  id: number;
  type: ConsoleEntryType;
  message: string;
  timestamp: string;
};

const severityStyles: Record<ConsoleEntryType, { label: string; color: string }> = {
  log: { label: "Log", color: "#8bd3ff" },
  warn: { label: "Warn", color: "#facc15" },
  error: { label: "Error", color: "#f87171" },
};

type ConsoleTabProps = {
  logs: ConsoleEntry[];
  onClear: () => void;
  autoScrollEnabled: boolean;
  onToggleAutoScroll: () => void;
};

export const ConsoleTab = ({ logs, onClear, autoScrollEnabled, onToggleAutoScroll }: ConsoleTabProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScrollEnabled) {
      return;
    }
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [logs, autoScrollEnabled]);

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          borderColor: "rgba(8, 247, 254, 0.2)",
          color: theme.text,
        }}
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide" style={{ color: theme.text }}>
            <input
              type="checkbox"
              checked={autoScrollEnabled}
              onChange={onToggleAutoScroll}
              className="h-3 w-3 accent-cyan-400"
            />
            Auto-scroll
          </label>
          <button
            onClick={onClear}
            className="px-2 py-1 text-[10px] uppercase tracking-wide rounded border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-400/10 transition-colors"
            style={{ color: theme.text }}
          >
            Clear
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-xs font-mono"
        style={{ color: theme.text }}
      >
        {logs.length === 0 ? (
          <div className="opacity-60">Console output will appear here.</div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide">
                <span style={{ color: severityStyles[entry.type].color }}>
                  {severityStyles[entry.type].label}
                </span>
                <span className="opacity-60">{entry.timestamp}</span>
              </div>
              <pre
                className="whitespace-pre-wrap leading-relaxed text-xs"
                style={{ color: theme.text }}
              >
                {entry.message}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ConsolePanel = () => {
  const { logs, clearLogs, autoScrollEnabled, toggleAutoScroll } = useConsole();
  return (
    <ConsoleTab
      logs={logs}
      onClear={clearLogs}
      autoScrollEnabled={autoScrollEnabled}
      onToggleAutoScroll={toggleAutoScroll}
    />
  );
};

// Plugin Definition
const consoleTabPlugin: EditorUIPlugin = {
  id: "console-tab",
  activate(context) {
    context.panels.register({
      id: "console",
      title: "Console",
      location: "bottom",
      order: 10000,
      render: () => <ConsolePanel />,
    });
  },
};

export default consoleTabPlugin;
