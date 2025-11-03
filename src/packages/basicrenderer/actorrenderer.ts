import { Actor, MeshComponent, PhysicsComponent, Quad, render } from "@repo/engine";
import { ActorRenderer } from "../engine/rendering/renderer";
import { Camera } from "../engine/camera/Camera";
import { VertexShader } from "../engine/rendering/vertex";
import { FragmentShader } from "../engine/rendering/fragment";
import { BaseFallbackActorVertexShader } from "./shaders/baseFallbackActorVertexShader";
import { BaseActorFragmentShader } from "./shaders/baseActorFragmentShader";
import { BoundingVolume } from "../engine/physics";
import { Vector2, Vertex2 } from "../engine/math";

@render(Actor, true)
export class BaseActorRenderer extends ActorRenderer<Actor> {
    private vertexShader: VertexShader = new BaseFallbackActorVertexShader();
    private fragmentShader: FragmentShader = new BaseActorFragmentShader();

    private shaderProgram: WebGLProgram | null = null;
    // Default attribute buffer binding for position@0; for cached meshes we bind their own buffers
    private positionBuffer: WebGLBuffer | null = null; // used only for transient debug line rendering
    // private indexBuffer: WebGLBuffer | null = null; // unused for debug but kept for completeness

    private locations: {
        viewProj?: WebGLUniformLocation | null;
        translation?: WebGLUniformLocation | null;
        size?: WebGLUniformLocation | null;
        rotation?: WebGLUniformLocation | null;
        color?: WebGLUniformLocation | null;
    } = {};

    private resourcesInitialized = false;
    private fallbackQuad = new Quad();
    // Cache GPU buffers per Mesh instance to avoid re-uploading every frame
    private meshCache: WeakMap<any, { vbo: WebGLBuffer; ibo: WebGLBuffer | null; vao: WebGLVertexArrayObject | null; vertexCount: number; indexCount: number }>
        = new WeakMap();
    private debugVAO: WebGLVertexArrayObject | null = null; // dedicated VAO for debug line rendering

    private ensureResources(gl: WebGL2RenderingContext) {
        if (this.resourcesInitialized) {
            return;
        }

        this.shaderProgram = gl.createProgram();
        if (!this.shaderProgram) {
            throw new Error("Failed to create shader program");
        }

    this.vertexShader.compile(gl, this.shaderProgram);
    this.fragmentShader.compile(gl, this.shaderProgram);

        gl.linkProgram(this.shaderProgram);
        const linked = gl.getProgramParameter(this.shaderProgram, gl.LINK_STATUS);
        if (!linked) {
            const info = gl.getProgramInfoLog(this.shaderProgram);
            console.error("Error linking program:", info);
        }

    // Create transient buffers for debug overlay (separate from mesh VAOs)
        this.positionBuffer = gl.createBuffer();
        // this.indexBuffer = gl.createBuffer();

    gl.useProgram(this.shaderProgram);

        this.locations.viewProj = gl.getUniformLocation(this.shaderProgram, "u_viewProjection");
        this.locations.translation = gl.getUniformLocation(this.shaderProgram, "u_translation");
        this.locations.size = gl.getUniformLocation(this.shaderProgram, "u_size");
        this.locations.rotation = gl.getUniformLocation(this.shaderProgram, "u_rotation");
        this.locations.color = gl.getUniformLocation(this.shaderProgram, "u_color");

        // Create a dedicated VAO for debug line rendering to avoid touching mesh VAOs
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

        // Note: We no longer pre-upload fallback quad into the transient debug buffer.
        // Mesh data will be uploaded and cached on first use via bindMesh().

        this.resourcesInitialized = true;
    }

    private bindMesh(gl: WebGL2RenderingContext, mesh: MeshComponent["mesh"] | Quad): { indexed: boolean; count: number } {
        const cached = this.meshCache.get(mesh as any);
        if (cached) {
            if (cached.vao) {
                gl.bindVertexArray(cached.vao);
            } else {
                gl.bindBuffer(gl.ARRAY_BUFFER, cached.vbo);
                gl.enableVertexAttribArray(0);
                gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
                if (cached.ibo && cached.indexCount > 0) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cached.ibo);
                else gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            }
            return { indexed: cached.indexCount > 0, count: cached.indexCount > 0 ? cached.indexCount : cached.vertexCount };
        }

        // Upload once and cache (create dedicated VBO/IBO/VAO for this mesh)
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
        if (ibo && mesh.indices.length > 0) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        else gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        gl.bindVertexArray(null);

        const vertexCount = mesh.getVertexCount ? mesh.getVertexCount() : mesh.vertices.length / 2;
        const indexCount = mesh.indices.length;
        this.meshCache.set(mesh as any, { vbo, ibo, vao, vertexCount, indexCount });

        gl.bindVertexArray(vao);
        return { indexed: indexCount > 0, count: indexCount > 0 ? indexCount : vertexCount };
    }

    render(actor: Actor, camera: Camera, gl: WebGL2RenderingContext, _debugPhysics?: boolean): boolean {
        if (!camera) {
            return false;
        }
        this.ensureResources(gl);
        
        if (!this.shaderProgram || !this.positionBuffer) {
            return false;
        }


        const meshComponent = actor.getComponentsOfType<MeshComponent>(MeshComponent)[0];
        const mesh = meshComponent?.getMesh() ?? this.fallbackQuad;
        const drawInfo = this.bindMesh(gl, mesh);

        const aspect = gl.canvas.width / gl.canvas.height;
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

        // Debug draw removed from main pass; will be executed via renderDebug() in a second pass

        return true;
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

        // Set fill color red by default
        if (this.locations.color)
            gl.uniform4f(this.locations.color, 1.0, 0.0, 0.0, 1.0);
    }

    // Second-pass debug rendering (physics bounding volumes as blue outlines)
    public renderDebug(actor: Actor, camera: Camera, gl: WebGL2RenderingContext): void {
        if (!this.resourcesInitialized) return;
    if (!this.shaderProgram || !this.positionBuffer || !this.debugVAO) return;
    if (!camera) return;

    const physics = actor.getComponentsOfType(PhysicsComponent)[0];
    const body = physics?.getBody?.();
    if (!body) return;

    const vols = body.getBoundingVolumes?.() as BoundingVolume[] | undefined;
        if (!vols || vols.length === 0) return;

        const aspect = gl.canvas.width / gl.canvas.height;
        const vp = camera.getViewProjectionMatrix(aspect).elements as Float32Array;

        gl.useProgram(this.shaderProgram);
        if (this.locations.viewProj) gl.uniformMatrix3fv(this.locations.viewProj, false, vp);
        // For debug lines we provide world-space positions directly; avoid applying actor translation/scale/rotation in shader
        if (this.locations.translation) gl.uniform2f(this.locations.translation, 0.0, 0.0);
        if (this.locations.size) gl.uniform1f(this.locations.size, 1.0);
        if (this.locations.rotation) gl.uniform1f(this.locations.rotation, 0.0);
        if (this.locations.color) gl.uniform4f(this.locations.color, 0.0, 0.5, 1.0, 1.0);

        gl.bindVertexArray(this.debugVAO);
        for (const vol of vols) {
            const verts: Vertex2[] = vol.getWorldVertices();
            if (!verts || verts.length === 0) continue;
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
        // Restore fill color to red (not strictly necessary for second pass, but keeps state consistent)
        if (this.locations.color) gl.uniform4f(this.locations.color, 1.0, 0.0, 0.0, 1.0);
    }
}