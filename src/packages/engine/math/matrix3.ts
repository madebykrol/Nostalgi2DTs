import { Vector2 } from "./vector2";

export class Matrix3 {
    elements: Float32Array;
    constructor() {
        this.elements = new Float32Array(9);
        this.identity();
    }

    identity(): Matrix3 {
        const e = this.elements;
        e[0] = 1; e[3] = 0; e[6] = 0;
        e[1] = 0; e[4] = 1; e[7] = 0;
        e[2] = 0; e[5] = 0; e[8] = 1;
        return this;
    }

    // Column-major multiplication: this = this * matrix
    multiply(matrix: Matrix3): Matrix3 {
        const ae = this.elements;
        const be = matrix.elements;
        const te = new Float32Array(9);

        const a00 = ae[0], a01 = ae[3], a02 = ae[6];
        const a10 = ae[1], a11 = ae[4], a12 = ae[7];
        const a20 = ae[2], a21 = ae[5], a22 = ae[8];

        const b00 = be[0], b01 = be[3], b02 = be[6];
        const b10 = be[1], b11 = be[4], b12 = be[7];
        const b20 = be[2], b21 = be[5], b22 = be[8];

        te[0] = a00 * b00 + a01 * b10 + a02 * b20;
        te[3] = a00 * b01 + a01 * b11 + a02 * b21;
        te[6] = a00 * b02 + a01 * b12 + a02 * b22;

        te[1] = a10 * b00 + a11 * b10 + a12 * b20;
        te[4] = a10 * b01 + a11 * b11 + a12 * b21;
        te[7] = a10 * b02 + a11 * b12 + a12 * b22;

        te[2] = a20 * b00 + a21 * b10 + a22 * b20;
        te[5] = a20 * b01 + a21 * b11 + a22 * b21;
        te[8] = a20 * b02 + a21 * b12 + a22 * b22;

        this.elements = te;
        return this;
    }

    translate(vector: Vector2): Matrix3 {
        const e = this.elements;
        // m02 / m12 are indices 6 and 7 in column-major
        e[6] += vector.x;
        e[7] += vector.y;
        return this;
    }

    scale(vector: Vector2): Matrix3 {
        const e = this.elements;
        // Scale first column by x, second column by y
        e[0] *= vector.x; e[1] *= vector.x; e[2] *= vector.x;
        e[3] *= vector.y; e[4] *= vector.y; e[5] *= vector.y;
        return this;
    }

    rotate(angle: number): Matrix3 {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const e = this.elements;

        const a00 = e[0], a01 = e[3]/*, a02 = e[6];*/
        const a10 = e[1], a11 = e[4]/*, a12 = e[7];*/
        const a20 = e[2], a21 = e[5]/*, a22 = e[8];*/

        // Rotation (no translation part affected)
        e[0] = a00 * c + a01 * -s;
        e[3] = a00 * s + a01 * c;
        e[1] = a10 * c + a11 * -s;
        e[4] = a10 * s + a11 * c;
        e[2] = a20 * c + a21 * -s;
        e[5] = a20 * s + a21 * c;
        // e[6], e[7] (translation) unchanged, e[8] stays 1
        return this;
    }

    clone(): Matrix3 {
        const newMatrix = new Matrix3();
        newMatrix.elements.set(this.elements);
        return newMatrix;
    }
    copy(matrix: Matrix3): Matrix3 {
        this.elements.set(matrix.elements);
        return this;
    }
    toString(): string {
        const e = this.elements;
        return `|${e[0]} ${e[3]} ${e[6]}|\n|${e[1]} ${e[4]} ${e[7]}|\n|${e[2]} ${e[5]} ${e[8]}|`;
    }
    static multiplyMatrices(a: Matrix3, b: Matrix3): Matrix3 {
        return a.clone().multiply(b);
    }
    static translationMatrix(x: number, y: number): Matrix3 {
        const m = new Matrix3();
        m.translate(new Vector2(x, y));
        return m;
    }
    static rotationMatrix(angle: number): Matrix3 {
        const m = new Matrix3();
        m.rotate(angle);
        return m;
    }
    static scalingMatrix(vector: Vector2): Matrix3 {
        const m = new Matrix3();
        m.scale(vector);
        return m;
    }
}