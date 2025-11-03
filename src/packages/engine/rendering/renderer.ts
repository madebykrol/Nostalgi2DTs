import { Actor } from "..";
import { Camera } from "../camera/Camera";

export abstract class ActorRenderer<T extends Actor> {
    abstract render(actor: T, camera: Camera, gl: WebGL2RenderingContext, debugPhysics?: boolean): boolean;
    // Optional: Second-pass debug rendering overlay
    renderDebug?(actor: T, camera: Camera, gl: WebGL2RenderingContext): void;
}