import { PostProcessMaterial } from "./postProcessMaterial";
import type { MaterialRenderContext } from "./material";

/**
 * Full-screen VHS / CRT-style post-process: animated scanline sweep, mild
 * chromatic aberration, horizontal jitter, and film grain. Use with a
 * PostProcessingVolumeActor to scope it to an area.
 */
export class VhsPostProcessMaterial extends PostProcessMaterial {
    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;

    private uSceneTexture: WebGLUniformLocation | null = null;
    private uResolution: WebGLUniformLocation | null = null;
    private uTime: WebGLUniformLocation | null = null;
    private uSweepSpeed: WebGLUniformLocation | null = null;
    private uDistortionAmount: WebGLUniformLocation | null = null;
    private uNoiseAmount: WebGLUniformLocation | null = null;
    private uScanlineIntensity: WebGLUniformLocation | null = null;

    private time: number = 0;
    private sweepSpeed: number = 0.35;      // Controls how fast the bright sweep travels vertically
    private distortionAmount: number = 0.003; // Chromatic aberration / wobble
    private noiseAmount: number = 0.035;    // Grain amount
    private scanlineIntensity: number = 0.08; // Darkening from horizontal scanlines

    private readonly quadPositions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
    ]);

    public setSweepSpeed(speed: number): void {
        this.sweepSpeed = Math.max(0.0, speed);
    }

    public setDistortionAmount(amount: number): void {
        this.distortionAmount = Math.max(0.0, amount);
    }

    public setNoiseAmount(amount: number): void {
        this.noiseAmount = Math.max(0.0, amount);
    }

    public setScanlineIntensity(intensity: number): void {
        this.scanlineIntensity = Math.max(0.0, intensity);
    }

    public override tick(deltaTime: number): void {
        // Accumulate time for animation; keep it bounded to avoid precision loss.
        this.time = (this.time + deltaTime) % 10_000;
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
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_sweepSpeed;
        uniform float u_distortionAmount;
        uniform float u_noiseAmount;
        uniform float u_scanlineIntensity;
        out vec4 fragColor;

        // Simple hash-based noise
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.45);
            return fract(p.x * p.y);
        }

        void main() {
            // Convert UV to pixel space to get consistent scanline density
            vec2 pixel = v_uv * u_resolution;

            // Horizontal scanlines (darker stripes)
            float scan = sin(pixel.y * 3.14159) * u_scanlineIntensity;

            // Animated bright sweep moving from top to bottom
            float sweepPhase = fract(u_time * u_sweepSpeed);
            float sweepBand = smoothstep(0.0, 0.08, abs(v_uv.y - sweepPhase));
            float sweepHighlight = 1.0 - sweepBand; // brighter in the band

            // Chromatic aberration + horizontal wobble
            float wobble = sin(v_uv.y * 40.0 + u_time * 3.0) * u_distortionAmount;
            vec2 offset = vec2(wobble, 0.0);
            vec4 c;
            c.r = texture(u_sceneTexture, v_uv + offset * 1.2).r;
            c.g = texture(u_sceneTexture, v_uv).g;
            c.b = texture(u_sceneTexture, v_uv - offset * 1.2).b;
            c.a = 1.0;

            // Grain / magnetic noise
            float n = hash(pixel + u_time * 60.0);
            float noise = (n - 0.5) * u_noiseAmount;

            // Apply scanlines and sweep
            c.rgb *= 1.0 - scan;
            c.rgb = mix(c.rgb, c.rgb * 1.2, sweepHighlight);
            c.rgb += noise;

            fragColor = vec4(c.rgb, 1.0);
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
            throw new Error(`VhsPostProcessMaterial vertex compile failed: ${info ?? "unknown"}`);
        }

        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(fragmentShader);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`VhsPostProcessMaterial fragment compile failed: ${info ?? "unknown"}`);
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
            throw new Error(`VhsPostProcessMaterial link failed: ${info ?? "unknown"}`);
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
        this.uSceneTexture = gl.getUniformLocation(program, "u_sceneTexture");
        this.uResolution = gl.getUniformLocation(program, "u_resolution");
        this.uTime = gl.getUniformLocation(program, "u_time");
        this.uSweepSpeed = gl.getUniformLocation(program, "u_sweepSpeed");
        this.uDistortionAmount = gl.getUniformLocation(program, "u_distortionAmount");
        this.uNoiseAmount = gl.getUniformLocation(program, "u_noiseAmount");
        this.uScanlineIntensity = gl.getUniformLocation(program, "u_scanlineIntensity");
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
        if (this.uSceneTexture) gl.uniform1i(this.uSceneTexture, 0);
        if (this.uResolution) gl.uniform2f(this.uResolution, sceneTextureSize.width, sceneTextureSize.height);
        if (this.uTime) gl.uniform1f(this.uTime, this.time);
        if (this.uSweepSpeed) gl.uniform1f(this.uSweepSpeed, this.sweepSpeed);
        if (this.uDistortionAmount) gl.uniform1f(this.uDistortionAmount, this.distortionAmount);
        if (this.uNoiseAmount) gl.uniform1f(this.uNoiseAmount, this.noiseAmount);
        if (this.uScanlineIntensity) gl.uniform1f(this.uScanlineIntensity, this.scanlineIntensity);

        const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
        const blendEnabled = gl.isEnabled(gl.BLEND);
        if (depthEnabled) gl.disable(gl.DEPTH_TEST);
        if (!blendEnabled) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        if (!blendEnabled) gl.disable(gl.BLEND);
        if (depthEnabled) gl.enable(gl.DEPTH_TEST);

        gl.bindVertexArray(null);
        gl.useProgram(null);
    }
}