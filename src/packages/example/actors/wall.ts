import { actor, Actor, inject, PhysicsComponent, Vertex2, World } from "@nostalgi2d/engine";

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
  }
}
