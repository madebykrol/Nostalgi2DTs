import { createContext, useContext } from "react";
import type { ClientEngine } from "@repo/client";

export type EngineContextValue = {
  engine: ClientEngine | null;
};

export const EditorEngineContext = createContext<EngineContextValue | null>(null);

export const useEditorEngine = () => {
  const context = useContext(EditorEngineContext);
  if (!context) {
    throw new Error("useEditorEngine must be used within EditorEngineContext.Provider");
  }
  return context;
};
