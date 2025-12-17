import { Actor, Constructor, Container, Engine, GizmoActor, RotationGizmoActor, ScalingGizmoActor, TranslationGizmoActor, Vector2 } from "@repo/engine";

export type GizmoType = "translation" | "rotation" | "scaling";

export class Editor {

    private activeGizmoActor: GizmoActor | null = null;

    eventListeners: Map<string, Set<Function>> = new Map();

    /**
     *
     */
    constructor(private readonly engine: Engine<unknown, unknown>) {
    }

    public emit(event: string, data: any): void {
        this.eventListeners.get(event.toLowerCase().trim())?.forEach((listener) => listener(data));
    }

    public subscribe(event: string, listener: Function): void {
        const key = event.toLowerCase().trim();
        if (!this.eventListeners.has(key)) {
            this.eventListeners.set(key, new Set());
        }
        this.eventListeners.get(key)?.add(listener);
    }

    public unsubscribe(event: string, listener: Function): void {
        this.eventListeners.get(event.toLowerCase().trim())?.delete(listener);
    }

    public initialize(): void {
    }

    public getActiveGizmo(): GizmoActor | null {
        return this.activeGizmoActor;
    }

    public async displayGizmo(selectedActors: Actor[], gizmo: GizmoActor): Promise<void> {

        if (selectedActors.length === 0) {
            return;
        }

        if (!this.activeGizmoActor)
            return;

        this.activeGizmoActor.setTargetActors(selectedActors);
        await this.spawnIfNeeded(this.activeGizmoActor);
    }      

    public hideGizmo(): void {
        if (!this.activeGizmoActor) {
            return;
        }

        this.engine.despawnActor(this.activeGizmoActor);
    }

    public async displayRotationGizmo(selectedActors: Actor[]): Promise<void> {
        if (this.activeGizmoActor instanceof RotationGizmoActor && this.activeGizmoActor.isSpawned) {
            return;
        }

        this.activeGizmoActor = new RotationGizmoActor();
        await this.spawnIfNeeded(this.activeGizmoActor);
    }

    public async displayTranslationGizmo(selectedActors: Actor[]): Promise<void> {
        if (this.activeGizmoActor instanceof TranslationGizmoActor && this.activeGizmoActor.isSpawned) {
            return;
        }   
        this.activeGizmoActor = new TranslationGizmoActor();
        await this.spawnIfNeeded(this.activeGizmoActor);
    }

    public async displayScalingGizmo(selectedActors: Actor[]): Promise<void> {
        if (this.activeGizmoActor instanceof ScalingGizmoActor && this.activeGizmoActor.isSpawned) {
            return;
        }
        this.activeGizmoActor = new ScalingGizmoActor();
        await this.spawnIfNeeded(this.activeGizmoActor);
    }


    private async spawnIfNeeded(actor: GizmoActor): Promise<void> {
        if (actor.getWorld()) {
            return;
        }
        
        if (actor.isSpawned)
            return;

        this.engine.spawnActorInstance(actor);
    }

}