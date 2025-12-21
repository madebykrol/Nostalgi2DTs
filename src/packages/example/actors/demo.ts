import { Actor, CircleCollisionComponent, MeshComponent, PhysicsComponent, Quad } from "@repo/engine";
import { UnlitMaterial } from "@repo/basicrenderer";
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
        const material = new UnlitMaterial();
        material.setColor([0.2, 0.7, 0.2, 1.0]);
        this.addComponent(new MeshComponent(new Quad(), material));
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
        const material = new UnlitMaterial();
        material.setColor([0.9, 0.25, 0.25, 1.0]);
        this.addComponent(new MeshComponent(new Quad(), material));
    }

    initialize(): void {
        console.log("DemoActor initialized with id:", this.getId());
    }

    tick(_deltaTime: number): void {
     
    }
}