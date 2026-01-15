import { actor } from "../actorRegistry";
import { Actor } from "../world";

@actor("PlayerStart")
export class PlayerStart extends Actor {
    public constructor() {
        super();
    }
}