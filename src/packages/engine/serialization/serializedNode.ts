import { SerializedProperty } from "./serializedProperty";

export class SerializedNode {
    type: string|null = null;
    value: string|null = null;
    items: SerializedNode[] = [];
    properties: SerializedProperty[] = [];
}