import { Actor, Engine, GizmoActor, inject, injectable, RotationGizmoActor, ScalingGizmoActor, TranslationGizmoActor } from "@repo/engine";
import { EditorPluginManifestEntry } from "./";

export type GizmoType = "translation" | "rotation" | "scaling";

type SelectionController = {
    selectActors(actors: Actor[], focus?: Actor | null): void;
};
@injectable()

export class Editor {

    private activeGizmoActor: GizmoActor | null = null;
    private selectionController: SelectionController | null = null;
    private currentSelection: Actor[] = [];
    private editorPluginManifest: EditorPluginManifestEntry[] = [];

    eventListeners: Map<string, Set<Function>> = new Map();

    /**
     *
     */
    constructor(@inject(Engine<unknown, unknown>) private readonly engine: Engine<unknown, unknown>) {
    }

    public emit(event: string, data: any): void {
        this.eventListeners.get(event.toLowerCase().trim())?.forEach((listener) => listener(data));
    }

    public registerPlugin(plugin: EditorPluginManifestEntry): void {
        this.editorPluginManifest.push(plugin);
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

    public hideGizmo(): void {
        if (!this.activeGizmoActor) {
            return;
        }

        this.engine.despawnActor(this.activeGizmoActor);
        this.activeGizmoActor = null;
    }

    public async displayRotationGizmo(selectedActors: Actor[]): Promise<void> {
        if (selectedActors.length === 0) {
            this.hideGizmo();
            return;
        }

        const gizmo = await this.ensureGizmoInstance(RotationGizmoActor);
        gizmo.setTargetActors(selectedActors);
    }

    public async displayTranslationGizmo(selectedActors: Actor[]): Promise<void> {
        if (selectedActors.length === 0) {
            this.hideGizmo();
            return;
        }

        const gizmo = await this.ensureGizmoInstance(TranslationGizmoActor);
        gizmo.setTargetActors(selectedActors);
    }

    public async displayScalingGizmo(selectedActors: Actor[]): Promise<void> {
        if (selectedActors.length === 0) {
            this.hideGizmo();
            return;
        }

        const gizmo = await this.ensureGizmoInstance(ScalingGizmoActor);
        gizmo.setTargetActors(selectedActors);
    }
    
    public setCursor(cursor: string): void {
        window.document.body.style.cursor = cursor;
    }

    public registerSelectionController(controller: SelectionController): void {
        this.selectionController = controller;
    }

    public unregisterSelectionController(controller: SelectionController): void {
        if (this.selectionController === controller) {
            this.selectionController = null;
        }
    }

    public updateSelectionSnapshot(selection: Actor[]): void {
        this.currentSelection = [...selection];
    }

    public getSelectedActors(): Actor[] {
        return [...this.currentSelection];
    }

    public selectActors(actors: Actor[], focus?: Actor | null): void {
        const uniqueActors = Array.from(new Set(actors));
        const preferredFocus = focus ?? uniqueActors[0] ?? null;

        if (!this.selectionController) {
            if (uniqueActors.length === 0) {
                this.hideGizmo();
            }
            this.updateSelectionSnapshot(uniqueActors);
            this.emit("actor:selected", preferredFocus ?? null);
            return;
        }

        this.selectionController.selectActors(uniqueActors, preferredFocus);
    }

    private async spawnIfNeeded(actor: GizmoActor): Promise<void> {
        if (actor.getWorld()) {
            return;
        }
        
        if (actor.isSpawned)
            return;

        this.engine.spawnActorInstance(actor);
    }

    private async ensureGizmoInstance<T extends GizmoActor>(ctor: new () => T): Promise<T> {
        if (!(this.activeGizmoActor instanceof ctor)) {
            if (this.activeGizmoActor) {
                this.engine.despawnActor(this.activeGizmoActor);
            }
            this.activeGizmoActor = new ctor();
        }

        const gizmo = this.activeGizmoActor as T;
        await this.spawnIfNeeded(gizmo);
        return gizmo;
    }

}