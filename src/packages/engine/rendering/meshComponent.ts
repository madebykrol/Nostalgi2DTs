import { Component } from "../world";
import { Material, MaterialRenderContext, MaterialRenderPass } from "./material";
import { Mesh } from "./mesh";
import { Camera } from "../camera/Camera";

export class MeshComponent extends Component {

    constructor(public mesh: Mesh, public material: Material) {
        super();
    }

    public override tick(deltaTime: number, _engineNetworkMode: "client" | "server" | "singleplayer"): void {
        this.material.tick(deltaTime);
    }

    public render(gl: WebGL2RenderingContext, camera: Camera | undefined): void {
        if (!this.actor || !camera || this.actor.isHiddenInGame) {
            return;
        }

        if (this.material.getRenderPass() !== "forward") {
            return;
        }

        this.material.render(this.createContext(gl, camera));
    }

    public renderPostProcess(
        gl: WebGL2RenderingContext,
        camera: Camera | undefined,
        sceneTexture: WebGLTexture,
        sceneSize: { width: number; height: number }
    ): void {
        if (!this.actor || !camera || this.actor.isHiddenInGame) {
            return;
        }

        if (this.material.getRenderPass() !== "postprocess") {
            return;
        }

        this.material.render(
            this.createContext(gl, camera, false, {
                sceneTexture,
                sceneTextureSize: sceneSize,
            })
        );
    }

    public renderDebug(gl: WebGL2RenderingContext, camera: Camera): void {
        if (!this.actor || this.actor.isHiddenInGame || !this.material.renderDebug) {
            return;
        }

        this.material.renderDebug(this.createContext(gl, camera, true));
    }

    public renderHighlight(gl: WebGL2RenderingContext, camera: Camera, color?: [number, number, number, number]): void {
        if (!this.actor || this.actor.isHiddenInGame || !this.material.renderHighlight) {
            return;
        }

        this.material.renderHighlight(this.createContext(gl, camera), color);
    }

    public setMesh(mesh: Mesh): void {
        this.mesh = mesh;
    }

    public getMesh(): Mesh {
        return this.mesh;
    }

    public setMaterial(material: Material): void {
        this.material = material;
    }

    public getMaterial(): Material {
        return this.material;
    }

    public getRenderPass(): MaterialRenderPass {
        return this.material.getRenderPass();
    }

    private createContext(
        gl: WebGL2RenderingContext,
        camera: Camera,
        debugPass: boolean = false,
        overrides: Partial<MaterialRenderContext> = {}
    ): MaterialRenderContext {
        if (!this.actor) {
            throw new Error("MeshComponent requires an actor before rendering.");
        }

        return {
            actor: this.actor,
            camera,
            gl,
            mesh: this.mesh,
            debugPass,
            ...overrides
        };
    }
}
