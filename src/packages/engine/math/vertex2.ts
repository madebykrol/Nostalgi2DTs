import { property } from "../utils";

export class Vertex2 {
    @property()
    public x: number;
    @property()
    public y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
}