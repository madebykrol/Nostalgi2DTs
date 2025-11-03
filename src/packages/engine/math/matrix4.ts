import { Vector2 } from "./vector2";

export class Matrix4 {
    elements: Float32Array;
    a: any;
    b: any;
    c: any;
    d: any;
    e: any;
    f: any;
    constructor() {
        this.elements = new Float32Array(16);
        this.identity();
    }
    identity(): Matrix4 {
        const e = this.elements;
        e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
        e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
        e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
        e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
        return this;
    }
    multiply(matrix: Matrix4): Matrix4 {
        const ae = this.elements;
        const be = matrix.elements;
        const te = new Float32Array(16);
        const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
        const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
        const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
        const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
        const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
        const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
        const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
        const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
        te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
        te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
        te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
        te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
        this.elements = te;
        return this;
    }
    translate(vector: Vector2): Matrix4 {
        const x = vector.x, y = vector.y;
        const e = this.elements;
        e[12] = e[0] * x + e[4] * y + e[12];
        e[13] = e[1] * x + e[5] * y + e[13];
        e[14] = e[2] * x + e[6] * y + e[14];
        e[15] = e[3] * x + e[7] * y + e[15];
        return this;
    }
    scale(vector: Vector2): Matrix4 {
        const x = vector.x, y = vector.y;
        const e = this.elements;
        e[0] *= x; e[4] *= y;
        e[1] *= x; e[5] *= y;
        e[2] *= x; e[6] *= y;
        e[3] *= x; e[7] *= y;
        return this;
    }
    rotate(angle: number): Matrix4 {
        const c = Math.cos(angle);

        const s = Math.sin(angle);
        const e = this.elements;
        const a11 = e[0], a12 = e[4], a13 = e[8], a14 = e[12];
        const a21 = e[1], a22 = e[5], a23 = e[9], a24 = e[13];
        const a31 = e[2], a32 = e[6], a33 = e[10], a34 = e[14];
        const a41 = e[3], a42 = e[7], a43 = e[11], a44 = e[15];


        e[0] = a11 * c + a21 * s;
        e[4] = a12 * c + a22 * s;
        e[8] = a13 * c + a23 * s;
        e[12] = a14 * c + a24 * s;
        e[1] = a21 * c - a11 * s;
        e[5] = a22 * c - a12 * s;
        e[9] = a23 * c - a13 * s;
        e[13] = a24 * c - a14 * s;
        e[2] = a31;
        e[6] = a32;
        e[10] = a33;
        e[14] = a34;
        e[3] = a41;
        e[7] = a42;
        e[11] = a43;
        e[15] = a44;
        return this;
    }
    orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 {
        const e = this.elements;
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        e[0] = -2 * lr;
        e[4] = 0;
        e[8] = 0;
        e[12] = (left + right) * lr;
        e[1] = 0;
        e[5] = -2 * bt;
        e[9] = 0;
        e[13] = (top + bottom) * bt;
        e[2] = 0;
        e[6] = 0;
        e[10] = 2 * nf;
        e[14] = (far + near) * nf;
        e[3] = 0;
        e[7] = 0;
        e[11] = 0;
        e[15] = 1;
        return this;
    }
    perspective(fov: number, aspect: number, near: number, far: number): Matrix4 {
        const e = this.elements;
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);
        e[0] = f / aspect;
        e[4] = 0;
        e[8] = 0;
        e[12] = 0;
        e[1] = 0;

        e[5] = f;
        e[9] = 0;
        e[13] = 0;
        e[2] = 0;

        e[6] = 0;
        e[10] = (far + near) * nf;
        e[14] = (2 * far * near) * nf;
        e[3] = 0;
        e[7] = 0;
        e[11] = -1;
        e[15] = 0;
        return this;
    }
    invert(): Matrix4 {
        const e = this.elements;
        const m00 = e[0], m01 = e[4], m02 = e[8], m03 = e[12];
        const m10 = e[1], m11 = e[5], m12 = e[9], m13 = e[13];
        const m20 = e[2], m21 = e[6], m22 = e[10], m23 = e[14];
        const m30 = e[3], m31 = e[7], m32 = e[11], m33 = e[15];
        const temp = new Float32Array(16);
        temp[0] = m11 * (m22 * m33 - m23 * m32) - m21 * (m12 * m33 - m13 * m32) + m31 * (m12 * m23 - m13 * m22);
        temp[4] = - (m01 * (m22 * m33 - m23 * m32) - m21 * (m02 * m33 - m03 * m32) + m31 * (m02 * m23 - m03 * m22));
        temp[8] = m01 * (m12 * m33 - m13 * m32) - m11 * (m02 * m33 - m03 * m32) + m31 * (m02 * m13 - m03 * m12);
        temp[12] = - (m01 * (m12 * m23 - m13 * m22) - m11 * (m02 * m23 - m03 * m22) + m21 * (m02 * m13 - m03 * m12));
        temp[1] = - (m10 * (m22 * m33 - m23 * m32) - m20 * (m12 * m33 - m13 * m32) + m30 * (m12 * m23 - m13 * m22));
        temp[5] = m00 * (m22 * m33 - m23 * m32) - m20 * (m02 * m33 - m03 * m32) + m30 * (m02 * m23 - m03 * m22);
        temp[9] = - (m00 * (m12 * m33 - m13 * m32) - m10 * (m02 * m33 - m03 * m32) + m30 * (m02 * m13 - m03 * m12));
        temp[13] = m00 * (m12 * m23 - m13 * m22) - m10 * (m02 * m23 - m03 * m22) + m20 * (m02 * m13 - m03 * m12);
        temp[2] = m10 * (m21 * m33 - m23 * m31) - m20 * (m11 * m33 - m13 * m31) + m30 * (m11 * m23 - m13 * m21);
        temp[6] = - (m00 * (m21 * m33 - m23 * m31) - m20 * (m01 * m33 - m03 * m31) + m30 * (m01 * m23 - m03 * m21));
        temp[10] = m00 * (m11 * m33 - m13 * m31) - m10 * (m01 * m33 - m03 * m31) + m30 * (m01 * m13 - m03 * m11);
        temp[14] = - (m00 * (m11 * m23 - m13 * m21) - m10 * (m01 * m23 - m03 * m21) + m20 * (m01 * m13 - m03 * m11));
        temp[3] = - (m10 * (m21 * m32 - m22 * m31) - m20 * (m11 * m32 - m12 * m31) + m30 * (m11 * m22 - m12 * m21));
        temp[7] = m00 * (m21 * m32 - m22 * m31) - m20 * (m01 * m32 - m02 * m31) + m30 * (m01 * m22 - m02 * m21);
        temp[11] = - (m00 * (m11 * m32 - m12 * m31) - m10 * (m01 * m32 - m02 * m31) + m30 * (m01 * m12 - m02 * m11));
        temp[15] = m00 * (m11 * m22 - m12 * m21) - m10 * (m01 * m22 - m02 * m21) + m20 * (m01 * m12 - m02 * m11);
        let det = m00 * temp[0] + m01 * temp[1] + m02 * temp[2] + m03 * temp[3];
        if (det === 0) {
            return this.identity();
        }
        det = 1 / det;
        for (let i = 0; i < 16; i++) {
            e[i] = temp[i] * det;
        }
        return this;
    }
        
}