
export abstract class Mesh {
    public vertices: Float32Array = new Float32Array();
    public indices: Uint16Array = new Uint16Array();
    public uvs: Float32Array = new Float32Array();
    

    constructor() {
    }

    abstract rotate(angle: number): void;
    abstract scale(sx: number, sy: number): void;
    abstract translate(tx: number, ty: number): void;
    abstract clone(): Mesh;
    abstract getVertexCount(): number;
}
