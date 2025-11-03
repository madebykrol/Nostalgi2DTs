import { Url } from "@repo/engine";

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
	constructor(
		private readonly domParserFactory: () => DOMParser = () => {
			if (typeof DOMParser === "undefined") {
				throw new Error("DOMParser is not available in the current environment");
			}
			return new DOMParser();
		}
	) {}

	async parse(url: string): Promise<TiledMap> {
		if (!url) {
			throw new Error("A TMX url must be provided to the parser");
		}

		const xml = await this.loadSource(url);
		const parser = this.domParserFactory();
		const doc = parser.parseFromString(xml, "application/xml");

		const mapElement = doc.querySelector("map");
		if (!mapElement) {
			throw new Error("The provided TMX file does not contain a <map> element");
		}

		const tilesets = this.parseTilesets(mapElement);
		const tileLayers = this.parseTileLayers(mapElement);
		const objectLayers = this.parseObjectLayers(mapElement);
		const properties = this.parseProperties(mapElement.querySelector("properties"));

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
		if (Url.isValidUrl(target)) {
			return this.fetchText(target);
		}

		if (target.startsWith("file://")) {
			return this.readFileFromUrl(target);
		}

		if (typeof window !== "undefined") {
			return this.fetchText(target);
		}

		return this.readFileFromDisk(target);
	}

	private async fetchText(target: string): Promise<string> {
		const response = await fetch(target);
		if (!response.ok) {
			throw new Error(`Failed to fetch TMX map from ${target}: ${response.status} ${response.statusText}`);
		}
		return response.text();
	}

	private async readFileFromUrl(fileUrl: string): Promise<string> {
		const urlModule = await import("node:url");
		const fs = await import("node:fs/promises");
		const filePath = urlModule.fileURLToPath(fileUrl);
		return fs.readFile(filePath, "utf-8");
	}

	private async readFileFromDisk(target: string): Promise<string> {
		const fs = await import("node:fs/promises");
		const path = await import("node:path");
		const absolutePath = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
		return fs.readFile(absolutePath, "utf-8");
	}

	private parseTilesets(mapElement: XmlElement): TiledTilesetReference[] {
		const tilesetElements = Array.from(mapElement.querySelectorAll("tileset"));
		return tilesetElements.map((tilesetEl) => {
			const imageElement = tilesetEl.querySelector("image");
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
		const layerElements = Array.from(mapElement.querySelectorAll("layer"));
		return layerElements.map((layerEl) => {
			const dataElement = layerEl.querySelector("data");
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
		const objectLayers = Array.from(mapElement.querySelectorAll("objectgroup"));
		return objectLayers.map((layerEl) => {
			const properties = this.parseProperties(layerEl.querySelector("properties"));
			const objects = this.parseObjects(layerEl.querySelectorAll("object"));
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

	private parseObjects(objectElements: NodeListOf<XmlElement>): TiledObject[] {
		return Array.from(objectElements).map((objectEl) => {
			const properties = this.parseProperties(objectEl.querySelector("properties"));
			const polygon = this.parsePoints(objectEl.querySelector("polygon"));
			const polyline = this.parsePoints(objectEl.querySelector("polyline"));
			const ellipse = !!objectEl.querySelector("ellipse");
			const textElement = objectEl.querySelector("text");
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
		const propertyElements = Array.from(propertiesElement.querySelectorAll("property"));
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