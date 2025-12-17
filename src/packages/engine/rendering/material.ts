import { Shader } from "./shader";
import { Actor } from "../world";
import { Camera } from "../camera/Camera";
import { Mesh } from "./mesh";

export type MaterialRenderPass = "forward" | "postprocess";

export interface MaterialRenderContext {
    actor: Actor;
    camera: Camera;
    gl: WebGL2RenderingContext;
    mesh: Mesh;
    /** Optional flag to indicate whether this render pass is a debug overlay. */
    debugPass?: boolean;
    /**
     * Scene color texture captured during the forward pass. Only present during
     * post-processing renders so materials can sample the pre-composited frame.
     */
    sceneTexture?: WebGLTexture;
    /** Width/height of the captured scene texture when available. */
    sceneTextureSize?: { width: number; height: number };
}

export abstract class Material {
    public shader?: Shader;

    constructor(shader?: Shader) {
        this.shader = shader;
    }

    public readonly _tick = (deltaTime: number): void => {
        this.tick(deltaTime);
    };

    public tick(_deltaTime: number): void {
        // Optional per-frame update logic for the material.
    }

    public getRenderPass(): MaterialRenderPass {
        return "forward";
    }

    public abstract compile(gl: WebGL2RenderingContext): void;

    public abstract render(context: MaterialRenderContext): void;

    public renderDebug?(_context: MaterialRenderContext): void;

    public renderHighlight?(_context: MaterialRenderContext, _color?: [number, number, number, number]): void;
}