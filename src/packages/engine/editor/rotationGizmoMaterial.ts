import { Matrix3, Vector2 } from "../math";
import { Material, MaterialRenderContext } from "../rendering/material";
import { RotationGizmoFragmentShader, RotationGizmoVertexShader } from ".";

export type RotationGizmoHandle = "cw" | "ccw";

const ARROW_RING_RADIUS = 1.2;
const ARROW_RING_THICKNESS = 0.12;
const CURVED_ARROW_SPAN = Math.PI * 0.45;
const ARROW_TIP_LENGTH = 0.55;
const ARROW_TIP_WIDTH = 0.28;

export class RotationGizmoMaterial extends Material {
    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private positionBuffer: WebGLBuffer | null = null;
    private colorLocation: WebGLUniformLocation | null = null;
    private viewProjectionLocation: WebGLUniformLocation | null = null;
    private readonly circleSegments = 64;
    private arcScratch = new Float32Array(0);
    private tipScratch = new Float32Array(6);

    private readonly vertexShader = new RotationGizmoVertexShader();
    private readonly fragmentShader = new RotationGizmoFragmentShader();

    constructor() {
        super();
    }

    public override tick(_deltaTime: number): void {}

    public override compile(gl: WebGL2RenderingContext): void {
        if (this.program) {
            return;
        }

        const program = gl.createProgram();
        if (!program) {
            throw new Error("Failed to create rotation gizmo program");
        }

        const compiledVertexShader = this.vertexShader.compile(gl, program);
        const compiledFragmentShader = this.fragmentShader.compile(gl, program);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(compiledVertexShader);
            gl.deleteShader(compiledFragmentShader);
            throw new Error(`Failed to link rotation gizmo shader: ${info}`);
        }

        gl.deleteShader(compiledVertexShader);
        gl.deleteShader(compiledFragmentShader);

        this.program = program;
        this.vao = gl.createVertexArray();
        this.positionBuffer = gl.createBuffer();
        this.colorLocation = gl.getUniformLocation(program, "u_color");
        this.viewProjectionLocation = gl.getUniformLocation(program, "u_viewProjection");

        if (!this.vao || !this.positionBuffer) {
            throw new Error("Failed to initialize rotation gizmo buffers");
        }

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    public override render(context: MaterialRenderContext): void {
        const { gl, actor, camera, debugPass } = context;
        if (!actor || !camera || debugPass || !this.program || !this.vao || !this.positionBuffer || !this.colorLocation || !this.viewProjectionLocation) {
            return;
        }

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        const worldPosition = actor.getPosition();
        const zoom = camera.getZoom();

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const viewProjection: Matrix3 = camera.getViewProjectionMatrix(aspect);
        const viewProjectionElements = viewProjection.elements;

        const radius = ARROW_RING_RADIUS / zoom;
        const thickness = ARROW_RING_THICKNESS / zoom;

        const wasDepthEnabled = gl.isEnabled(gl.DEPTH_TEST);
        if (wasDepthEnabled) {
            gl.disable(gl.DEPTH_TEST);
        }
        const wasCullEnabled = gl.isEnabled(gl.CULL_FACE);
        if (wasCullEnabled) {
            gl.disable(gl.CULL_FACE);
        }
        const wasBlendEnabled = gl.isEnabled(gl.BLEND);
        if (!wasBlendEnabled) {
            gl.enable(gl.BLEND);
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.uniformMatrix3fv(this.viewProjectionLocation, false, viewProjectionElements);

        const halfSpan = CURVED_ARROW_SPAN * 0.5;
        this.drawCurvedArrow(gl, worldPosition, radius, thickness, zoom, Math.PI - halfSpan, Math.PI + halfSpan, [0.05, 0.9, 0.5, 0.9]);
        this.drawCurvedArrow(gl, worldPosition, radius, thickness, zoom, halfSpan, -halfSpan, [0.95, 0.35, 0.35, 0.9]);

        if (!wasBlendEnabled) {
            gl.disable(gl.BLEND);
        }
        if (wasCullEnabled) {
            gl.enable(gl.CULL_FACE);
        }
        if (wasDepthEnabled) {
            gl.enable(gl.DEPTH_TEST);
        }

        gl.bindVertexArray(null);
        gl.useProgram(null);
    }

    public override renderDebug(_context: MaterialRenderContext): void {}

    public override renderHighlight(_context: MaterialRenderContext, _color?: [number, number, number, number]): void {}

    public hitTest(localX: number, localY: number, cameraZoom: number): RotationGizmoHandle | null {
        const radius = ARROW_RING_RADIUS / cameraZoom;
        const thickness = ARROW_RING_THICKNESS / cameraZoom;

        const halfSpan = CURVED_ARROW_SPAN * 0.5;
        const ccwStart = Math.PI - halfSpan;
        const ccwEnd = Math.PI + halfSpan;
        if (this.hitCurvedArrow(localX, localY, radius, thickness, cameraZoom, ccwStart, ccwEnd)) {
            return "ccw";
        }

        const cwStart = halfSpan;
        const cwEnd = -halfSpan;
        if (this.hitCurvedArrow(localX, localY, radius, thickness, cameraZoom, cwStart, cwEnd)) {
            return "cw";
        }

        return null;
    }

    private drawCurvedArrow(
        gl: WebGL2RenderingContext,
        position: Vector2,
        radius: number,
        thickness: number,
        zoom: number,
        startAngle: number,
        endAngle: number,
        color: [number, number, number, number]
    ): void {
        const outerRadius = radius + thickness * 0.5;
        const innerRadius = radius - thickness * 0.5;
        const span = Math.abs(endAngle - startAngle);
        const segments = Math.max(8, Math.floor(this.circleSegments * (span / (Math.PI * 2))));
        const floatsNeeded = (segments + 1) * 4;

        if (this.arcScratch.length < floatsNeeded) {
            this.arcScratch = new Float32Array(floatsNeeded);
        }

        let offset = 0;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = startAngle + (endAngle - startAngle) * t;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            this.arcScratch[offset++] = position.x + cos * outerRadius;
            this.arcScratch[offset++] = position.y + sin * outerRadius;
            this.arcScratch[offset++] = position.x + cos * innerRadius;
            this.arcScratch[offset++] = position.y + sin * innerRadius;
        }

        const vertexCount = (segments + 1) * 2;
        this.draw(gl, this.arcScratch.subarray(0, floatsNeeded), vertexCount, gl.TRIANGLE_STRIP, color);

        const directionSign = endAngle - startAngle >= 0 ? 1 : -1;
        const finalAngle = endAngle;
        const cos = Math.cos(finalAngle);
        const sin = Math.sin(finalAngle);
        const tangentX = -sin * directionSign;
        const tangentY = cos * directionSign;

        const baseOuterX = position.x + cos * outerRadius;
        const baseOuterY = position.y + sin * outerRadius;
        const baseInnerX = position.x + cos * innerRadius;
        const baseInnerY = position.y + sin * innerRadius;

        const tipLength = ARROW_TIP_LENGTH / zoom;
        const backOffset = ARROW_TIP_WIDTH / zoom;

        const baseOffsetX = tangentX * -backOffset * 0.5;
        const baseOffsetY = tangentY * -backOffset * 0.5;

        const arrowTipX = baseOuterX + tangentX * tipLength;
        const arrowTipY = baseOuterY + tangentY * tipLength;

        if (this.tipScratch.length < 6) {
            this.tipScratch = new Float32Array(6);
        }

        this.tipScratch[0] = baseOuterX + baseOffsetX;
        this.tipScratch[1] = baseOuterY + baseOffsetY;
        this.tipScratch[2] = baseInnerX + baseOffsetX;
        this.tipScratch[3] = baseInnerY + baseOffsetY;
        this.tipScratch[4] = arrowTipX;
        this.tipScratch[5] = arrowTipY;

        this.draw(gl, this.tipScratch, 3, gl.TRIANGLES, color);
    }

    private hitCurvedArrow(
        localX: number,
        localY: number,
        radius: number,
        thickness: number,
        zoom: number,
        startAngle: number,
        endAngle: number
    ): boolean {
        const outerRadius = radius + thickness * 0.5;
        const innerRadius = radius - thickness * 0.5;
        const span = Math.abs(endAngle - startAngle);
        const pointRadius = Math.sqrt(localX * localX + localY * localY);
        const angle = Math.atan2(localY, localX);

        if (pointRadius >= innerRadius && pointRadius <= outerRadius) {
            if (this.isAngleBetween(angle, startAngle, endAngle)) {
                return true;
            }
        }

        const directionSign = endAngle - startAngle >= 0 ? 1 : -1;
        const finalAngle = endAngle;
        const cos = Math.cos(finalAngle);
        const sin = Math.sin(finalAngle);
        const tangentX = -sin * directionSign;
        const tangentY = cos * directionSign;

        const tipLength = ARROW_TIP_LENGTH / zoom;
        const backOffset = ARROW_TIP_WIDTH / zoom;
        const baseOffsetX = tangentX * -backOffset * 0.5;
        const baseOffsetY = tangentY * -backOffset * 0.5;

        const baseOuterX = Math.cos(finalAngle) * outerRadius + baseOffsetX;
        const baseOuterY = Math.sin(finalAngle) * outerRadius + baseOffsetY;
        const baseInnerX = Math.cos(finalAngle) * innerRadius + baseOffsetX;
        const baseInnerY = Math.sin(finalAngle) * innerRadius + baseOffsetY;
        const tipX = Math.cos(finalAngle) * outerRadius + tangentX * tipLength;
        const tipY = Math.sin(finalAngle) * outerRadius + tangentY * tipLength;

        if (this.pointInTriangle(localX, localY, baseOuterX, baseOuterY, baseInnerX, baseInnerY, tipX, tipY)) {
            return true;
        }

        const allowance = Math.max(0.04, (ARROW_TIP_WIDTH * 0.5) / zoom);
        const expandedOuter = outerRadius + allowance;
        const expandedInner = Math.max(0, innerRadius - allowance);
        if (pointRadius >= expandedInner && pointRadius <= expandedOuter) {
            const spanPadding = Math.min(span * 0.15, 0.35);
            const paddedStart = startAngle - directionSign * spanPadding;
            const paddedEnd = endAngle + directionSign * spanPadding;
            if (this.isAngleBetween(angle, paddedStart, paddedEnd)) {
                return true;
            }
        }

        return false;
    }

    private draw(gl: WebGL2RenderingContext, vertices: Float32Array, vertexCount: number, mode: number, color: [number, number, number, number]): void {
        if (!this.positionBuffer || !this.colorLocation) {
            return;
        }

        gl.uniform4fv(this.colorLocation, color);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
        gl.drawArrays(mode, 0, vertexCount);
    }

    private isAngleBetween(angle: number, start: number, end: number): boolean {
        const startToEnd = this.normalizeAngleSigned(end - start);
        const startToAngle = this.normalizeAngleSigned(angle - start);

        if (startToEnd === 0) {
            return false;
        }

        if (startToEnd > 0) {
            return startToAngle >= 0 && startToAngle <= startToEnd;
        }

        return startToAngle <= 0 && startToAngle >= startToEnd;
    }

    private normalizeAngleSigned(angle: number): number {
        const twoPi = Math.PI * 2;
        let result = angle % twoPi;
        if (result > Math.PI) {
            result -= twoPi;
        } else if (result <= -Math.PI) {
            result += twoPi;
        }
        return result;
    }

    private pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
        const v0x = cx - ax;
        const v0y = cy - ay;
        const v1x = bx - ax;
        const v1y = by - ay;
        const v2x = px - ax;
        const v2y = py - ay;

        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot02 = v0x * v2x + v0y * v2y;
        const dot11 = v1x * v1x + v1y * v1y;
        const dot12 = v1x * v2x + v1y * v2y;

        const denom = dot00 * dot11 - dot01 * dot01;
        if (denom === 0) {
            return false;
        }

        const invDenom = 1 / denom;
        const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

        return u >= 0 && v >= 0 && u + v <= 1;
    }
}
