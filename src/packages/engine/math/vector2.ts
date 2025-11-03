export class Vector2 {
    constructor(public x: number, public y: number) {}

    add(v: Vector2): Vector2 {
        return new Vector2(this.x + v.x, this.y + v.y);
    }
    subtract(v: Vector2): Vector2 {
        return new Vector2(this.x - v.x, this.y - v.y);
    }
    multiply(scalar: number): Vector2 {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    clone(): Vector2 {
        return new Vector2(this.x, this.y);
    }
    copy(v: Vector2): void {
        this.x = v.x;
        this.y = v.y;
    }
    length(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);

    }
    normalize(): Vector2 {
        const len = this.length();
        if (len > 0) {
            return this.multiply(1 / len);
        }
        return this;
    }

    equals(v: Vector2): boolean {
        return this.x === v.x && this.y === v.y;
    }
    toString(): string {
        return `Vector2(${this.x}, ${this.y})`;
    }
}