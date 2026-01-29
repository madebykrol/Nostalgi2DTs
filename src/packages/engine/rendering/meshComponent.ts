import { Component } from "../world";
import { Material, MaterialRenderContext, MaterialRenderPass } from "./material";
import { Mesh } from "./mesh";
import { Camera } from "../camera/Camera";
import { property } from "../utils";

export class MeshComponent extends Component {

    private _mesh: Mesh;
    private _material: Material;
    constructor(mesh: Mesh, material: Material) {
        super();
        this._mesh = mesh;
        this._material = material;
    }

    @property()
    set mesh(mesh: Mesh) {
        this._mesh = mesh;
    }

    get mesh(): Mesh {
        return this._mesh;
    }
    
    @property()
    set material(material: Material) {
        this._material = material;
    }
    get material(): Material {
        return this._material;
    }

    public override tick(deltaTime: number, _engineNetworkMode: "client" | "server" | "singleplayer"): void {
        this._material.tick(deltaTime);
    }

    public render(gl: WebGL2RenderingContext,
        camera: Camera | undefined,
        renderPass: MaterialRenderPass = "forward",
        sceneTexture?: WebGLTexture): void {
        if (!this.actor || !camera || this.actor.isHiddenInGame) {
            return;
        }

        if (this._material.getRenderPass() !== "forward") {
            return;
        }

        this._material.render(this.createContext(gl, camera));
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

        if (this._material.getRenderPass() !== "postprocess") {
            return;
        }

        this._material.render(
            this.createContext(gl, camera, false, {
                sceneTexture,
                sceneTextureSize: sceneSize,
            })
        );
    }

    public renderDebug(gl: WebGL2RenderingContext, camera: Camera): void {
        if (!this.actor || this.actor.isHiddenInGame || !this._material.renderDebug) {
            return;
        }

        this._material.renderDebug(this.createContext(gl, camera, true));
    }

    public renderHighlight(gl: WebGL2RenderingContext, camera: Camera, color?: [number, number, number, number]): void {
        if (!this.actor || this.actor.isHiddenInGame || !this._material.renderHighlight) {
            return;
        }

        this._material.renderHighlight(this.createContext(gl, camera), color);
    }

    public setMesh(mesh: Mesh): void {
        this._mesh = mesh;
    }

    public getMesh(): Mesh {
        return this._mesh;
    }

    public setMaterial(material: Material): void {
        this._material = material;
    }

    public getMaterial(): Material {
        return this._material;
    }

    public getRenderPass(): MaterialRenderPass {
        return this._material.getRenderPass();
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
            mesh: this._mesh,
            debugPass,
            ...overrides
        };
    }
}
