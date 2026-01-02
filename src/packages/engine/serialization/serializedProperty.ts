import { SerializedPrimitive, SerializedNode } from "./serializedNode";


export class SerializedProperty {
    type: string | null = null;
    key: string | null = null;
    value: SerializedPrimitive = null;
    properties: SerializedProperty[] | null = null;
    node: SerializedNode | null = null;
}