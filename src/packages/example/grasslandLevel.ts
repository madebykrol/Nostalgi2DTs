import {
Container,
  Level,
  Vector2,
  injectable,
  inject
} from "@repo/engine";
import { GameTileMapActor } from "@repo/example";


@injectable()
export class GrasslandsMap extends Level {

  private tileMapActor: GameTileMapActor;
  constructor(@inject(Container) container: Container) {
    super();

    this.name = "Grasslands";

    // Ensure the tile map actor binding exists
  
    this.tileMapActor = container.get(GameTileMapActor);

    if (!this.tileMapActor) {
      throw new Error("GrasslandsMap failed to resolve GameTileMapActor; ensure it's registered with the container");
    }
  }

  // get
  getGravity(): Vector2 {
    return new Vector2(
      this.tileMapActor.getMap()?.properties?.GravityX as number ?? 0,
      this.tileMapActor.getMap()?.properties?.GravityY as number ?? 0
    );
  }

  // get gameMode(): Constructor<GameMode> | undefined {
  //   console.log(this.tileMapActor.getMap()?.properties?.GameMode);
  //   return this.container.getTypeForIdentifier(this.tileMapActor.getMap()?.properties?.GameMode as string) as Constructor<GameMode> | undefined;
  // }
}