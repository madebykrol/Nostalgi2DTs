export abstract class VertexShader {
    abstract getSource(): string;
    abstract getAttributes(): { [key: string]: number };
    abstract getUniforms(): { [key: string]: WebGLUniformLocation | null };

    compile(gl: WebGL2RenderingContext, program: WebGLProgram): WebGLShader {
        const source = this.getSource();
        const shader = gl.createShader(gl.VERTEX_SHADER);
        if (!shader) {
            throw new Error("Failed to create shader");
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        const info = gl.getShaderInfoLog(shader);
        if (info) {
            console.error("Error compiling shader:", info);
        }
        gl.attachShader(program, shader);
        return shader;
    }
}