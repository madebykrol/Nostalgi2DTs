import { Actor, PhysicsComponent, PolygonCollisionComponent, Vertex2 } from "@repo/engine";

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
