import { Actor, Vector2, property, Engine } from "@nostalgi2d/engine";
import { Parser, TiledMap, type TiledObject, TiledObjectLayer } from "./parser";

export interface TileMapActorOptions {
    worldUnitsPerPixel?: number;
    worldUnitsPerTile?: number;
    spawnObjects?: boolean;
    objectActorFactory?: (context: {
        tileMap: TileMapActor;
        layer: TiledObjectLayer;
        object: TiledObject;
        index: number;
        defaultActor: Actor;
    }) => Actor | Actor[] | null | undefined;
}

export class TileMapObjectActor extends Actor {
    constructor(
        public readonly objectData: TiledObject,
        public readonly layerName: string
    ) {
        super();
        this.shouldTick = false;
    }
}

export class WaterActor extends Actor {
    constructor() {
        super();
        this.shouldTick = true;
    }
}

export class TileMapActor extends Actor {
    private mapData: TiledMap | null = null;
    private objectActorsCreated = false;
    private worldUnitsPerPixel: number | null = null;
    private options: TileMapActorOptions;
    private normalizedMapUrl: string | null = null;
    private basePath: string | null = null;
    private isRemote: boolean | null = null;

    private mapWorldSize: Vector2 | null = null;
    private renderTranslation: Vector2 = new Vector2(0, 0);
    private _mapUrl: string = "";

    constructor(
        private readonly parser: Parser,
        protected readonly engine: Engine,
        options: TileMapActorOptions = {}
    ) {
        super();
        this.shouldTick = false;
        this.options = options;

        console.log(parser);
    }

   
    public get mapUrl(): string {
        return this._mapUrl;
    }

    @property
    public set mapUrl(map: string) {
        this._mapUrl = map;
        this.normalizedMapUrl = this._mapUrl.replace(/\\/g, "/");
        this.basePath = this.computeBasePath(this.normalizedMapUrl);
        this.isRemote = this.isRemoteUrl(this._mapUrl);
    }

    async onLoad(): Promise<void> {
        
        if (this.mapData) {
            return;
        }

        this.mapData = await this.parser.parse(this._mapUrl);
        this.worldUnitsPerPixel = this.computeWorldUnitsPerPixel();
        this.updateWorldSize();
    }

    onBeginPlay(): void {
        
            this.createObjectActors();
        
    }

    getMap(): TiledMap | null {
        return this.mapData;
    }

    getWorldUnitsPerPixel(): number {
        if (this.worldUnitsPerPixel !== null) {
            return this.worldUnitsPerPixel;
        }
        return 1;
    }

    getWorldSize(): Vector2 | null {
        return this.mapWorldSize ? this.mapWorldSize.clone() : null;
    }

    getWorldCenter(): Vector2 {
        if (!this.mapWorldSize) {
            return new Vector2(0, 0);
        }
        return new Vector2(this.mapWorldSize.x / 2, -(this.mapWorldSize.y / 2));
    }

    getRenderTranslation(): Vector2 {
        return this.renderTranslation.clone();
    }

    getWorldBounds(): { min: Vector2; max: Vector2 } | null {
        if (!this.mapWorldSize) {
            return null;
        }
        const origin = this.position;
        const topLeft = new Vector2(origin.x + this.renderTranslation.x, origin.y + this.renderTranslation.y);
        const min = new Vector2(topLeft.x, topLeft.y - this.mapWorldSize.y);
        const max = new Vector2(topLeft.x + this.mapWorldSize.x, topLeft.y);
        return { min, max };
    }

    private computeWorldUnitsPerPixel(): number {
        if (!this.mapData) {
            return 1;
        }

        if (this.options.worldUnitsPerPixel !== undefined) {
            return this.options.worldUnitsPerPixel;
        }

        if (this.options.worldUnitsPerTile !== undefined) {
            const divisor = this.mapData.tileWidth || 1;
            return this.options.worldUnitsPerTile / divisor;
        }

        const divisor = this.mapData.tileWidth || 1;
        return 1 / divisor;
    }

    resolveResourcePath(resource: string): string {
        if (!resource) {
            return resource;
        }

        if (/^(?:[a-z]+:)?\/\//i.test(resource)) {
            return resource;
        }

        if (resource.startsWith("/")) {
            if (this.isRemote) {
                try {
                    return new URL(resource, this._mapUrl).toString();
                } catch {
                    return resource;
                }
            }
            return resource;
        }

        if (this.isRemote) {
            try {
                return new URL(resource, this._mapUrl).toString();
            } catch {
                return `${this.basePath}${resource}`;
            }
        }

        return this.basePath ? `${this.basePath}${resource}` : resource;
    }

    tick(): void {
        // Tile map actors do not tick by default.
    }

    private computeBasePath(source: string): string {
        const slashIndex = source.lastIndexOf("/");
        if (slashIndex === -1) {
            return "";
        }
        return source.substring(0, slashIndex + 1);
    }

    private isRemoteUrl(value: string): boolean {
        try {
            const parsed =  new URL(value);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
            return false;
        }
    }

    private updateWorldSize(): void {
        if (!this.mapData) {
            this.mapWorldSize = null;
            this.renderTranslation = new Vector2(0, 0);
            return;
        }

        const scale = this.getWorldUnitsPerPixel();
        const width = this.mapData.width * this.mapData.tileWidth * scale;
        const height = this.mapData.height * this.mapData.tileHeight * scale;
        this.mapWorldSize = new Vector2(width, height);
        this.renderTranslation = new Vector2(-width / 2, height / 2);
    }

    private createObjectActors(): void {
        if (!this.mapData || this.objectActorsCreated) {
            return;
        }

        for (const layer of this.mapData.objectLayers) {
            const layerHandled = this.handleLayer(layer);
            if (layerHandled) continue;
            this.handleLayerInternal(layer);
        }

        this.objectActorsCreated = true;
    }


    protected handleLayer(_layer: TiledObjectLayer): boolean {
        return false;
    }

    private handleLayerInternal(layer: TiledObjectLayer): void {
        if (!layer.visible || layer.objects.length === 0) {
            return;
        }

        console.log("Creating actors for layer:", layer.name);
        const scale = this.getWorldUnitsPerPixel();

        layer.objects.forEach((object, _index) => {
            let actorsToAdd: Actor[] = [];
            try {
                if(object.properties.Type) {
                    const createdActor = this.engine.createObjectFromIdentifier<Actor>(object.properties.Type as string, object.id.toString());
                    console.log("Created actor from container for type:", object.properties.Type, createdActor);
                    actorsToAdd.push(createdActor);
                }
                
            } catch (e) {
                console.error(`Error creating actor for object of type '${object.properties.Type}':`, e);
                return;
            }
            
            if (actorsToAdd.length === 0) {
                return;
            }

            const posX = (object.x + (layer.offsetX ?? 0)) * scale;
            const posY = -((object.y + (layer.offsetY ?? 0)) * scale);
            const rotation = object.rotation * (Math.PI / 180);

            actorsToAdd.forEach((actorToAdd) => {
                const localX = posX + this.renderTranslation.x;
                const localY = posY + this.renderTranslation.y;
                actorToAdd.position = new Vector2(localX, localY);
                actorToAdd.rotation = rotation;
                this.addChild(actorToAdd);
            });
        });
    }

    protected normalizeFactoryResult(
        factoryResult: Actor | Actor[] | null | undefined,
        defaultActor: Actor
    ): Actor[] {
        if (factoryResult === undefined) {
            return [defaultActor];
        }
        if (factoryResult === null) {
            return [];
        }
        if (Array.isArray(factoryResult)) {
            return factoryResult.filter((actor): actor is Actor => actor instanceof Actor);
        }
        return [factoryResult];
    }

    protected getObjectBaseName(layer: TiledObjectLayer, object: TiledObject, index: number): string {
        if (object.name && object.name.trim().length > 0) {
            return object.name.trim();
        }
        if (object.type && object.type.trim().length > 0) {
            return `${layer.name}_${object.type.trim()}`;
        }
        return `${layer.name}_object_${object.id || index}`;
    }

    protected makeUniqueName(baseName: string, usedNames: Set<string>): string {
        let candidate = baseName;
        let suffix = 1;
        while (usedNames.has(candidate)) {
            candidate = `${baseName}_${suffix++}`;
        }
        return candidate;
    }
}