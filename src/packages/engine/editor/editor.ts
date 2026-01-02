import { Actor, Engine, getRegisteredPropertiesForInstance, GizmoActor, inject, injectable, Level, normalizeClassName, Property, RotationGizmoActor, ScalingGizmoActor, TranslationGizmoActor } from "@repo/engine";
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
        const serializedLevel = this.serializeLevelNode(level);
        return JSON.stringify(serializedLevel, null, 2);
    }

    private isPrimitive(value: unknown): value is string | number | boolean | null | Date {
        return value === null ||
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value instanceof Date;
    }

    private serializePropertyRecursive(owner: Object, prop: Property): SerializedProperty {
        const serializedProp = new SerializedProperty();
        serializedProp.key = typeof prop.key === "string" ? prop.key : String(prop.key);
        const value = this.getPropertyValue(owner, prop);
        const resolvedType = prop.type ?? (value && (value as any).constructor?.name) ?? "Object";
        serializedProp.type = normalizeClassName(resolvedType);

        if (this.isPrimitive(value)) {
            serializedProp.value = value as any;
            serializedProp.properties = null;
            serializedProp.node = null;
            return serializedProp;
        }

        if (Array.isArray(value)) {
            serializedProp.value = null;
            serializedProp.properties = value.map((entry, idx) => {
                const childProp = new SerializedProperty();
                childProp.key = String(idx);
                if (this.isPrimitive(entry)) {
                    childProp.type = normalizeClassName((entry as any)?.constructor?.name ?? "unknown");
                    childProp.value = entry as any;
                } else {
                    childProp.type = normalizeClassName((entry as any)?.constructor?.name ?? "Object");
                    childProp.properties = this.getPropertiesForInstance(entry ?? {}).map((p) => this.serializePropertyRecursive(entry as Object, p));
                    childProp.value = null;
                }
                return childProp;
            });
            return serializedProp;
        }

        // Object with registered properties
        const nestedProps = this.getPropertiesForInstance(value ?? {});
        serializedProp.properties = nestedProps.map((p) => this.serializePropertyRecursive(value, p));
        serializedProp.value = null;
        return serializedProp;
    }

    private serializeActor(actor: Actor): SerializedNode {
        const node = new SerializedNode();
        node.type = normalizeClassName(actor.constructor.name);
        node.value = null;
        node.properties = this.getPropertiesForInstance(actor).map((prop) => this.serializePropertyRecursive(actor, prop));
        node.children = actor.getChildren().map((child) => this.serializeActor(child as Actor));
        return node;
    }

    private serializeLevelNode(level: Level): SerializedLevel {
        const serializedLevel = new SerializedLevel();
        serializedLevel.type = normalizeClassName(level.constructor.name);
        serializedLevel.properties = this.getPropertiesForInstance(level).map((prop) => this.serializePropertyRecursive(level, prop));
        serializedLevel.actors = level.getActors().map((actor) => this.serializeActor(actor));
        return serializedLevel;
    }

    private deserializePropertyValue(serialized: SerializedProperty, container: any): any {
        if (serialized.value !== null) {
            return serialized.value;
        }

        if (!serialized.properties || serialized.properties.length === 0) {
            return null;
        }

        // Try to construct an instance from the container based on type; fall back to plain object
        let instance: any;
        try {
            instance = container.getByIdentifier(normalizeClassName(serialized.type ?? "Object"));
        } catch {
            instance = {};
        }

        for (const p of serialized.properties) {
            // Array entries are stored with numeric keys
            if (Number.isInteger(Number(p.key))) {
                const idx = Number(p.key);
                if (!Array.isArray(instance)) {
                    instance = [];
                }
                instance[idx] = this.deserializePropertyValue(p, container);
                continue;
            }

            const targetProp = this.getPropertiesForInstance(instance).find((pp) => pp.key === p.key);
            if (!targetProp) {
                continue;
            }
            const value = this.deserializePropertyValue(p, container);
            this.setPropertyValue(instance, targetProp, value);
        }

        return instance;
    }

    public deserializeLevel(levelData: string): Level | null {
        const container = this.engine.getContainer();
        try {
            const parsedData = JSON.parse(levelData) as SerializedLevel;
            const level = container.getByIdentifier(normalizeClassName(parsedData.type ?? "Level")) as Level;

            // Deserialize level properties recursively
            for (const prop of parsedData.properties) {
                const property = this.getPropertiesForInstance(level).find((p) => p.key === prop.key);
                if (!property) continue;
                const value = this.deserializePropertyValue(prop, container);
                this.setPropertyValue(level, property, value);
            }

            // If gameMode captured in serialized data, try to resolve it via type
            const gameModeEntry = parsedData.properties.find((p) => p.key === "gameMode" && typeof p.value === "string");
            if (gameModeEntry?.value) {
                const gmType = container.getTypeForIdentifier(gameModeEntry.value as string) as (new () => unknown) | undefined;
                level.gameMode = gmType as any;
            }

            // Deserialize actors
            for (const actorNode of parsedData.actors) {
                const actor = container.getByIdentifier(normalizeClassName(actorNode.type ?? "Actor")) as Actor;
                // Deserialize actor properties
                for (const prop of actorNode.properties) {
                    const property = this.getPropertiesForInstance(actor).find((p) => p.key === prop.key);
                    if (!property) continue;    
                    const value = this.deserializePropertyValue(prop, container);
                    this.setPropertyValue(actor, property, value);
                }
                level.addChild(actor);
            }

            return level;
        } catch (error) {
            console.error("Failed to parse level data:", error);
            return null;
        }
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
        const parent = this.engine.getEditorRoot();

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

