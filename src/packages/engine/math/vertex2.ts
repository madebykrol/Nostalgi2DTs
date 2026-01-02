import { nobject } from "..";
import { property, unmanaged } from "../utils";

@nobject()
export class Vertex2 {
    @property()
    public x: number;
    @property()
    public y: number;
    constructor(@unmanaged() x: number, @unmanaged() y: number) {
        this.x = x;
        this.y = y;
    }

}