import { inject, ResourceManager, Url } from "@repo/engine";
import { DOMParser } from "@xmldom/xmldom";

export type TiledMapOrientation = "orthogonal" | "isometric" | "staggered" | "hexagonal" | string;


export interface TiledTileLayer {
	id: number;
	name: string;
	width: number;
	height: number;
	opacity: number;
	visible: boolean;
	offsetX: number;
	offsetY: number;
	data: number[];
}

export interface TiledProperty {
	name: string;
	type?: string;
	value: unknown;
}

export interface TiledPoint {
	x: number;
	y: number;
}

export interface TiledObject {
	id: number;
	name: string | null;
	type: string | null;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	visible: boolean;
	gid?: number;
	properties: Record<string, unknown>;
	polygon?: TiledPoint[];
	polyline?: TiledPoint[];
	ellipse?: boolean;
	text?: string | null;
}

export interface TiledObjectLayer {
	id: number;
	name: string;
	color: string | null;
	opacity: number;
	visible: boolean;
	offsetX: number;
	offsetY: number;
	drawOrder: string | null;
	properties: Record<string, unknown>;
	objects: TiledObject[];
}

export interface TiledTilesetReference {
	firstGid: number;
	name: string;
	tileWidth: number;
	tileHeight: number;
	tileCount: number;
	columns: number;
	image?: {
		source: string;
		width: number;
		height: number;
		transparentColor?: string;
	};
}

export interface TiledMap {
	width: number;
	height: number;
	tileWidth: number;
	tileHeight: number;
	orientation: TiledMapOrientation;
	renderOrder?: string;
	nextLayerId?: number;
	nextObjectId?: number;
	properties: Record<string, unknown>;
	tileLayers: TiledTileLayer[];
	objectLayers: TiledObjectLayer[];
	tilesets: TiledTilesetReference[];
}

type XmlElement = Element;

export class Parser {

	constructor(@inject(ResourceManager) private resourceManager: ResourceManager, @inject(DOMParser) private parser: DOMParser) {
		console.log(resourceManager);
	}

	async parse(url: string): Promise<TiledMap> {

		if (!url) {
			throw new Error("A TMX url must be provided to the parser");
		}

		console.log("Parsing with parser:", this.parser);
		console.log("Using resource manager:", this.resourceManager);

		const xml = await this.loadSource(url);
		
		const doc = this.parser.parseFromString(xml, "application/xml");

		const mapElement = doc.getElementsByTagName("map")[0];
		if (!mapElement) {
			throw new Error("The provided TMX file does not contain a <map> element");
		}

		const tilesets = this.parseTilesets(mapElement);
		const tileLayers = this.parseTileLayers(mapElement);
		const objectLayers = this.parseObjectLayers(mapElement);
		const properties = this.parseProperties(mapElement.getElementsByTagName("properties")[0]);

		const width = this.getIntAttribute(mapElement, "width");
		const height = this.getIntAttribute(mapElement, "height");
		const tileWidth = this.getIntAttribute(mapElement, "tilewidth");
		const tileHeight = this.getIntAttribute(mapElement, "tileheight");
		const orientation = (mapElement.getAttribute("orientation") || "orthogonal") as TiledMapOrientation;

		return {
			width,
			height,
			tileWidth,
			tileHeight,
			orientation,
			renderOrder: mapElement.getAttribute("renderorder") || undefined,
			nextLayerId: this.getOptionalIntAttribute(mapElement, "nextlayerid"),
			nextObjectId: this.getOptionalIntAttribute(mapElement, "nextobjectid"),
			properties,
			tileLayers,
			objectLayers,
			tilesets,
		};
	}

	private async loadSource(target: string): Promise<string> {
		return await this.resourceManager.loadResource(target);
	}

	private parseTilesets(mapElement: XmlElement): TiledTilesetReference[] {
		const tilesetElements = Array.from(mapElement.getElementsByTagName("tileset"));
		return tilesetElements.map((tilesetEl) => {
			const imageElement = tilesetEl.getElementsByTagName("image")[0];
			return {
				firstGid: this.getIntAttribute(tilesetEl, "firstgid"),
				name: tilesetEl.getAttribute("name") || "",
				tileWidth: this.getIntAttribute(tilesetEl, "tilewidth"),
				tileHeight: this.getIntAttribute(tilesetEl, "tileheight"),
				tileCount: this.getIntAttribute(tilesetEl, "tilecount"),
				columns: this.getIntAttribute(tilesetEl, "columns"),
				image: imageElement
					? {
						source: imageElement.getAttribute("source") || "",
						width: this.getIntAttribute(imageElement, "width"),
						height: this.getIntAttribute(imageElement, "height"),
						transparentColor: imageElement.getAttribute("trans") || undefined,
					}
					: undefined,
			} satisfies TiledTilesetReference;
		});
	}

	private parseTileLayers(mapElement: XmlElement): TiledTileLayer[] {
		const layerElements = Array.from(mapElement.getElementsByTagName("layer"));
		return layerElements.map((layerEl) => {
			const dataElement = layerEl.getElementsByTagName("data")[0];
			const data = dataElement ? this.parseLayerData(dataElement) : [];
			return {
				id: this.getIntAttribute(layerEl, "id", this.getOptionalIntAttribute(layerEl, "id") ?? 0),
				name: layerEl.getAttribute("name") || "Unnamed Layer",
				width: this.getIntAttribute(layerEl, "width"),
				height: this.getIntAttribute(layerEl, "height"),
				opacity: this.getOptionalFloatAttribute(layerEl, "opacity", 1),
				visible: this.getOptionalBoolAttribute(layerEl, "visible", true),
				offsetX: this.getOptionalFloatAttribute(layerEl, "offsetx", 0),
				offsetY: this.getOptionalFloatAttribute(layerEl, "offsety", 0),
				data,
			};
		});
	}

	private parseLayerData(dataElement: XmlElement): number[] {
		const encoding = dataElement.getAttribute("encoding");
		if (encoding && encoding !== "csv") {
			throw new Error(`Unsupported TMX layer encoding: ${encoding}. Only CSV encoding is currently supported.`);
		}
		const csv = (dataElement.textContent || "").trim();
		if (!csv) {
			return [];
		}
		return csv
			.split(/\s*,\s*/)
			.map((value) => (value.length > 0 ? Number.parseInt(value, 10) : 0))
			.filter((value) => Number.isFinite(value));
	}

	private parseObjectLayers(mapElement: XmlElement): TiledObjectLayer[] {
		const objectLayers = Array.from(mapElement.getElementsByTagName("objectgroup"));
		return objectLayers.map((layerEl) => {
			const properties = this.parseProperties(layerEl.getElementsByTagName("properties")[0]);
			const objects = this.parseObjects(layerEl.getElementsByTagName("object"));
			return {
				id: this.getOptionalIntAttribute(layerEl, "id") ?? 0,
				name: layerEl.getAttribute("name") || "Unnamed Object Layer",
				color: layerEl.getAttribute("color"),
				opacity: this.getOptionalFloatAttribute(layerEl, "opacity", 1),
				visible: this.getOptionalBoolAttribute(layerEl, "visible", true),
				offsetX: this.getOptionalFloatAttribute(layerEl, "offsetx", 0),
				offsetY: this.getOptionalFloatAttribute(layerEl, "offsety", 0),
				drawOrder: layerEl.getAttribute("draworder"),
				properties,
				objects,
			};
		});
	}

	private parseObjects(objectElements: HTMLCollectionOf<XmlElement>): TiledObject[] {
		return Array.from(objectElements).map((objectEl) => {
			const properties = this.parseProperties(objectEl.getElementsByTagName("properties")[0]);
			const polygon = this.parsePoints(objectEl.getElementsByTagName("polygon")[0]);
			const polyline = this.parsePoints(objectEl.getElementsByTagName("polyline")[0]);
			const ellipse = !!objectEl.getElementsByTagName("ellipse")[0];
			const textElement = objectEl.getElementsByTagName("text")[0];
			const gidAttr = objectEl.getAttribute("gid");

			return {
				id: this.getOptionalIntAttribute(objectEl, "id") ?? 0,
				name: objectEl.getAttribute("name"),
				type: objectEl.getAttribute("type"),
				x: this.getOptionalFloatAttribute(objectEl, "x", 0),
				y: this.getOptionalFloatAttribute(objectEl, "y", 0),
				width: this.getOptionalFloatAttribute(objectEl, "width", 0),
				height: this.getOptionalFloatAttribute(objectEl, "height", 0),
				rotation: this.getOptionalFloatAttribute(objectEl, "rotation", 0),
				visible: this.getOptionalBoolAttribute(objectEl, "visible", true),
				gid: gidAttr ? Number.parseInt(gidAttr, 10) : undefined,
				properties,
				polygon,
				polyline,
				ellipse,
				text: textElement?.textContent || null,
			} satisfies TiledObject;
		});
	}

	private parsePoints(element: XmlElement | null): TiledPoint[] | undefined {
		if (!element) {
			return undefined;
		}
		const pointsAttr = element.getAttribute("points");
		if (!pointsAttr) {
			return undefined;
		}
		return pointsAttr
			.trim()
			.split(/\s+/)
			.map((pair) => {
				const [x, y] = pair.split(",");
				return {
					x: Number.parseFloat(x),
					y: Number.parseFloat(y),
				};
			})
			.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
	}

	private parseProperties(propertiesElement: Element | null): Record<string, unknown> {
		if (!propertiesElement) {
			return {};
		}

		const result: Record<string, unknown> = {};
		const propertyElements = Array.from(propertiesElement.getElementsByTagName("property"));
		for (const propertyEl of propertyElements) {
			const name = propertyEl.getAttribute("name");
			if (!name) {
				continue;
			}
			const type = propertyEl.getAttribute("type") || undefined;
			let value: unknown;
			if (propertyEl.hasAttribute("value")) {
				value = this.parsePropertyValue(propertyEl.getAttribute("value") || "", type);
			} else {
				value = this.parsePropertyValue(propertyEl.textContent?.trim() ?? "", type);
			}
			result[name] = value;
		}

		return result;
	}

	private parsePropertyValue(value: string, type?: string): unknown {
		switch (type) {
			case "int":
				return Number.parseInt(value, 10);
			case "float":
				return Number.parseFloat(value);
			case "bool":
				return value.toLowerCase() === "true" || value === "1";
			case "color":
			case "file":
			case "string":
			case undefined:
				return value;
			default:
				return value;
		}
	}

	private getIntAttribute(element: XmlElement, attribute: string, fallback?: number): number {
		const value = element.getAttribute(attribute);
		if (value === null || value === undefined || value === "") {
			if (fallback !== undefined) {
				return fallback;
			}
			throw new Error(`Required TMX attribute '${attribute}' is missing`);
		}
		return Number.parseInt(value, 10);
	}

	private getOptionalIntAttribute(element: XmlElement, attribute: string, defaultValue?: number): number | undefined {
		const value = element.getAttribute(attribute);
		if (value === null || value === undefined || value === "") {
			return defaultValue;
		}
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? defaultValue : parsed;
	}

	private getOptionalFloatAttribute(element: XmlElement, attribute: string, defaultValue: number): number {
		const value = element.getAttribute(attribute);
		if (value === null || value === undefined || value === "") {
			return defaultValue;
		}
		const parsed = Number.parseFloat(value);
		return Number.isNaN(parsed) ? defaultValue : parsed;
	}

	private getOptionalBoolAttribute(element: XmlElement, attribute: string, defaultValue: boolean): boolean {
		const value = element.getAttribute(attribute);
		if (value === null || value === undefined || value === "") {
			return defaultValue;
		}
		return value === "1" || value.toLowerCase() === "true";
	}
}