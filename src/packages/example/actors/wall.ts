import { actor, Actor, PhysicsComponent, PolygonCollisionComponent, Vertex2 } from "@repo/engine";

@actor()
export class WallActor extends Actor {

  vertices: Vertex2[] | undefined;

  constructor(){
    super();
  }

  initialize(): void {
    const physicsComponent = new PhysicsComponent();
    physicsComponent.setSimulationState(true, "static");
    this.addComponent(physicsComponent);

    const collisionComponent = new PolygonCollisionComponent();
    collisionComponent.points = this.vertices || [];
    this.addComponent(collisionComponent);
  }
}
