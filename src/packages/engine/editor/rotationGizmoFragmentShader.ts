import { FragmentShader } from "../rendering";

export class RotationGizmoFragmentShader extends FragmentShader {
    getSource(): string {
        return `#version 300 es
        precision highp float;
        uniform vec4 u_color;
        out vec4 outColor;
        void main() {
            outColor = u_color;
        }`;
    }

    getUniforms(): { [key: string]: WebGLUniformLocation | null } {
        return {
            u_color: null,
        };
    }
}
