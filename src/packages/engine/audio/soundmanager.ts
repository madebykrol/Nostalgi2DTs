/**
 * SoundManager is responsible for managing audio playback in the browser
 */
export class SoundManager {
    private audioContext: AudioContext | null = null;
    private sounds: Map<string, AudioBuffer> = new Map();
    private gainNode: GainNode | null = null;

    constructor() {
        // AudioContext is created lazily on first use to avoid browser restrictions
    }

    /**
     * Initialize the audio context. This should be called after user interaction
     * to comply with browser autoplay policies.
     */
    private initAudioContext(): void {
        if (!this.audioContext) {
            this.audioContext = new AudioContext();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
        }
    }

    /**
     * Load a sound from a URL
     * @param name - The name to identify the sound
     * @param url - The URL of the audio file
     */
    async loadSound(name: string, url: string): Promise<void> {
        this.initAudioContext();
        
        if (!this.audioContext) {
            throw new Error("AudioContext not initialized");
        }

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds.set(name, audioBuffer);
        } catch (error) {
            console.error(`Failed to load sound ${name} from ${url}:`, error);
            throw error;
        }
    }

    /**
     * Load a sound from an AudioBuffer
     * @param name - The name to identify the sound
     * @param buffer - The audio buffer
     */
    loadSoundFromBuffer(name: string, buffer: AudioBuffer): void {
        this.initAudioContext();
        this.sounds.set(name, buffer);
    }

    /**
     * Play a loaded sound
     * @param name - The name of the sound to play
     * @param loop - Whether to loop the sound (default: false)
     * @param volume - Volume level (0.0 to 1.0, default: 1.0)
     */
    playSound(name: string, loop: boolean = false, volume: number = 1.0): void {
        this.initAudioContext();

        if (!this.audioContext || !this.gainNode) {
            console.warn("AudioContext not initialized");
            return;
        }

        const buffer = this.sounds.get(name);
        if (!buffer) {
            console.warn(`Sound ${name} not found`);
            return;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = loop;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = Math.max(0, Math.min(1, volume));
        
        source.connect(gainNode);
        gainNode.connect(this.gainNode);
        
        source.start(0);
    }

    /**
     * Create a simple "boink" sound effect using oscillators
     * This generates a synthetic sound without needing an audio file
     */
    createBoinkSound(): void {
        this.initAudioContext();

        if (!this.audioContext) {
            throw new Error("AudioContext not initialized");
        }

        const sampleRate = this.audioContext.sampleRate;
        const duration = 0.2; // 200ms
        const numSamples = Math.floor(sampleRate * duration);
        const audioBuffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
        const channelData = audioBuffer.getChannelData(0);

        // Create a "boink" sound by combining frequencies
        const frequency1 = 800; // Main frequency
        const frequency2 = 400; // Lower harmonic
        const decayRate = 5; // How fast the sound fades

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-decayRate * t); // Exponential decay
            
            // Combine two sine waves for a richer sound
            const value1 = Math.sin(2 * Math.PI * frequency1 * t);
            const value2 = Math.sin(2 * Math.PI * frequency2 * t) * 0.5;
            
            channelData[i] = (value1 + value2) * envelope * 0.3; // Scale down to avoid clipping
        }

        this.loadSoundFromBuffer("boink", audioBuffer);
    }

    /**
     * Set the master volume
     * @param volume - Volume level (0.0 to 1.0)
     */
    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Check if a sound is loaded
     * @param name - The name of the sound
     */
    hasSound(name: string): boolean {
        return this.sounds.has(name);
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
        this.gainNode = null;
    }
}
