export abstract class InputManager {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(listener);
    }

    emit(event: string, data: any): void {
        this.listeners.get(event)?.forEach(listener => listener(data));
    }
}
