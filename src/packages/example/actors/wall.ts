import { actor, Actor, inject, PhysicsComponent, PolygonCollisionComponent, Vertex2, World } from "@repo/engine";

@actor()
export class WallActor extends Actor {

  vertices: Vertex2[] | undefined;

  constructor(@inject(World) protected world: World) {
    super();
  }

  initialize(): void {
    const physicsComponent = new PhysicsComponent(this.world);
    physicsComponent.setSimulationState(true, "static");
    this.addComponent(physicsComponent);

    const collisionComponent = new PolygonCollisionComponent();
    collisionComponent.points = this.vertices || [];
    this.addComponent(collisionComponent);
  }
}
