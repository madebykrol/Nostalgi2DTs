import { Vector2 } from "../math";
import { Component } from "../world/component";
import type { BodyType } from "./bodyType";
import type { PhysicsBody } from "./body";
import { Actor } from "../world/actor";

export class PhysicsComponent extends Component {
    private body: PhysicsBody | null = null;
    private simulated = false;
    private bodyType: BodyType = "static";

    tick(_deltaTime: number, _engineNetworkMode: "client" | "server" | "singleplayer"): void {
        // Physics component does not tick by default.
    }

    setBody(body: PhysicsBody | null): void {
        this.body = body;
        if (!body) {
            return;
        }

        body.setBodyType(this.bodyType);
        body.setIsActive(this.simulated);
        const actor = this.getActor();
        if (actor) {
            const position = actor.getPosition();
            const rotation = actor.getRotation();
            body.setTransform(position, rotation);
        }
    }

    shouldCollideWith: (otherActor: Actor, component: PhysicsComponent) => boolean = (_other, _actor) => {
        return true;
    }

    getBody(): PhysicsBody | null {
        return this.body;
    }

    isSimulated(): boolean {
        return this.simulated;
    }

    getBodyType(): BodyType {
        return this.bodyType;
    }

    setSimulationState(simulated: boolean, type: BodyType = this.bodyType): void {
        this.simulated = simulated;
        this.bodyType = type;

        if (this.body) {
            this.body.setBodyType(type);
            this.body.setIsActive(simulated);
        }
    }

    setBodyType(type: BodyType): void {
        this.bodyType = type;
        if (this.body) {
            this.body.setBodyType(type);
        }
    }

    syncBodyTransform(position: Vector2, rotation: number): void {
        if (!this.body) {
            return;
        }
        this.body.setTransform(position, rotation);
    }

    addForce(force: Vector2): void {
        if (!this.simulated || !this.body) {
            return;
        }
        this.body.addForce(force);
    }

    addImpulse(impulse: Vector2): void {
        if (!this.simulated || !this.body) {
            return;
        }
        this.body.addImpulse(impulse);
    }
}