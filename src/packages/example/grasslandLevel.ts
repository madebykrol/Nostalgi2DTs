import {
  Constructor,
  Container,
  GameMode,
  Level,
  Vector2,
  PostProcessingVolumeActor,
  SphereWarpPostProcessMaterial
} from "@repo/engine";
import { GameTileMapActor } from "./actors/gameTileMapActor";

export class GrasslandsMap extends Level {

  private tileMapActor: GameTileMapActor;
  private container: Container;
  constructor(container: Container, ) {
    super();

    this.name = "Grasslands";

    console.log(container);
    this.tileMapActor = container.get(GameTileMapActor);
    console.log(this.tileMapActor);
    this.tileMapActor.setMapUrl("/assets/maps/grasslands/grasslands.tmx");

    this.container = container;

    this.addActor(this.tileMapActor);

    const sphereMaterial = new SphereWarpPostProcessMaterial();
    const postVolume = new PostProcessingVolumeActor(sphereMaterial);
    postVolume.setExtent(new Vector2(1000, 1000));
    postVolume.setPosition(new Vector2(0, 0));
    postVolume.layer = Number.MAX_SAFE_INTEGER; // ensure evaluated after world actors
    this.addActor(postVolume);
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