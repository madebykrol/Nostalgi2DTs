import { Actor, Container, getRegisteredPropertiesForInstance, inject, injectable, Level, normalizeClassName, Property } from "..";
import { SerializedProperty } from "../serialization";
import { SerializedLevel } from "./level";

@injectable()
export class LevelParser {

    /**
     *
     */
    constructor(@inject(Container) protected container: Container) {
        
    }

    public deserializeLevel(levelData: string, levelProperties: any = {}): Level | null {
        const container = this.container;
        try {
            const parsedData = JSON.parse(levelData) as SerializedLevel;
            const levelIdentifier = normalizeClassName(parsedData.type ?? "Level");
            const level = container.getByIdentifier<Level>(levelIdentifier);
            if (!level) {
                throw new Error(`deserializeLevel: unknown level type \"${levelIdentifier}\"`);
            }

            // Deserialize level properties recursively
            for (const prop of parsedData.properties) {
                const property = this.getPropertiesForInstance(level).find((p) => p.key === prop.key);
                if (!property) continue;
                const value = this.deserializePropertyValue(prop, container);
                if(prop.key != null) {
                    this.setPropertyValue(level, property, levelProperties[prop.key] ?? value);
                } else {
                    this.setPropertyValue(level, property, value);
                }
            }

            // If gameMode captured in serialized data, try to resolve it via type
            const gameModeEntry = parsedData.properties.find((p) => p.key === "gameMode" && typeof p.value === "string");
            if (gameModeEntry?.value) {
                const gmType = container.getTypeForIdentifier(gameModeEntry.value as string) as (new () => unknown) | undefined;
                level.gameMode = gmType as any;
            }

            // Deserialize actors
            for (const actorNode of parsedData.actors) {
                const actorIdentifier = normalizeClassName(actorNode.type ?? "Actor");
                const actor = container.getByIdentifier<Actor>(actorIdentifier);
                if (!actor) {
                    console.warn(`deserializeLevel: unknown actor type \"${actorIdentifier}\" – skipping`, actorNode);
                    continue;
                }
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

    private deserializePropertyValue(serialized: SerializedProperty, container: any): any {
        if (serialized.type === "Type" && typeof serialized.value === "string") {
            try {
                return container.getTypeForIdentifier(serialized.value) ?? null;
            } catch {
                return null;
            }
        }

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

    public getPropertiesForInstance(actor: Object): Property[] {
            return getRegisteredPropertiesForInstance(actor);
        }
    
        public getPropertyValue(actor: Object, property: Property): any {
            return Reflect.get(actor, property.key);
        }
    
        public setPropertyValue(actor: Object, property: Property, value: any): void {
            Reflect.set(actor, property.key, value);
        }
    
}