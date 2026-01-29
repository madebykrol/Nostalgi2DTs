import { Engine } from "@nostalgi2d/engine";
import {createContext} from "react";
export const EngineContext = createContext<Engine | null>(null);

// You can set a provider in your app to provide the engine instance to any component that needs it.
// Example:
// <EngineContext.Provider value={engineInstance}>
//   <YourAppComponents />
// </EngineContext.Provider>