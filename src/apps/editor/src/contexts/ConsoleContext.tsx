import { createContext, useContext } from "react";
import type { ConsoleEntry } from "../plugins/consoleTabPlugin";

export type ConsoleContextValue = {
  logs: ConsoleEntry[];
  clearLogs: () => void;
  autoScrollEnabled: boolean;
  toggleAutoScroll: () => void;
};

export const ConsoleContext = createContext<ConsoleContextValue | null>(null);

export const useConsole = () => {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error("useConsole must be used within ConsoleContext.Provider");
  }
  return context;
};
