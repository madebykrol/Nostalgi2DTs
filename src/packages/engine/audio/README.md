# SoundManager Usage Example

The SoundManager class provides audio playback functionality for the Nostalgi2DTs engine.

## Basic Usage

```typescript
import { SoundManager, createBoinkSound } from "@repo/engine";

// Create a sound manager instance
const soundManager = new SoundManager();
soundManager.initAudioContext();

// Create the "boink" sound effect using the sound buffer function
const boinkBuffer = createBoinkSound(soundManager.getAudioContext()!);
soundManager.loadSoundFromBuffer("boink", boinkBuffer);

// Play the boink sound
soundManager.playSound("boink");

// Play with custom volume (0.0 to 1.0)
soundManager.playSound("boink", false, 0.5);
```

## Loading Custom Sounds

```typescript
// Load a sound from a URL
await soundManager.loadSound("explosion", "/assets/sounds/explosion.mp3");

// Play the loaded sound
soundManager.playSound("explosion");

// Play with looping enabled
soundManager.playSound("background-music", true);
```

## Setting Volume

```typescript
// Set master volume (0.0 to 1.0)
soundManager.setVolume(0.7);
```

## Checking if Sound Exists

```typescript
if (soundManager.hasSound("boink")) {
  soundManager.playSound("boink");
}
```

## Advanced: Using AudioBuffer Directly

```typescript
// If you have an AudioBuffer from another source
const buffer: AudioBuffer = ...; // Your audio buffer
soundManager.loadSoundFromBuffer("custom", buffer);
soundManager.playSound("custom");
```

## Creating Custom Sound Buffers

Sound buffers can be created using the functions in the `soundbuffers` module:

```typescript
import { createBoinkSound } from "@repo/engine";

// Create a custom sound buffer
const audioContext = soundManager.getAudioContext();
if (audioContext) {
  const customBuffer = createBoinkSound(audioContext);
  soundManager.loadSoundFromBuffer("mySound", customBuffer);
}
```

## In the Client App

The SoundManager is already integrated into the client app (`src/apps/client/src/main.tsx`). When you click on the canvas to spawn an actor, it plays the "boink" sound effect.

## Browser Compatibility

The SoundManager uses the Web Audio API, which is supported in all modern browsers. Note that browsers require user interaction before audio can be played (autoplay policy). The audio context is initialized lazily on first use.
