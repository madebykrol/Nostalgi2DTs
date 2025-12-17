import type { Camera } from "../camera";
import type { Actor } from "../world";
import { Material, type MaterialRenderPass } from "./material";

/**
 * Base class for full-screen post-processing materials. These materials run
 * after the forward pass and receive the captured scene texture through the
 * material render context.
 */
export abstract class PostProcessMaterial extends Material {
    public override getRenderPass(): MaterialRenderPass {
        return "postprocess";
    }
    
    /**
     * Optional hook invoked before rendering to pass scene metadata (actors,
     * camera, and dimensions). Subclasses can override to upload uniforms.
     */
    public prepare(
        _gl: WebGL2RenderingContext,
        _camera: Camera,
        _actors: Actor[],
        _sceneSize: { width: number; height: number }
    ): void {
        // Default no-op.
    }
}
