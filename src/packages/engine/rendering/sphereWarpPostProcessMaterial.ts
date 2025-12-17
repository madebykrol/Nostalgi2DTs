import { PostProcessMaterial } from "./postProcessMaterial";
import type { MaterialRenderContext } from "./material";
import type { Camera } from "../camera";
import type { Actor } from "../world";

/**
 * Full-screen post-processing material that draws a colored outline around
 * actors by outlining their screen-space bounds.
 */
export class SphereWarpPostProcessMaterial extends PostProcessMaterial {
    private static readonly MAX_RECTS = 256;

    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private positionBuffer: WebGLBuffer | null = null;

    private uSceneTexture: WebGLUniformLocation | null = null;
    private uOutlineWidth: WebGLUniformLocation | null = null;
    private uOutlineIntensity: WebGLUniformLocation | null = null;
    private uOutlineColor: WebGLUniformLocation | null = null;
    private uRectCount: WebGLUniformLocation | null = null;
    private uRectangles: WebGLUniformLocation | null = null;
    private uViewBounds: WebGLUniformLocation | null = null;

    private outlineWidth: number = 0.1;
    private outlineIntensity: number = 1.0;
    private outlineColor: [number, number, number] = [1.0, 0.35, 0.7];

    private readonly rectUniformBuffer = new Float32Array(SphereWarpPostProcessMaterial.MAX_RECTS * 4);
    private rectCount: number = 0;
    private warnedRectOverflow: boolean = false;
    private highlightedActorIds: Set<string> | null = null;
    private readonly viewBounds = new Float32Array(4);

    private readonly quadPositions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
    ]);

    public setOutlineWidth(width: number): void {
        this.outlineWidth = Math.max(width, 0.01);
    }

    public setOutlineIntensity(intensity: number): void {
        this.outlineIntensity = Math.max(intensity, 0.0);
    }

    public setOutlineColor(color: [number, number, number]): void {
        this.outlineColor = color;
    }

    public setHighlightedActors(actors: Actor[] | string[] | null): void {
        if (actors === null) {
            this.highlightedActorIds = null;
            return;
        }

        if (actors.length === 0) {
            this.highlightedActorIds = new Set();
            return;
        }

        const ids = new Set<string>();
        for (const entry of actors) {
            if (typeof entry === "string") {
                ids.add(entry);
            } else {
                ids.add(entry.getId());
            }
        }
        this.highlightedActorIds = ids;
    }

    public override prepare(
        _gl: WebGL2RenderingContext,
        camera: Camera,
        actors: Actor[],
        sceneSize: { width: number; height: number }
    ): void {
        const width = Math.max(sceneSize.width, 1);
        const height = Math.max(sceneSize.height, 1);

        const viewBounds = camera.getBounds(width, height);
        this.viewBounds[0] = viewBounds.min.x;
        this.viewBounds[1] = viewBounds.min.y;
        this.viewBounds[2] = viewBounds.max.x;
        this.viewBounds[3] = viewBounds.max.y;

        const highlighted = this.highlightedActorIds;

        let count = 0;
        for (const actor of actors) {
            if (count >= SphereWarpPostProcessMaterial.MAX_RECTS) {
                if (!this.warnedRectOverflow) {
                    console.warn("SphereWarpPostProcessMaterial: rectangle uniform buffer full; additional actors will not be outlined.");
                    this.warnedRectOverflow = true;
                }
                break;
            }

            if (highlighted && !highlighted.has(actor.getId())) {
                continue;
            }

            if (actor.isHiddenInGame) {
                continue;
            }

            const bounds = actor.getWorldBounds();
            if (!bounds) {
                continue;
            }

            const boundsMinX = bounds.min.x;
            const boundsMaxX = bounds.max.x;
            const boundsMinY = bounds.min.y;
            const boundsMaxY = bounds.max.y;

            if (boundsMaxX < this.viewBounds[0] ||
                boundsMinX > this.viewBounds[2] ||
                boundsMaxY < this.viewBounds[1] ||
                boundsMinY > this.viewBounds[3]) {
                continue;
            }

            const rectWidth = Math.max(boundsMaxX - boundsMinX, 0);
            const rectHeight = Math.max(boundsMaxY - boundsMinY, 0);

            if (rectWidth <= 0 || rectHeight <= 0) {
                continue;
            }

            const centerX = boundsMinX + rectWidth * 0.5;
            const centerY = boundsMinY + rectHeight * 0.5;
            const halfWidth = rectWidth * 0.5;
            const halfHeight = rectHeight * 0.5;

            const baseIndex = count * 4;
            this.rectUniformBuffer[baseIndex] = centerX;
            this.rectUniformBuffer[baseIndex + 1] = centerY;
            this.rectUniformBuffer[baseIndex + 2] = halfWidth;
            this.rectUniformBuffer[baseIndex + 3] = halfHeight;
            count++;
        }

        this.rectCount = count;
        if (count < SphereWarpPostProcessMaterial.MAX_RECTS) {
            this.warnedRectOverflow = false;
        }
    }

    public compile(gl: WebGL2RenderingContext): void {
        if (this.program) {
            return;
        }

        const vertexSource = `#version 300 es
        layout(location = 0) in vec2 a_position;
        out vec2 v_uv;
        void main() {
            v_uv = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }`;

        const fragmentSource = `#version 300 es
        precision highp float;
        in vec2 v_uv;
        uniform sampler2D u_sceneTexture;
        uniform float u_outlineWidth;
        uniform float u_outlineIntensity;
        uniform vec3 u_outlineColor;
        uniform int u_rectCount;
        uniform vec4 u_rects[${SphereWarpPostProcessMaterial.MAX_RECTS}];
        uniform vec4 u_viewBounds;
        out vec4 fragColor;

        float rectangleSDF(vec2 p, vec2 center, vec2 halfSize) {
            vec2 d = abs(p - center) - halfSize;
            float outside = length(max(d, vec2(0.0)));
            float inside = min(max(d.x, d.y), 0.0);
            return outside + inside;
        }

        void main() {
            vec4 sceneColor = texture(u_sceneTexture, v_uv);
            vec2 worldMin = u_viewBounds.xy;
            vec2 worldMax = u_viewBounds.zw;
            vec2 worldPos = vec2(
                mix(worldMin.x, worldMax.x, clamp(v_uv.x, 0.0, 1.0)),
                mix(worldMin.y, worldMax.y, clamp(v_uv.y, 0.0, 1.0))
            );

            float thickness = u_outlineWidth;
            float outlineAlpha = 0.0;

            for (int i = 0; i < ${SphereWarpPostProcessMaterial.MAX_RECTS}; ++i) {
                if (i >= u_rectCount) {
                    break;
                }

                vec4 packedRect = u_rects[i];
                vec2 center = packedRect.xy;
                vec2 halfSize = packedRect.zw;
                if (halfSize.x <= 0.0 || halfSize.y <= 0.0) {
                    continue;
                }

                float distance = rectangleSDF(worldPos, center, halfSize);
                float widthEstimate = fwidth(distance);
                float alpha = 1.0 - smoothstep(thickness + widthEstimate * 1.5, thickness, abs(distance));
                outlineAlpha = max(outlineAlpha, alpha);
            }

            outlineAlpha = clamp(outlineAlpha * u_outlineIntensity, 0.0, 1.0);
            vec3 finalColor = mix(sceneColor.rgb, u_outlineColor, outlineAlpha);
            fragColor = vec4(finalColor, sceneColor.a);
        }`;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!vertexShader || !fragmentShader) {
            throw new Error("Failed to allocate post-process shaders");
        }

        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(vertexShader);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`SphereWarpPostProcessMaterial vertex compile failed: ${info ?? "unknown"}`);
        }

        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(fragmentShader);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`SphereWarpPostProcessMaterial fragment compile failed: ${info ?? "unknown"}`);
        }

        const program = gl.createProgram();
        if (!program) {
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error("Failed to create post-process program");
        }

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.bindAttribLocation(program, 0, "a_position");
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`SphereWarpPostProcessMaterial link failed: ${info ?? "unknown"}`);
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        const vao = gl.createVertexArray();
        const positionBuffer = gl.createBuffer();
        if (!vao || !positionBuffer) {
            gl.deleteProgram(program);
            throw new Error("Failed to allocate buffers for post-process material");
        }

        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.quadPositions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        this.program = program;
        this.vao = vao;
        this.positionBuffer = positionBuffer;
        this.uSceneTexture = gl.getUniformLocation(program, "u_sceneTexture");
        this.uOutlineWidth = gl.getUniformLocation(program, "u_outlineWidth");
        this.uOutlineIntensity = gl.getUniformLocation(program, "u_outlineIntensity");
        this.uOutlineColor = gl.getUniformLocation(program, "u_outlineColor");
        this.uRectCount = gl.getUniformLocation(program, "u_rectCount");
        this.uRectangles = gl.getUniformLocation(program, "u_rects[0]");
        this.uViewBounds = gl.getUniformLocation(program, "u_viewBounds");
    }

    public render(context: MaterialRenderContext): void {
        const { gl, sceneTexture, sceneTextureSize } = context;
        if (!this.program || !this.vao || !sceneTexture || !sceneTextureSize) {
            return;
        }

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
        if (this.uSceneTexture) {
            gl.uniform1i(this.uSceneTexture, 0);
        }
        if (this.uOutlineWidth) {
            gl.uniform1f(this.uOutlineWidth, this.outlineWidth);
        }
        if (this.uOutlineIntensity) {
            gl.uniform1f(this.uOutlineIntensity, this.outlineIntensity);
        }
        if (this.uOutlineColor) {
            gl.uniform3f(this.uOutlineColor, this.outlineColor[0], this.outlineColor[1], this.outlineColor[2]);
        }
        if (this.uRectCount) {
            gl.uniform1i(this.uRectCount, this.rectCount);
        }
        if (this.uRectangles && this.rectCount > 0) {
            gl.uniform4fv(this.uRectangles, this.rectUniformBuffer, 0, this.rectCount * 4);
        }
        if (this.uViewBounds) {
            gl.uniform4f(this.uViewBounds, this.viewBounds[0], this.viewBounds[1], this.viewBounds[2], this.viewBounds[3]);
        }

        const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
        const blendEnabled = gl.isEnabled(gl.BLEND);
        if (depthEnabled) {
            gl.disable(gl.DEPTH_TEST);
        }
        if (!blendEnabled) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!blendEnabled) {
            gl.disable(gl.BLEND);
        }
        if (depthEnabled) {
            gl.enable(gl.DEPTH_TEST);
        }

        gl.bindVertexArray(null);
        gl.useProgram(null);
    }
}
