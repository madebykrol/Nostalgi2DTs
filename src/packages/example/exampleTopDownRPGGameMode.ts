import { Engine, GameMode, inject, World } from "@nostalgi2d/engine";
import { DemoCharacter } from "./actors/demo";
import { TopDownRPGController } from "./controllers/topDownRPGController";

export class ExampleTopDownRPGGameMode extends GameMode {

  /**
   *
   */
  constructor(@inject(World) protected world: World, @inject(Engine) protected engine: Engine) {
    super(world, engine);
    
  }
  
  playerControllerType: typeof TopDownRPGController = TopDownRPGController;
  playerCharacterType: typeof DemoCharacter = DemoCharacter;

}