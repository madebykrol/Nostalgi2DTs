import { MeshComponent, Quad, inject, unmanaged, Vector2, Vertex2, actor, Engine, PolygonCollisionComponent, ResourceManager } from "@nostalgi2d/engine";
import { Parser, TiledObjectLayer, TiledPoint, TileMapActor, TileMapMaterial, type TileMapActorOptions } from "@nostalgi2d/tiler";
import { WallActor } from "./wall";

@actor()
export class GameTileMapActor extends TileMapActor {
  constructor(
    @inject(Parser) parser: Parser,
    @inject(Engine) engine: Engine,
    @unmanaged() options: TileMapActorOptions = {}
  ) {
    super(parser, engine, options);
    var material = engine.createObject<TileMapMaterial>(TileMapMaterial, "TileMapMaterial1");

    var quadComponent = new MeshComponent(new Quad(), material);
    this.addComponent(quadComponent);
  }

  protected handleLayer(layer: TiledObjectLayer): boolean {
      const layerName = layer.name?.toLowerCase?.() ?? "";
      const typeProperty = layer.properties ? layer.properties["Type"] : undefined;
      const layerType = typeof typeProperty === "string"
          ? typeProperty.toLowerCase()
          : "";

      if (layerName.includes("wall") || layerType === "walls") {
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
      layer.objects.forEach((object, _index) => {
          if (!object.visible) {
              return;
          }

          const polygon = object.polygon;
          let vertices: Vertex2[] = [];

          if (polygon && polygon.length >= 3) {
            vertices = this.handlePolygonWall(polygon, scale, 0);
          }

          else {
            vertices = object.width && object.height ? [
              new Vertex2(0, 0),
              new Vertex2(object.width * scale, 0),
              new Vertex2(object.width * scale, -object.height * scale),
              new Vertex2(0, -object.height * scale)
            ] : [];
          }

          //Rotate verticies according to object rotation the rotation should be based on the center of the object
          // if (object.rotation && object.rotation !== 0) {
          //   const centerX = (object.width ? object.width * scale : 0) / 2;
          //   const centerY = (object.height ? -object.height * scale : 0) / 2;
          //   const angleRad = (object.rotation * Math.PI) / 180;

          //   vertices = vertices.map((vertex) => {
          //     const translatedX = vertex.x - centerX;
          //     const translatedY = vertex.y - centerY;
          //     const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
          //     const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);
          //     return {
          //       x: rotatedX + centerX,
          //       y: rotatedY + centerY
          //     };
          //   }
          //   );
          // }


          const wallActor = this.engine.createObject<WallActor>(WallActor, object.id.toString());

          var collisionComponent = new PolygonCollisionComponent();
          collisionComponent.points = vertices;
          wallActor.addComponent(collisionComponent)

          wallActor.initialize();

          const posX = (object.x + (layer.offsetX ?? 0)) * scale;
          const posY = -((object.y + (layer.offsetY ?? 0)) * scale);
            const parentPosition = this.position;
            const worldPosition = new Vector2(
              parentPosition.x + posX + translation.x,
              parentPosition.y + posY + translation.y
            );
            wallActor.position = worldPosition;

          this.getWorld()?.spawnActorInstance(wallActor, this);
      });
  }

  private handlePolygonWall(polygon: TiledPoint[], scale: number, rotation: number): Vertex2[] {
    const rotationRadians = -(rotation * (Math.PI / 180));
    const cos = Math.cos(rotationRadians);
    const sin = Math.sin(rotationRadians);

    return polygon.map((point) => {
        const scaledX = point.x * scale;
        const scaledY = -point.y * scale;
        return new Vertex2(
            scaledX * cos - scaledY * sin,
            scaledX * sin + scaledY * cos
        );
    });
  }
}
