import { useRef } from "react";
import { EngineBuilder, type Container, Engine, TimerManager } from "@repo/engine";

// Synchronous, one-time engine + container initialization. Avoids a null window between render phases.
export const useEngineInitialization = <TSocket, TReq>(factory: (builder: EngineBuilder<TSocket, TReq>) => Engine<TSocket, TReq>) => {
  const initialized = useRef<{ engine: Engine<TSocket, TReq>; container: Container } | null>(null);

  if (!initialized.current) {
    const builder = new EngineBuilder<TSocket, TReq>();
    builder.withTimerManager(TimerManager);
    const engineInstance = factory(builder);
    initialized.current = { engine: engineInstance, container: builder.container };
  }

  return initialized.current;
};
