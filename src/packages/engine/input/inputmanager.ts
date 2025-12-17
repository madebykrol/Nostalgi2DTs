export abstract class InputManager {
    private listeners: Map<string, Set<Function>> = new Map();

    initialize(): void {
        // Optional lifecycle hook for subclasses to register browser/host handlers.
    }

    dispose(): void {
        // Optional lifecycle hook for subclasses to unregister handlers.
        this.removeAllListeners();
    }

    on(event: string, listener: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(listener);
    }

    off(event: string, listener: Function): void {
        this.listeners.get(event)?.delete(listener);
    }

    emit(event: string, data: unknown, modifiers: unknown): void {
        this.listeners.get(event)?.forEach((listener) => listener(data, modifiers));
    }

    removeAllListeners(): void {
        this.listeners.clear();
    }

    protected generateEvent(
        event: string,
        trigger: "up" | "down" | "hold" | "tap" | "move",
        modifiers: { ctrl: boolean; shift: boolean; alt: boolean }
    ): string {
        return `${event.toLocaleLowerCase()}:${trigger.toLocaleLowerCase()}${modifiers.ctrl ? ":ctrl" : ""}${modifiers.shift ? ":shift" : ""}${modifiers.alt ? ":alt" : ""}`;
    }
}