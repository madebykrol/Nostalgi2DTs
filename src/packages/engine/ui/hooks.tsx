import { useEffect, useState, useCallback } from "react";
import { GUIManager } from "./guiManager";

/**
 * Hook to subscribe to GUI events from the engine
 * Automatically handles cleanup when component unmounts
 * 
 * @param guiManager - The GUIManager instance
 * @param eventName - The event name to listen for
 * @param handler - The callback function to handle the event
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const guiManager = useGUIManager();
 *   
 *   useGUIEvent(guiManager, 'player:health', (health: number) => {
 *     console.log('Player health:', health);
 *   });
 *   
 *   return <div>...</div>;
 * };
 * ```
 */
export function useGUIEvent<T extends any[]>(
    guiManager: GUIManager | null,
    eventName: string,
    handler: (...args: T) => void
): void {
    useEffect(() => {
        if (!guiManager) return;

        guiManager.on(eventName, handler);

        return () => {
            guiManager.off(eventName, handler);
        };
    }, [guiManager, eventName, handler]);
}

/**
 * Hook to subscribe to GUI events and store the latest value in state
 * 
 * @param guiManager - The GUIManager instance
 * @param eventName - The event name to listen for
 * @param initialValue - The initial value for the state
 * @returns The current state value
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const guiManager = useGUIManager();
 *   const playerHealth = useGUIState(guiManager, 'player:health', 100);
 *   
 *   return <div>Health: {playerHealth}</div>;
 * };
 * ```
 */
export function useGUIState<T>(
    guiManager: GUIManager | null,
    eventName: string,
    initialValue: T
): T {
    const [state, setState] = useState<T>(initialValue);

    useEffect(() => {
        if (!guiManager) return;

        const handler = (value: T) => {
            setState(value);
        };

        guiManager.on(eventName, handler);

        return () => {
            guiManager.off(eventName, handler);
        };
    }, [guiManager, eventName]);

    return state;
}

/**
 * Hook to create an emitter function that can send events to the engine
 * 
 * @param guiManager - The GUIManager instance
 * @param eventName - The event name to emit
 * @returns A function to emit the event
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const guiManager = useGUIManager();
 *   const emitAttack = useGUIEmitter(guiManager, 'ui:attack');
 *   
 *   return <button onClick={() => emitAttack('sword')}>Attack</button>;
 * };
 * ```
 */
export function useGUIEmitter<T extends any[]>(
    guiManager: GUIManager | null,
    eventName: string
): (...args: T) => void {
    return useCallback(
        (...args: T) => {
            guiManager?.emit(eventName, ...args);
        },
        [guiManager, eventName]
    );
}
