export class Frustum {
    containsBounds(actorBounds: { min: { x: number; y: number; }; max: { x: number; y: number; }; }): boolean {
        return (
            actorBounds.min.x >= this.left &&
            actorBounds.min.y >= this.bottom &&
            actorBounds.max.x <= this.right &&
            actorBounds.max.y <= this.top
        );
    }
    constructor(public near: number, public far: number, public left: number, public right: number, public top: number, public bottom: number) {
    }
}