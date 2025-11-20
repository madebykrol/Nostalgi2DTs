import { Constructor, Container, GameMode, Level, ResourceManager, Vector2 } from "@repo/engine";
import { GameTileMapActor } from "./actors/gameTileMapActor";
import { Parser } from "@repo/tiler";

export class GrasslandsMap extends Level {

  private tileMapActor: GameTileMapActor;
  private container: Container;
  constructor(container: Container, ) {
    super();

    this.name = "Grasslands";
    this.tileMapActor = container.get<GameTileMapActor>(GameTileMapActor);
    this.tileMapActor.setMapUrl("/assets/maps/grasslands/grasslands.tmx");


    this.container = container;

    this.addActor(this.tileMapActor);
    // const mapCenter = tileMapActor.getWorldCenter();
    // tileMapActor.setPosition(mapCenter);
  }

  // get
  getGravity(): Vector2 {
    return new Vector2(
      this.tileMapActor.getMap()?.properties?.GravityX as number ?? 0,
      this.tileMapActor.getMap()?.properties?.GravityY as number ?? 0
    );
  }

  getGameMode(): Constructor<GameMode> | undefined {
    console.log(this.tileMapActor.getMap()?.properties?.GameMode);
    return this.container.getTypeForIdentifier(this.tileMapActor.getMap()?.properties?.GameMode as  string) as Constructor<GameMode> | undefined;
  }
}