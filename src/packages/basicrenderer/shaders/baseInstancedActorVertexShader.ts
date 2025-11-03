import { VertexShader } from "@repo/engine";


// Optimized renderer: reuses a single static quad buffer & shader program.
// Avoids per-actor buffer creation & data uploads (major perf win for hundreds/thousands of actors).
export class BaseInstancedActorVertexShader extends VertexShader {
    getAttributes(): { [key: string]: number; } {
        return {
            a_position: 0,
            a_instanceTranslation: 1,
            a_instanceSize: 2
        };
    }
    getUniforms(): { [key: string]: WebGLUniformLocation | null; } {
        return {
            u_viewProjection: null
        };
    }
    getSource(): string {
        return `#version 300 es
        precision highp float;
        layout(location=0) in vec2 a_position;          // quad vertex (-1..1)
        layout(location=1) in vec2 a_instanceTranslation; // per-instance world position
        layout(location=2) in float a_instanceSize;       // per-instance half size
        uniform mat3 u_viewProjection;                   // camera VP
        void main() {
            vec2 worldPos = a_position * a_instanceSize + a_instanceTranslation;
            vec3 clip = u_viewProjection * vec3(worldPos, 1.0);
            gl_Position = vec4(clip.xy, 0.0, 1.0);
        }`;
    }
}
