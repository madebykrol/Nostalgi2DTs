import { useEffect, useRef, useState } from "react";
import type { ConsoleEntry, ConsoleEntryType } from "../plugins/consoleTabPlugin";
import { formatConsoleArg } from "../utils/consoleFormatter";

export const useConsoleCapture = () => {
  const [logs, setLogs] = useState<ConsoleEntry[]>([]);
  const logIdRef = useRef(0);

  useEffect(() => {
    type ConsoleMethods = {
      log: typeof console.log;
      warn: typeof console.warn;
      error: typeof console.error;
    };

    const originals: ConsoleMethods = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };

    const append = (type: ConsoleEntryType, args: unknown[]) => {
      const serialized = args.map(formatConsoleArg).join(" ");
      const entry: ConsoleEntry = {
        id: ++logIdRef.current,
        type,
        message: serialized.trim().length > 0 ? serialized : "(no output)",
        timestamp: new Date().toLocaleTimeString(),
      };

      setLogs((previous) => {
        const next = [...previous, entry];
        const maxEntries = 300;
        return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
      });
    };

    console.log = (...args: unknown[]) => {
      originals.log.apply(console, args as unknown[]);
      append("log", args);
    };

    console.warn = (...args: unknown[]) => {
      originals.warn.apply(console, args as unknown[]);
      append("warn", args);
    };

    console.error = (...args: unknown[]) => {
      originals.error.apply(console, args as unknown[]);
      append("error", args);
    };

    return () => {
      console.log = originals.log;
      console.warn = originals.warn;
      console.error = originals.error;
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
};
