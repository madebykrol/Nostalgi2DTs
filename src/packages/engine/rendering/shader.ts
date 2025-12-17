import { FragmentShader } from "./fragment";
import { VertexShader } from "./vertex";

export class Shader {

    public vertex: VertexShader | null = null;
    public fragment: FragmentShader | null = null;

    public subShader: Shader | null = null;
    public readonly pass: number = 0;

    constructor(public name: string) {
    }

    public compile(gl: WebGL2RenderingContext, program: WebGLProgram): void {
        this.vertex?.compile(gl, program);
        this.fragment?.compile(gl, program);
        this.subShader?.compile(gl, program);
    }

}