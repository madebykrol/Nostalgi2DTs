import { Material, MaterialRenderContext, Mesh, Quad, PhysicsComponent, BoundingVolume, Vector2, Vertex2 } from "@repo/engine";
import { FragmentShader } from "@repo/engine";
import { BaseFallbackActorVertexShader } from "./shaders/baseFallbackActorVertexShader";
import { BaseActorFragmentShader } from "./shaders/baseActorFragmentShader";

class EditorHighlightFragmentShader extends FragmentShader {
    getSource(): string {
        return `#version 300 es
        precision highp float;
        uniform vec2 u_viewportSize;
        uniform vec4 u_tintA;
        uniform vec4 u_tintB;
        out vec4 outColor;

        void main() {
            if (u_viewportSize.x <= 0.0 || u_viewportSize.y <= 0.0) {
                discard;
            }

            vec2 uv = gl_FragCoord.xy / u_viewportSize;
            float blend = clamp(uv.y, 0.0, 1.0);
            vec3 gradient = mix(u_tintA.rgb, u_tintB.rgb, blend);

            float alpha = clamp(mix(u_tintA.a, u_tintB.a, blend), 0.0, 1.0);

            float radial = smoothstep(0.0, 1.0, 1.0 - distance(uv, vec2(0.5, 0.52)) * 1.25);
            vec3 glow = mix(vec3(0.0), u_tintB.rgb, radial * 0.35);
            vec3 color = clamp(gradient + glow, 0.0, 1.0);

            outColor = vec4(color, alpha);
        }`;
    }

    getUniforms(): { [key: string]: WebGLUniformLocation | null } {
        return {};
    }
}

interface CachedMesh {
    vbo: WebGLBuffer;
    ibo: WebGLBuffer | null;
    vao: WebGLVertexArrayObject | null;
    vertexCount: number;
    indexCount: number;
}

interface DrawInfo {
    indexed: boolean;
    count: number;
}

export class UnlitMaterial extends Material {
    private vertexShader = new BaseFallbackActorVertexShader();
    private fragmentShader = new BaseActorFragmentShader();
    private editorHighlightFragmentShader = new EditorHighlightFragmentShader();

    private shaderProgram: WebGLProgram | null = null;
    private highlightProgram: WebGLProgram | null = null;
    private positionBuffer: WebGLBuffer | null = null; // used only for transient debug line rendering

    private readonly locations: {
        viewProj?: WebGLUniformLocation | null;
        translation?: WebGLUniformLocation | null;
        size?: WebGLUniformLocation | null;
        rotation?: WebGLUniformLocation | null;
        color?: WebGLUniformLocation | null;
    } = {};

    private readonly highlightLocations: {
        viewProj?: WebGLUniformLocation | null;
        translation?: WebGLUniformLocation | null;
        size?: WebGLUniformLocation | null;
        rotation?: WebGLUniformLocation | null;
        viewportSize?: WebGLUniformLocation | null;
        tintA?: WebGLUniformLocation | null;
        tintB?: WebGLUniformLocation | null;
    } = {};

    private resourcesInitialized = false;
    private fallbackQuad: Mesh = new Quad();
    private meshCache: WeakMap<Mesh, CachedMesh> = new WeakMap();
    private debugVAO: WebGLVertexArrayObject | null = null;
    private color: [number, number, number, number] = [1, 0, 0, 1];

    public setColor(color: [number, number, number, number]): void {
        this.color = color;
    }

    public render(context: MaterialRenderContext): boolean {

        const { actor, camera, gl } = context;

        if (!this.shaderProgram || !this.positionBuffer) {
            return false;
        }

        const mesh = context.mesh ?? this.fallbackQuad;
        const drawInfo = this.bindMesh(gl, mesh);

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const vp = camera.getViewProjectionMatrix(aspect).elements;
        const position = actor.getPosition();
        const halfSize = 1.0;
        const rotation = actor.getRotation();

        gl.useProgram(this.shaderProgram);
        this.setShaderProperties(gl, vp, position, halfSize, rotation);

        if (drawInfo.indexed) {
            gl.drawElements(gl.TRIANGLES, drawInfo.count, gl.UNSIGNED_SHORT, 0);
        } else {
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, drawInfo.count);
        }

        return true;
    }

    public override renderDebug(context: MaterialRenderContext): void {
        const { actor, camera, gl } = context;
        this.renderBoundingVolumes(actor, camera, gl, [0.0, 0.5, 1.0, 1.0]);
    }

    public override renderHighlight(context: MaterialRenderContext, color: [number, number, number, number] = [0.95, 0.35, 0.85, 1.0]): void {
        if (!this.renderSpriteHighlight(context, color)) {
            const { actor, camera, gl } = context;
            this.renderBoundingVolumes(actor, camera, gl, color);
        }
    }

    public compile(gl: WebGL2RenderingContext): void {
        if (this.resourcesInitialized) {
            return;
        }

        this.shaderProgram = gl.createProgram();
        if (!this.shaderProgram) {
            throw new Error("Failed to create shader program");
        }

        const vertexShader = this.vertexShader.compile(gl, this.shaderProgram);
        const fragmentShader = this.fragmentShader.compile(gl, this.shaderProgram);

        gl.linkProgram(this.shaderProgram);
        const linked = gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS);
        if (!linked) {
            const info = gl.getProgramInfoLog(this.shaderProgram);
            console.error("Error linking program:", info);
        }

        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        this.positionBuffer = gl.createBuffer();

        gl.useProgram(this.shaderProgram);

        this.locations.viewProj = gl.getUniformLocation(this.shaderProgram, "u_viewProjection");
        this.locations.translation = gl.getUniformLocation(this.shaderProgram, "u_translation");
        this.locations.size = gl.getUniformLocation(this.shaderProgram, "u_size");
        this.locations.rotation = gl.getUniformLocation(this.shaderProgram, "u_rotation");
        this.locations.color = gl.getUniformLocation(this.shaderProgram, "u_color");

        this.debugVAO = gl.createVertexArray();
        if (!this.debugVAO) {
            throw new Error("Failed to create debug VAO");
        }
        gl.bindVertexArray(this.debugVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.bindVertexArray(null);

        this.highlightProgram = gl.createProgram();
        if (!this.highlightProgram) {
            throw new Error("Failed to create highlight shader program");
        }

        const highlightVertexShader = this.vertexShader.compile(gl, this.highlightProgram);
        const highlightFragmentShader = this.editorHighlightFragmentShader.compile(gl, this.highlightProgram);

        gl.linkProgram(this.highlightProgram);
        const highlightLinked = gl.getProgramParameter(this.highlightProgram, gl.LINK_STATUS);
        if (!highlightLinked) {
            const info = gl.getProgramInfoLog(this.highlightProgram);
            console.error("Error linking highlight program:", info);
        }

        gl.deleteShader(highlightVertexShader);
        gl.deleteShader(highlightFragmentShader);

        gl.useProgram(this.highlightProgram);
        this.highlightLocations.viewProj = gl.getUniformLocation(this.highlightProgram, "u_viewProjection");
        this.highlightLocations.translation = gl.getUniformLocation(this.highlightProgram, "u_translation");
        this.highlightLocations.size = gl.getUniformLocation(this.highlightProgram, "u_size");
        this.highlightLocations.rotation = gl.getUniformLocation(this.highlightProgram, "u_rotation");
        this.highlightLocations.viewportSize = gl.getUniformLocation(this.highlightProgram, "u_viewportSize");
        this.highlightLocations.tintA = gl.getUniformLocation(this.highlightProgram, "u_tintA");
        this.highlightLocations.tintB = gl.getUniformLocation(this.highlightProgram, "u_tintB");

        this.resourcesInitialized = true;
    }

    private bindMesh(gl: WebGL2RenderingContext, mesh: Mesh): DrawInfo {
        const cached = this.meshCache.get(mesh);
        if (cached) {
            if (cached.vao) {
                gl.bindVertexArray(cached.vao);
            } else {
                gl.bindBuffer(gl.ARRAY_BUFFER, cached.vbo);
                gl.enableVertexAttribArray(0);
                gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                if (cached.ibo && cached.indexCount > 0) {
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cached.ibo);
                } else {
                    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
                }
            }
            return { indexed: cached.indexCount > 0, count: cached.indexCount > 0 ? cached.indexCount : cached.vertexCount };
        }

        const vbo = gl.createBuffer();
        if (!vbo) throw new Error("Failed to create VBO");
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

        let ibo: WebGLBuffer | null = null;
        if (mesh.indices.length > 0) {
            ibo = gl.createBuffer();
            if (!ibo) throw new Error("Failed to create IBO");
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        }

        const vao = gl.createVertexArray();
        if (!vao) throw new Error("Failed to create VAO");
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        if (ibo && mesh.indices.length > 0) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        } else {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
        gl.bindVertexArray(null);

        const vertexCount = mesh.getVertexCount ? mesh.getVertexCount() : mesh.vertices.length / 2;
        const indexCount = mesh.indices.length;
        this.meshCache.set(mesh, { vbo, ibo, vao, vertexCount, indexCount });

        gl.bindVertexArray(vao);
        return { indexed: indexCount > 0, count: indexCount > 0 ? indexCount : vertexCount };
    }

    private setShaderProperties(gl: WebGL2RenderingContext, vp: Float32Array, position: Vector2, halfSize: number, rotation: number) {
        if (this.locations.viewProj) {
            gl.uniformMatrix3fv(this.locations.viewProj, false, vp);
        }
        if (this.locations.translation) {
            gl.uniform2f(this.locations.translation, position.x, position.y);
        }
        if (this.locations.size) {
            gl.uniform1f(this.locations.size, halfSize);
        }
        if (this.locations.rotation) {
            gl.uniform1f(this.locations.rotation, rotation);
        }
        if (this.locations.color) {
            gl.uniform4f(this.locations.color, this.color[0], this.color[1], this.color[2], this.color[3]);
        }
    }

    private renderBoundingVolumes(actor: MaterialRenderContext["actor"], camera: MaterialRenderContext["camera"], gl: WebGL2RenderingContext, color: [number, number, number, number]): void {
        if (!this.resourcesInitialized || !this.shaderProgram || !this.positionBuffer || !this.debugVAO) {
            return;
        }

        const physics = actor.getComponentsOfType(PhysicsComponent)[0];
        const body = physics?.getBody?.();
        if (!body) {
            return;
        }

        const vols = body.getBoundingVolumes?.() as BoundingVolume[] | undefined;
        if (!vols || vols.length === 0) {
            return;
        }

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const vp = camera.getViewProjectionMatrix(aspect).elements as Float32Array;

        gl.useProgram(this.shaderProgram);

        if (this.locations.viewProj) gl.uniformMatrix3fv(this.locations.viewProj, false, vp);
        if (this.locations.translation) gl.uniform2f(this.locations.translation, 0.0, 0.0);
        if (this.locations.size) gl.uniform1f(this.locations.size, 1.0);
        if (this.locations.rotation) gl.uniform1f(this.locations.rotation, 0.0);
        if (this.locations.color) gl.uniform4f(this.locations.color, color[0], color[1], color[2], color[3]);

        gl.bindVertexArray(this.debugVAO);
        for (const vol of vols) {
            const verts: Vertex2[] = vol.getWorldVertices();
            if (!verts || verts.length === 0) {
                continue;
            }
            const lineVerts = new Float32Array(verts.length * 2);
            for (let i = 0; i < verts.length; i++) {
                lineVerts[i * 2] = verts[i].x;
                lineVerts[i * 2 + 1] = verts[i].y;
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, lineVerts, gl.DYNAMIC_DRAW);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.LINE_LOOP, 0, verts.length);
        }
        gl.bindVertexArray(null);

        if (this.locations.color) {
            gl.uniform4f(this.locations.color, this.color[0], this.color[1], this.color[2], this.color[3]);
        }
    }

    private renderSpriteHighlight(context: MaterialRenderContext, accent: [number, number, number, number]): boolean {
        if (!this.resourcesInitialized || !this.highlightProgram) {
            return false;
        }

        const gl = context.gl;
        const camera = context.camera;
        const actor = context.actor;
        const mesh = context.mesh ?? this.fallbackQuad;
        const drawInfo = this.bindMesh(gl, mesh);

        const aspect = gl.canvas.height === 0 ? 1 : gl.canvas.width / gl.canvas.height;
        const vp = camera.getViewProjectionMatrix(aspect).elements as Float32Array;
        const position = actor.getPosition();
        const halfSize = 1.0;
        const rotation = actor.getRotation();

        gl.useProgram(this.highlightProgram);

        if (this.highlightLocations.viewProj) gl.uniformMatrix3fv(this.highlightLocations.viewProj, false, vp);
        if (this.highlightLocations.translation) gl.uniform2f(this.highlightLocations.translation, position.x, position.y);
        if (this.highlightLocations.size) gl.uniform1f(this.highlightLocations.size, halfSize);
        if (this.highlightLocations.rotation) gl.uniform1f(this.highlightLocations.rotation, rotation);
        if (this.highlightLocations.viewportSize) gl.uniform2f(this.highlightLocations.viewportSize, gl.canvas.width || 1, gl.canvas.height || 1);

        const baseStart: [number, number, number, number] = [0.04, 0.12, 0.22, 0.18];
        const accentColor = accent ?? [0.95, 0.35, 0.85, 0.6];
        const blendFactor = 0.65;
        const baseEnd: [number, number, number, number] = [
            baseStart[0] * (1 - blendFactor) + accentColor[0] * blendFactor,
            baseStart[1] * (1 - blendFactor) + accentColor[1] * blendFactor,
            baseStart[2] * (1 - blendFactor) + accentColor[2] * blendFactor,
            baseStart[3] * 0.4 + accentColor[3] * 0.6
        ];

        if (this.highlightLocations.tintA) gl.uniform4f(this.highlightLocations.tintA, baseStart[0], baseStart[1], baseStart[2], baseStart[3]);
        if (this.highlightLocations.tintB) gl.uniform4f(this.highlightLocations.tintB, baseEnd[0], baseEnd[1], baseEnd[2], baseEnd[3]);

        const wasBlending = gl.isEnabled(gl.BLEND);
        if (!wasBlending) {
            gl.enable(gl.BLEND);
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        if (drawInfo.indexed) {
            gl.drawElements(gl.TRIANGLES, drawInfo.count, gl.UNSIGNED_SHORT, 0);
        } else {
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, drawInfo.count);
        }

        if (!wasBlending) {
            gl.disable(gl.BLEND);
        }

        return true;
    }
}
