import { VertexShader } from "../rendering";

export class RotationGizmoVertexShader extends VertexShader {
    getSource(): string {
        return `#version 300 es
        precision highp float;
        layout(location=0) in vec2 a_position;
        uniform mat3 u_viewProjection;
        void main() {
            vec3 clip = u_viewProjection * vec3(a_position, 1.0);
            gl_Position = vec4(clip.xy, 0.0, 1.0);
        }`;
    }

    getAttributes(): { [key: string]: number } {
        return {
            a_position: 0,
        };
    }

    getUniforms(): { [key: string]: WebGLUniformLocation | null } {
        return {
            u_viewProjection: null,
        };
    }
}
