import { Actor, CircleCollisionComponent, PhysicsComponent } from "@repo/engine";
import { PolygonCollisionComponent } from "../../engine/world/circleCollisionComponent";

export class BombActor extends Actor {
    tick(_deltaTime: number): void {
        
    }

    constructor() {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent());
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new PolygonCollisionComponent([{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]);


        this.addComponent(collisionComponent);
    }
}


export class DemoActor extends Actor {
    
    constructor() {
        super();
        this.shouldTick = true;
        const physics = this.addComponent(new PhysicsComponent());
        physics.setSimulationState(true, "dynamic");

        const collisionComponent = new CircleCollisionComponent(0.5);
        
        this.addComponent(collisionComponent);
    }

    initialize(): void {
        console.log("DemoActor initialized with id:", this.getId());
    }

    tick(_deltaTime: number): void {
     
    }
}