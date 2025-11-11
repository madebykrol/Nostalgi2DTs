import { Actor, ActorRenderer, Camera, PhysicsComponent, PolygonCollisionComponent, Vertex2 } from "@repo/engine";

export class WallActor extends Actor {

  vertices: Vertex2[] | undefined;

  constructor(){
    super();
  }

  initialize(): void {
    const physicsComponent = new PhysicsComponent();
    physicsComponent.setSimulationState(true, "static");
    this.addComponent(physicsComponent);

    const collisionComponent = new PolygonCollisionComponent(this.vertices ? this.vertices : []);
    this.addComponent(collisionComponent);
  }
  
}

export class WallActorRenderer extends ActorRenderer<WallActor> {
  render(_actor: WallActor, _camera: Camera, _gl: WebGL2RenderingContext, _debugPhysics?: boolean): boolean {
    return true;
  }

}
