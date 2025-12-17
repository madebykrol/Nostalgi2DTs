import { Material, MaterialRenderContext } from "../rendering/material";
import { TranslationGizmoVertexShader, TranslationGizmoFragmentShader } from ".";
import { Actor } from "../world";

/**
 * Material that draws a simple 2D translation gizmo (x and y axes with arrowheads).
 */

export interface TranslationGizmoDimensions {
    axisLength: number;
    arrowSize: number;
    arrowWidth: number;
    pivotHalfSize: number;
}

export type TranslationGizmoAxis = "x" | "y";
export type TranslationGizmoHandle = TranslationGizmoAxis | "pivot";

export class TranslationGizmoMaterial extends Material {
    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private positionBuffer: WebGLBuffer | null = null;

    private readonly lineData = new Float32Array(4);
    private readonly triangleData = new Float32Array(6);
    private readonly quadData = new Float32Array(12);


    private readonly BASE_AXIS_LENGTH = 2.4;
    private readonly ARROW_SIZE_FACTOR = 0.28;
    private readonly ARROW_WIDTH_FACTOR = 0.18;
    private readonly PIVOT_SIZE_FACTOR = 0.12;


    public computeTranslationGizmoDimensions(zoom: number): TranslationGizmoDimensions {
        const safeZoom = Math.max(zoom, 0.01);
        const axisLength = this.BASE_AXIS_LENGTH / safeZoom;
        const arrowSize = axisLength * this.ARROW_SIZE_FACTOR;
        const arrowWidth = axisLength * this.ARROW_WIDTH_FACTOR;
        const pivotHalfSize = axisLength * this.PIVOT_SIZE_FACTOR * 0.5;
    
        return {
            axisLength,
            arrowSize,
            arrowWidth,
            pivotHalfSize,
        };
    }

    private readonly locations: {
        viewProj?: WebGLUniformLocation | null;
        translation?: WebGLUniformLocation | null;
        color?: WebGLUniformLocation | null;
    } = {};

    public override render(context: MaterialRenderContext): void {
        const { actor, camera, gl } = context;
        if (!this.program || !this.positionBuffer || !this.vao) {
            return;
        }

        const targetActor = this.resolveTargetActor(actor);
        if (!targetActor || targetActor.isHiddenInGame) {
            return;
        }

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const vp = camera.getViewProjectionMatrix(aspect).elements as Float32Array;
        const position = targetActor.getPosition();

        const wasDepthEnabled = gl.isEnabled(gl.DEPTH_TEST);
        if (wasDepthEnabled) {
            gl.disable(gl.DEPTH_TEST);
        }
        const wasBlendEnabled = gl.isEnabled(gl.BLEND);
        if (!wasBlendEnabled) {
            gl.enable(gl.BLEND);
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.program);
        if (this.locations.viewProj) {
            gl.uniformMatrix3fv(this.locations.viewProj, false, vp);
        }
        if (this.locations.translation) {
            gl.uniform2f(this.locations.translation, position.x, position.y);
        }

        const { axisLength, arrowSize, arrowWidth, pivotHalfSize } = this.computeTranslationGizmoDimensions(camera.getZoom());

        this.drawLine(gl, 0, 0, axisLength, 0, [0.98, 0.38, 0.34, 1.0]);
        this.drawTriangle(
            gl,
            [
                axisLength, 0,
                axisLength - arrowSize, arrowWidth,
                axisLength - arrowSize, -arrowWidth,
            ],
            [1.0, 0.46, 0.38, 1.0]
        );

        this.drawLine(gl, 0, 0, 0, axisLength, [0.3, 0.85, 0.45, 1.0]);
        this.drawTriangle(
            gl,
            [
                0, axisLength,
                arrowWidth, axisLength - arrowSize,
                -arrowWidth, axisLength - arrowSize,
            ],
            [0.4, 0.95, 0.6, 1.0]
        );

        this.drawQuad(
            gl,
            [
                -pivotHalfSize, -pivotHalfSize,
                pivotHalfSize, -pivotHalfSize,
                pivotHalfSize, pivotHalfSize,
                -pivotHalfSize, -pivotHalfSize,
                pivotHalfSize, pivotHalfSize,
                -pivotHalfSize, pivotHalfSize,
            ],
            [0.95, 0.95, 0.95, 0.85]
        );

        if (!wasBlendEnabled) {
            gl.disable(gl.BLEND);
        }
        if (wasDepthEnabled) {
            gl.enable(gl.DEPTH_TEST);
        }
    }

    private readonly vertexShader = new TranslationGizmoVertexShader();
    private readonly fragmentShader = new TranslationGizmoFragmentShader();

    public compile(gl: WebGL2RenderingContext): void {
        if (this.program) {
            return;
        }

        const program = gl.createProgram();
        if (!program) {
            throw new Error("TranslationGizmoMaterial: failed to create program");
        }

        const compiledVertexShader = this.vertexShader.compile(gl, program);
        const compiledFragmentShader = this.fragmentShader.compile(gl, program);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(compiledVertexShader);
            gl.deleteShader(compiledFragmentShader);
            throw new Error(`TranslationGizmoMaterial: program link error: ${info ?? "unknown"}`);
        }

        gl.deleteShader(compiledVertexShader);
        gl.deleteShader(compiledFragmentShader);

        this.program = program;
        this.locations.viewProj = gl.getUniformLocation(program, "u_viewProjection");
        this.locations.translation = gl.getUniformLocation(program, "u_translation");
        this.locations.color = gl.getUniformLocation(program, "u_color");

        this.positionBuffer = gl.createBuffer();
        this.vao = gl.createVertexArray();
        if (!this.positionBuffer || !this.vao) {
            throw new Error("TranslationGizmoMaterial: failed to allocate buffers");
        }

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    private resolveTargetActor(actor: Actor): Actor | null {
        const parent = actor.getParent();
        if (parent instanceof Actor) {
            return parent;
        }
        return actor;
    }

    private drawLine(gl: WebGL2RenderingContext, x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number]): void {
        this.lineData[0] = x0;
        this.lineData[1] = y0;
        this.lineData[2] = x1;
        this.lineData[3] = y1;
        this.draw(gl, this.lineData, 2, gl.LINES, color);
    }

    private drawTriangle(gl: WebGL2RenderingContext, vertices: number[], color: [number, number, number, number]): void {
        for (let i = 0; i < vertices.length && i < this.triangleData.length; i++) {
            this.triangleData[i] = vertices[i];
        }
        this.draw(gl, this.triangleData, vertices.length / 2, gl.TRIANGLES, color);
    }

    private drawQuad(gl: WebGL2RenderingContext, vertices: number[], color: [number, number, number, number]): void {
        for (let i = 0; i < vertices.length && i < this.quadData.length; i++) {
            this.quadData[i] = vertices[i];
        }
        this.draw(gl, this.quadData, vertices.length / 2, gl.TRIANGLES, color);
    }

    private draw(
        gl: WebGL2RenderingContext,
        data: Float32Array,
        vertexCount: number,
        mode: number,
        color: [number, number, number, number]
    ): void {
        if (!this.program || !this.positionBuffer || !this.vao) {
            return;
        }

        if (this.locations.color) {
            gl.uniform4f(this.locations.color, color[0], color[1], color[2], color[3]);
        }

        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const floatsRequired = Math.max(vertexCount * 2, 0);
        const bufferSlice = data.length === floatsRequired ? data : data.subarray(0, floatsRequired);
        gl.bufferData(gl.ARRAY_BUFFER, bufferSlice, gl.DYNAMIC_DRAW);
        gl.drawArrays(mode, 0, vertexCount);
        gl.bindVertexArray(null);
    }
}
