import { SerializedProperty } from "./serializedProperty";


export type SerializedPrimitive = String | Number | Boolean | Date | null;

export class SerializedNode {
    type: string|null = null;
    value: SerializedPrimitive = null;
    items: SerializedNode[] = [];
    properties: SerializedProperty[] = [];
    children: SerializedNode[] = [];
}