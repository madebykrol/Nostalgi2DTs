import { Actor, Engine, getRegisteredProperties, getRegisteredPropertiesForInstance, GizmoActor, inject, injectable, Level, normalizeClassName, Property, RotationGizmoActor, ScalingGizmoActor, TranslationGizmoActor } from "@repo/engine";
import { EditorPluginManifestEntry, EditorUIPlugin } from "./";
import { SerializedNode, SerializedProperty } from "../serialization";

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

    public getPropertiesForInstance(actor: Object): Property[] {
        return getRegisteredPropertiesForInstance(actor);
    }

    public getPropertyValue(actor: Object, property: Property): any {
        return Reflect.get(actor, property.key);
    }

    public setPropertyValue(actor: Object, property: Property, value: any): void {
        Reflect.set(actor, property.key, value);
    }

    public serializeLevel<T extends Level>(level: T): string {
        // First we create a new structure that is safe to 
        var levelProperties = this.getPropertiesForInstance(level);
        console.log(`Level has ${levelProperties.length} registered properties.`);
        for(const levelProperty of levelProperties) {
            const propertyValue = this.getPropertyValue(level, levelProperty);
            console.log(`Level Property: ${String(levelProperty.key)}, value = ${propertyValue}`);

            const levelPropertyProperties = this.getPropertiesForInstance(levelProperty);
            console.log(`-- Property has ${levelPropertyProperties.length} registered properties.`);
            for(const propProperty of levelPropertyProperties) {
                const propPropertyValue = this.getPropertyValue(levelProperty, propProperty);
                console.log(`---- Level Property Property: ${String(propProperty.key)}, value = ${propPropertyValue}`);
            }
        }

        for(const actor of level.getActors()) {
            const actorProperties = this.getPropertiesForInstance(actor);
            console.log(`Actor ${actor.getId()} has ${actorProperties.length} registered properties.`);
            for(const actorProperty of actorProperties) {
                const propertyValue = this.getPropertyValue(actor, actorProperty);
                console.log(`Actor Property: ${String(actorProperty.key)}, value = ${propertyValue}`);
            }
        }

        const serializedLevel = new SerializedLevel();
        serializedLevel.properties = levelProperties.map(prop => {
            const serializedProp = new SerializedProperty();
            serializedProp.key = typeof prop.key === "string" ? prop.key : String(prop.key);
            serializedProp.type = normalizeClassName(prop.type ?? "unknown");
            return serializedProp;
        });
        serializedLevel.type = normalizeClassName(level.constructor.name);
        
        for(const actor of level.getActors()) {
            const actorNode = new SerializedNode();
            actorNode.type = normalizeClassName(actor.constructor.name);
            serializedLevel.actors.push(actorNode);
        }

        return JSON.stringify(serializedLevel, null, 2);
    }

    protected recursiveSerializeProperty(prop: Property, value: any): SerializedProperty {
        const serializedProp = new SerializedProperty();
        serializedProp.key = typeof prop.key === "string" ? prop.key : String(prop.key);
        serializedProp.type = normalizeClassName(prop.type ?? "unknown");
        value = this.getPropertyValue(value, prop);
        return serializedProp;
    }

    public deserializeLevel(levelData: string): Level | null {
        var parsedData: SerializedNode;
        try {
            parsedData = JSON.parse(levelData) as SerializedNode;
            const level = this.engine.getContainer().getByIdentifier(normalizeClassName(parsedData.type ?? "Level")) as Level;
            const gameMode = this.engine.getContainer().getTypeForIdentifier(parsedData.properties.find(p => p.key === "gameMode")?.value as string) as (new () => unknown) | undefined;
            console.log(`Deserialized level of type ${parsedData.type}`);
            level.gameMode = gameMode as any;
            return level;
        } catch (error) {
            console.error("Failed to parse level data:", error);
            return null;
        }

        return null;
    }

    public loadEnabledEditorPlugins = async (): Promise<EditorUIPlugin[]> => {
        const entries = this.editorPluginManifest.filter((entry) => entry.enabled !== false);
        const plugins: EditorUIPlugin[] = [];

        for (const entry of entries) {
            try {
            const module = (await import(/* @vite-ignore */ entry.entrypoint)) as Record<string, EditorUIPlugin | undefined>;
            const exportName = entry.exportName ?? "default";
            const plugin = module[exportName];

            if (!plugin) {
                console.warn(`Editor plugin "${entry.id}" failed to load export "${exportName}" from ${entry.entrypoint}`);
                continue;
            }

            plugins.push(plugin);
            } catch (error) {
            console.error(`Failed to load editor plugin module "${entry.id}" from ${entry.entrypoint}`, error);
            }
        }

        return plugins;
        };


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

        this.engine.getWorld().despawnActor(this.activeGizmoActor);
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
        const parent = this.engine.getRootObject();

        // Ensure the gizmo lives under the engine root so it gets ticked and rendered.
        if (actor.getParent() !== parent) {
            parent.addChild(actor);
        }

        if (actor.getWorld() && actor.isSpawned) {
            return;
        }

        await this.engine.getWorld().spawnActorInstance(actor, parent);
    }

    private async ensureGizmoInstance<T extends GizmoActor>(ctor: new () => T): Promise<T> {
        if (!(this.activeGizmoActor instanceof ctor)) {
            if (this.activeGizmoActor) {
                this.engine.getWorld().despawnActor(this.activeGizmoActor);
            }
            this.activeGizmoActor = new ctor();
        }

        const gizmo = this.activeGizmoActor as T;
        await this.spawnIfNeeded(gizmo);
        return gizmo;
    }

}



export class SerializedLevel {
    type: string|null = null;
    properties: SerializedProperty[] = [];
    actors: SerializedNode[] = [];
}

