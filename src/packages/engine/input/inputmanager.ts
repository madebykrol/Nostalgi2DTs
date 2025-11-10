export abstract class InputManager {
    private listeners: Map<string, Function[]> = new Map();

    on(event: string, listener: Function): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(listener);
    }

    emit(event: string, data: any, modifiers: any): void {
        this.listeners.get(event)?.forEach(listener => listener(data, modifiers));
    }

    protected generateEvent(event: string, trigger: 'up'|'down'|'hold'|'tap'|'move', modifiers: {ctrl: boolean, shift: boolean, alt: boolean}): string {
        const eventString = `${event.toLocaleLowerCase()}:${trigger.toLocaleLowerCase()}${modifiers.ctrl ? ":ctrl" : ""}${modifiers.shift ? ":shift" : ""}${modifiers.alt ? ":alt" : ""}`;
        console.log(eventString);
        return eventString;
    }
}