import { createContext, useContext, ReactNode, useSyncExternalStore } from "react";
import { GUIManager } from "./guiManager";
import { GUIComponentRegistry } from "./guiComponentRegistry";

export interface GUIContextValue {
    guiManager: GUIManager;
    componentRegistry: GUIComponentRegistry;
}

const GUIContext = createContext<GUIContextValue | null>(null);

export interface GUIProviderProps {
    guiManager: GUIManager;
    componentRegistry: GUIComponentRegistry;
    children: ReactNode;
}

/**
 * Provider component that makes GUIManager and GUIComponentRegistry
 * available to all child components
 * 
 * @example
 * ```tsx
 * const guiManager = new GUIManager();
 * const componentRegistry = new GUIComponentRegistry();
 * 
 * <GUIProvider guiManager={guiManager} componentRegistry={componentRegistry}>
 *   <YourGameUI />
 * </GUIProvider>
 * ```
 */
export function GUIProvider({ guiManager, componentRegistry, children }: GUIProviderProps) {
    return (
        <GUIContext.Provider value={{ guiManager, componentRegistry }}>
            {children}
        </GUIContext.Provider>
    );
}

/**
 * Hook to access the GUIManager instance
 * @throws Error if used outside of GUIProvider
 */
export function useGUIManager(): GUIManager {
    const context = useContext(GUIContext);
    if (!context) {
        throw new Error("useGUIManager must be used within a GUIProvider");
    }
    return context.guiManager;
}

/**
 * Hook to access the GUIComponentRegistry instance
 * @throws Error if used outside of GUIProvider
 */
export function useGUIComponentRegistry(): GUIComponentRegistry {
    const context = useContext(GUIContext);
    if (!context) {
        throw new Error("useGUIComponentRegistry must be used within a GUIProvider");
    }
    return context.componentRegistry;
}

/**
 * Hook to get all visible GUI components from the registry
 * Automatically updates when the registry changes
 */
export function useGUIComponents() {
    const registry = useGUIComponentRegistry();
    
    const subscribe = (callback: () => void) => {
        return registry.subscribe(callback);
    };

    const getSnapshot = () => {
        return registry.getVisible();
    };

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
