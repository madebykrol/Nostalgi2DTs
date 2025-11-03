export class Timer {
    constructor(public callback: () => void, public nextTick: number, public delay: number, public repeat: boolean = false) { }
}