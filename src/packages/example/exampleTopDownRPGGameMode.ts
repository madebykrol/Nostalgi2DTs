import { GameMode } from "@repo/engine";
import { PlayerController } from "./controllers/playercontroller";
import { DemoCharacter } from "./actors/demo";

export class ExampleTopDownRPGGameMode extends GameMode {
  start(): void {
    throw new Error("Method not implemented.");
  }
  stop(): void {
    throw new Error("Method not implemented.");
  }
  playerControllerType: typeof PlayerController = PlayerController;
  playerCharacterType: typeof DemoCharacter = DemoCharacter;

}