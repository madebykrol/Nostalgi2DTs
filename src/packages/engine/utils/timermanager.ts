import { Timer } from "./timer";

export class TimerHandle {
    constructor(public id: number = 0) { }
    hasBeenCanceled: boolean = false;
};

export class TimerManager {
    protected timers: Map<TimerHandle, Timer> = new Map();

    setTimer(callback: () => void, delay: number, repeat: boolean = false): TimerHandle {
        const handle = new TimerHandle(this.timers.size + 1);
        const now = Date.now();
        this.timers.set(handle, new Timer(callback, now+delay, delay, repeat));
        return handle;
    }

    clearTimer(handle: TimerHandle): void {
        this.timers.delete(handle);
        handle.hasBeenCanceled = true;
    }

    tick(): void {
        const now = Date.now();

        var keys = Array.from(this.timers.keys());
        keys.forEach((handle: TimerHandle) => {
            if (handle.hasBeenCanceled) {
                this.timers.delete(handle);
            }
        });

        this.timers.forEach((timer, handle) => {
            if (now >= timer.nextTick && !handle.hasBeenCanceled) {
                timer.callback();
                if (timer.repeat) {
                    timer.nextTick = now + timer.delay;
                } else {
                    this.clearTimer(handle);
                }
            }
        });
    }
}