import { Container, unmanaged, Vector2, Vertex2 } from "@repo/engine";
import { Parser, TiledObjectLayer, TiledPoint, TileMapActor, type TileMapActorOptions } from "@repo/tiler";
import { WallActor } from "./wall";

export class GameTileMapActor extends TileMapActor {
  constructor(@unmanaged() mapUrl: string, parser: Parser = new Parser(), container: Container, options: TileMapActorOptions = {}) {
    super(mapUrl, parser, container, options);
  }

  protected handleLayer(layer: TiledObjectLayer): boolean {
      const layerName = layer.name?.toLowerCase?.() ?? "";
      const typeProperty = layer.properties ? layer.properties["Type"] : undefined;

      console.log(layerName, typeProperty);
      const layerType = typeof typeProperty === "string"
          ? typeProperty.toLowerCase()
          : "";

      if (layerName.includes("wall") || layerType === "walls") {
          console.log("Handling walls for layer:", layer.name);
          this.handleWalls(layer);
          return true;
      }
      return true;
  }

  private handleWalls(layer: TiledObjectLayer): void {
      if (!layer.visible || !layer.objects.length) {
          return;
      }

      const scale = this.getWorldUnitsPerPixel();
      const translation = this.getRenderTranslation();

      console.log("Processing walls for layer:", layer.name);

      layer.objects.forEach((object, _index) => {
          if (!object.visible) {
              return;
          }

          const polygon = object.polygon;
          let vertices: Vertex2[] = [];

          if (polygon && polygon.length >= 3) {
            vertices = this.handlePolygonWall(polygon, scale, object.rotation ?? 0);
          }

          else {
            vertices = object.width && object.height ? [
              { x: 0, y: 0 },
              { x: object.width * scale, y: 0 },
              { x: object.width * scale, y: -object.height * scale },
              { x: 0, y: -object.height * scale }
            ] : [];
          }

          const wallActor = this.container.get<WallActor>(WallActor);
          wallActor.applyProperties({ vertices: vertices });

          wallActor.initialize();

          const posX = (object.x + (layer.offsetX ?? 0)) * scale;
          const posY = -((object.y + (layer.offsetY ?? 0)) * scale);
          const worldPosition = new Vector2(posX + translation.x, posY + translation.y);
          wallActor.setPosition(worldPosition);

          this.addChild(wallActor);
      });
  }

  private handlePolygonWall(polygon: TiledPoint[], scale: number, rotation: number): { x: number; y: number }[] {
    const rotationRadians = -(rotation * (Math.PI / 180));
    const cos = Math.cos(rotationRadians);
    const sin = Math.sin(rotationRadians);

    return polygon.map((point) => {
        const scaledX = point.x * scale;
        const scaledY = -point.y * scale;
        return {
            x: scaledX * cos - scaledY * sin,
            y: scaledX * sin + scaledY * cos
        };
    });
  }
}
