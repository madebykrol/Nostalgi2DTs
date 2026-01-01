import { SerializedNode } from "./serializedNode";

export type SerializedScalar = string | number | boolean | null;

export class SerializedProperty {
    type: string | null = null;
    key: string | null = null;
    value: SerializedScalar = null;
    node: SerializedNode | null = null;
}