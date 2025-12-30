import {
  Constructor,
  Container,
  GameMode,
  Level,
  Vector2,
  PostProcessingVolumeActor,
  SphereWarpPostProcessMaterial
} from "@repo/engine";
import { GameTileMapActor } from "@repo/example";

export class GrasslandsMap extends Level {

  private tileMapActor: GameTileMapActor;
  private container: Container;
  constructor(container: Container, ) {
    super();

    this.name = "Grasslands";

    // Ensure the tile map actor binding exists
  
    this.tileMapActor = container.get(GameTileMapActor);

    if (!this.tileMapActor) {
      throw new Error("GrasslandsMap failed to resolve GameTileMapActor; ensure it's registered with the container");
    }

    this.tileMapActor.mapUrl = "/assets/maps/grasslands/grasslands.tmx";

    this.container = container;

    this.addActor(this.tileMapActor);

    const sphereMaterial = new SphereWarpPostProcessMaterial();
    const postVolume = new PostProcessingVolumeActor(sphereMaterial);
  
    postVolume.extent = new Vector2(2, 2);
    postVolume.position = new Vector2(0, 0);
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
    return this.container.getTypeForIdentifier(this.tileMapActor.getMap()?.properties?.GameMode as string) as Constructor<GameMode> | undefined;
  }
}