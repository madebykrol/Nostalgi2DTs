import { 
  Actor, 
  Engine, 
  SoundManager, 
  SoundHandle,
  createBoinkSound,
  GainChannel
} from "@repo/engine";
import { inject, injectable } from 'inversify';

/**
 * SoundActor plays a continuous sound with volume based on proximity to the player
 */
@injectable()
export class SoundActor extends Actor {
  private soundHandle: SoundHandle | null = null;
  private maxDistance: number = 100; // Maximum distance at which sound is audible
  private minDistance: number = 5;   // Minimum distance for full volume

  constructor(
    @inject(Engine) private engine: Engine<unknown, unknown>,
    @inject(SoundManager) private soundManager: SoundManager
  ) {
    super();
    this.shouldTick = true;
  }

  /**
   * Called after the actor is spawned in the world
   */
  onSpawned(): void {
    // Load and start playing the Boink sound
    this.soundHandle = this.soundManager.loadSoundFromBuffer(
      `boinkSound_${this.getId()}`, 
      createBoinkSound(this.soundManager.getAudioContext()!), 
      GainChannel.Effects
    );
    
    // Start playing the sound in a loop
    if (this.soundHandle) {
      this.soundHandle.setVolume(1);
      this.soundHandle.play(true, 0); // true = loop, 0 = start immediately
    }
  }

  /**
   * Called every frame to update sound volume based on distance to player
   */
  tick(): void {
    if (!this.soundHandle) return;

    // Get the local player's possessed actor position
    const playerState = this.engine.getLocalPlayerState();
    const playerController = playerState?.getController();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerActor = (playerController as any)?.possessedActor;

    if (!playerActor) return;

    // Calculate distance between this actor and the player
    const playerPosition = playerActor.getPosition();
    const myPosition = this.getPosition();
    const distance = Math.sqrt(
      Math.pow(playerPosition.x - myPosition.x, 2) + 
      Math.pow(playerPosition.y - myPosition.y, 2)
    );

    // Calculate volume based on distance (inverse square law with clamping)
    let volume = 0;
    if (distance <= this.minDistance) {
      volume = 1;
    } else if (distance <= this.maxDistance) {
      // Linear falloff between minDistance and maxDistance
      volume = 1 - ((distance - this.minDistance) / (this.maxDistance - this.minDistance));
    }

    // Apply the calculated volume
    this.soundHandle.setVolume(volume);
  }

  /**
   * Called when the actor is despawned
   */
  onDespawned(): void {
    // Clean up sound resources
    this.soundHandle = null;
  }
}
