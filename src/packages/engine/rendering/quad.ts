import { Mesh } from "./Mesh";


export class Quad extends Mesh {

    /**
     *
     */
    constructor() {
        super();
        this.vertices = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);
        this.indices = new Uint16Array([
            0, 1, 2,
            1, 3, 2,
        ]);
        this.uvs = new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1,
        ]);
    }
    rotate(angle: number): void {

        // Rotate the quad around its center
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < this.vertices.length; i += 2) {
            const x = this.vertices[i];
            const y = this.vertices[i + 1];
            this.vertices[i] = x * cos - y * sin;
            this.vertices[i + 1] = x * sin + y * cos;
        }

    }
    scale(_sx: number, _sy: number): void {
        throw new Error("Method not implemented.");
    }
    translate(_tx: number, _ty: number): void {
        throw new Error("Method not implemented.");
    }
    clone(): Mesh {
        throw new Error("Method not implemented.");
    }
    getVertexCount(): number {
        return this.vertices.length / 2;
    }

}
