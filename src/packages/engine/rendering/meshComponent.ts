import { Component } from "../world";
import { Mesh } from "./Mesh";

export class MeshComponent extends Component {
    tick(_deltaTime: number,  _engineNetworkMode: "client" | "server" | "singleplayer"): void {
        throw new Error("Method not implemented.");
    }

    constructor(public mesh: Mesh) {
        super();
    }

    getMesh(): Mesh {
        return this.mesh;
    }
}
