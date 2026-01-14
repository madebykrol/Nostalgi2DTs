export class GUIManager {
    
    private listeners: { [eventName: string]: Array<(...args: any[]) => void> } = {};

    public emit(eventName: string, ...args: any[]): void {
        this.listeners[eventName]?.forEach((listener) => {
            listener(...args);
        });
    }

    public on(eventName: string, listener: (...args: any[]) => void): void {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(listener);
    }

    public off(eventName: string, listener: (...args: any[]) => void): void {
        if (!this.listeners[eventName]) {
            return;
        }
        const index = this.listeners[eventName].indexOf(listener);
        if (index > -1) {
            this.listeners[eventName].splice(index, 1);
        }
    }

    public removeAllListeners(eventName?: string): void {
        if (eventName) {
            delete this.listeners[eventName];
        } else {
            this.listeners = {};
        }
    }
}