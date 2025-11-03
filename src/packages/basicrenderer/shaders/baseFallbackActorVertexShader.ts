import { VertexShader } from "@repo/engine";

export class BaseFallbackActorVertexShader extends VertexShader {
    getAttributes(): { [key: string]: number; } {
        return {
            a_position: 0
        };
    }
    getUniforms(): { [key: string]: WebGLUniformLocation | null; } {
        return {
            u_viewProjection: null,
            u_translation: null,
            u_size: null,
            u_rotation: null
        };
    }
    getSource(): string {
        return `#version 300 es
        precision highp float;
        layout(location=0) in vec2 a_position;           // quad vertex (-1..1)
        uniform mat3 u_viewProjection;                   // camera VP
        uniform vec2 u_translation;                      // world position
        uniform float u_size;                            // half size
        uniform float u_rotation;                        // rotation in radians
        void main() {
            float c = cos(u_rotation);
            float s = sin(u_rotation);
            vec2 rotated = vec2(
                a_position.x * c - a_position.y * s,
                a_position.x * s + a_position.y * c
            );
            vec2 worldPos = rotated * u_size + u_translation;
            vec3 clip = u_viewProjection * vec3(worldPos, 1.0);
            gl_Position = vec4(clip.xy, 0.0, 1.0);
        }`;
    }
}
