import { MathUtils } from "../math";

export enum GainChannel {
    Effects,
    Backgrounds,
}

export class SoundHandle {
    constructor(private audioContext: AudioContext, private audioBuffer: AudioBuffer, private gain: GainNode) {}

    /**
     * Set the gain volume of the sound
     * gain is clamped to the range [0,1]
     * @param gain
     */
    setVolume(gain: number) {
        this.gain.gain.value = MathUtils.clamp(gain, 0, 1);
    }

    play(loop: boolean, start: number) {

        const source = this.audioContext.createBufferSource();
        source.connect(this.gain);
        source.buffer = this.audioBuffer;

        source.loop = loop;

        source.start(0);
    }
}
/**
 * SoundManager is responsible for managing audio playback in the browser
 */
export class SoundManager {
    private audioContext: AudioContext | null = null;
    private sounds: Map<string, SoundHandle> = new Map();
    private masterGain: GainNode | null = null;
    private effectsGain: GainNode | null = null;
    private backgroundGain: GainNode | null = null;

    constructor() {
        // AudioContext is created lazily on first use to avoid browser restrictions
    }

    /**
     * Initialize the audio context. This should be called after user interaction
     * to comply with browser autoplay policies.
     */
    initAudioContext(): void {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();

            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1;
            this.masterGain.connect(this.audioContext.destination);

            this.backgroundGain = this.audioContext.createGain();
            this.backgroundGain.connect(this.masterGain);

            this.effectsGain = this.audioContext.createGain();
            this.effectsGain.connect(this.masterGain);
        }
    }

    /**
     * Set the master volume. Gain is clamped to range [0,1]
     * @param gain
     */
    setMasterVolume(gain: number) {
        if(!this.masterGain) {
            throw new Error("Master gain not initialized");
        }

        this.masterGain.gain.value = MathUtils.clamp(gain, 0, 1);
    }
    
    setEffectsVolume(gain: number) {
        if(!this.effectsGain) {
            throw new Error("Effects gain not initialized");
        }

        this.effectsGain.gain.value = MathUtils.clamp(gain, 0, 1);
    }

    setBackgroundVolume(gain: number) {
        if(!this.backgroundGain) {
            throw new Error("Background gain not initialized");
        }

        this.backgroundGain.gain.value = MathUtils.clamp(gain, 0,1);
    }

    /**
     * Load a sound from a URL
     * @param name - The name to identify the sound
     * @param url - The URL of the audio file
     * @param channel - Set which channel this sound is played to
     */
    async loadSound(name: string, url: string, channel: GainChannel = GainChannel.Effects): Promise<SoundHandle|null> {
        this.initAudioContext();
        
        if (!this.audioContext) {
            throw new Error("AudioContext not initialized");
        }

        if (!this.backgroundGain || !this.masterGain || !this.effectsGain)
            throw new Error("Gain channels not initialized")

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

           const handle = this.createSoundHandle(audioBuffer, this.audioContext, this.backgroundGain, this.effectsGain, channel);

           this.sounds.set(name, handle);
           return handle;
        } catch (error) {
            console.error(`Failed to load sound ${name} from ${url}:`, error);
            throw error;
        }
    }

    private createSoundHandle(audioBuffer: AudioBuffer, audioContext: AudioContext, backgroundGain: GainNode, effectsGain: GainNode, channel: GainChannel) : SoundHandle {
        const gain = audioContext.createGain();
        gain.gain.value = 1;
        

        switch(channel) {
            case GainChannel.Backgrounds:
                gain.connect(backgroundGain);
            break;
            case GainChannel.Effects: 
                gain.connect(effectsGain);
            break;
        }

        return new SoundHandle(audioContext, audioBuffer, gain);
    }

    /**
     * Load a sound from an AudioBuffer
     * @param name - The name to identify the sound
     * @param buffer - The audio buffer
     */
    loadSoundFromBuffer(name: string, buffer: AudioBuffer, channel: GainChannel): SoundHandle {
        this.initAudioContext();

        if (!this.audioContext) {
            throw new Error("AudioContext not initialized");
        }

        if (!this.backgroundGain || !this.masterGain || !this.effectsGain)
            throw new Error("Gain channels not initialized")

        const handle = this.createSoundHandle(buffer, this.audioContext, this.backgroundGain, this.effectsGain, channel);
        this.sounds.set(name, handle);

        return handle;
    }

    /**
     * Set the master volume
     * @param volume - Volume level (0.0 to 1.0)
     */
    setVolume(volume: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Check if a sound is loaded
     * @param name - The name of the sound
     */
    hasSound(name: string): boolean {
        return this.sounds.has(name);
    }

    getSound(name: string): SoundHandle | null {
        if (this.hasSound(name)) {
            return this.sounds.get(name) ?? null;
        }

        return null;
    }

    /**
     * Get the audio context (useful for advanced audio operations)
     */
    getAudioContext(): AudioContext | null {
        return this.audioContext;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this.audioContext) {
            this.audioContext.close().catch((error) => {
                console.error("Error closing audio context:", error);
            });
            this.audioContext = null;
        }
        this.sounds.clear();
        this.masterGain = null;
    }
}
