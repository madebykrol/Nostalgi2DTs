import { Actor } from "../world";
import { Vector2 } from "../math";

// Simple uniform grid spatial partition good for broad-phase culling & queries.
// Cell size should approximate typical actor size or slightly larger.

export interface SpatialQueryResult {
    actors: Actor[];
}

export class SpatialGrid {
    private cellSize: number;
    // key format: `${gx},${gy}`
    private cells: Map<string, Set<Actor>> = new Map();
    private actorCell: Map<Actor, string> = new Map();

    constructor(cellSize: number = 10) {
        this.cellSize = cellSize;
    }

    clear(): void {
        this.cells.clear();
        this.actorCell.clear();
    }

    private key(gx: number, gy: number): string { return gx + "," + gy; }

    private worldToGrid(pos: Vector2): { gx: number; gy: number } {
        return {
            gx: Math.floor(pos.x / this.cellSize),
            gy: Math.floor(pos.y / this.cellSize)
        };
    }

    insert(actor: Actor): void {
        const pos = actor.getPosition();
        const { gx, gy } = this.worldToGrid(pos);
        const k = this.key(gx, gy);
        let bucket = this.cells.get(k);
        if (!bucket) {
            bucket = new Set();
            this.cells.set(k, bucket);
        }
        bucket.add(actor);
        this.actorCell.set(actor, k);
    }

    remove(actor: Actor): void {
        const k = this.actorCell.get(actor);
        if (!k) return;
        const bucket = this.cells.get(k);
        if (bucket) {
            bucket.delete(actor);
            if (bucket.size === 0) this.cells.delete(k);
        }
        this.actorCell.delete(actor);
    }

    update(actor: Actor): void {
        const pos = actor.getPosition();
        const { gx, gy } = this.worldToGrid(pos);
        const newKey = this.key(gx, gy);
        const oldKey = this.actorCell.get(actor);
        if (oldKey === newKey) return; // still same cell
        // move
        if (oldKey) {
            const oldBucket = this.cells.get(oldKey);
            if (oldBucket) {
                oldBucket.delete(actor);
                if (oldBucket.size === 0) this.cells.delete(oldKey);
            }
        }
        let newBucket = this.cells.get(newKey);
        if (!newBucket) {
            newBucket = new Set();
            this.cells.set(newKey, newBucket);
        }
        newBucket.add(actor);
        this.actorCell.set(actor, newKey);
    }

    // Query all actors potentially intersecting an AABB.
    queryAABB(min: Vector2, max: Vector2): SpatialQueryResult {
        const minCell = this.worldToGrid(min);
        const maxCell = this.worldToGrid(max);
        const result: Actor[] = [];
        for (let gx = minCell.gx; gx <= maxCell.gx; gx++) {
            for (let gy = minCell.gy; gy <= maxCell.gy; gy++) {
                const bucket = this.cells.get(this.key(gx, gy));
                if (!bucket) continue;
                bucket.forEach(a => result.push(a));
            }
        }
        return { actors: result };
    }

    // Brute helper for debugging counts
    getCellCount(): number { return this.cells.size; }
    getActorCount(): number { return this.actorCell.size; }
}
