/**
 * Creates a simple "boink" sound effect using oscillators.
 * This generates a synthetic sound without needing an audio file.
 * 
 * @param audioContext - The AudioContext to use for creating the buffer
 * @returns An AudioBuffer containing the boink sound
 */
export function createBoinkSound(audioContext: AudioContext): AudioBuffer {
    const sampleRate = audioContext.sampleRate;
    const duration = 0.2; // 200ms
    const numSamples = Math.floor(sampleRate * duration);
    const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
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

    return audioBuffer;
}
