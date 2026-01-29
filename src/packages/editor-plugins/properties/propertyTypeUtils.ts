import { Vector2, Component as EngineComponent, type Property } from "@nostalgi2d/engine";

export const VECTOR2_TYPE_NAME = "vector2";

export type ArrayItemType = "string" | "number" | "vector2" | "component";

export type ScalarKind = "string" | "number" | "boolean" | "vector2" | "component" | "unknown";

export type CollectionKind = "scalar" | "array";

export type ValueKind = {
	collection: CollectionKind;
	item: ScalarKind;
};

export const isVector2Type = (type: string | null | undefined): boolean => {
	if (typeof type !== "string") {
		return false;
	}
	return type.trim().toLowerCase() === VECTOR2_TYPE_NAME;
};

export const propertyRepresentsVector2 = (property: Property | null | undefined): boolean => {
	if (!property) {
		return false;
	}
	const candidates = [
		property.type,
		property.valueTypeName,
		property.returnTypeName,
		property.getterReturnTypeName,
	];
	return candidates.some((candidate) => isVector2Type(candidate));
};

export const isArrayType = (type: string | null | undefined): boolean => {
	if (typeof type !== "string") {
		return false;
	}
	const normalized = type.trim().toLowerCase();
	return (
		normalized === "array" ||
		normalized.endsWith("[]") ||
		normalized.startsWith("array<") ||
		normalized.includes("array of")
	);
};

export const inferArrayItemTypeFromName = (
	typeName: string | null | undefined,
): ArrayItemType | null => {
	if (typeof typeName !== "string") {
		return null;
	}
	const normalized = typeName.trim().toLowerCase();
	if (normalized.includes("vector2")) {
		return "vector2";
	}
	if (normalized.includes("number")) {
		return "number";
	}
	if (normalized.includes("string")) {
		return "string";
	}
	if (normalized.includes("component")) {
		return "component";
	}
	return null;
};

export const inferArrayItemTypeFromValue = (values: unknown[]): ArrayItemType | null => {
	for (const entry of values) {
		if (entry instanceof Vector2) {
			return "vector2";
		}
		if (typeof entry === "number") {
			return "number";
		}
		if (typeof entry === "string") {
			return "string";
		}
		if (entry instanceof EngineComponent) {
			return "component";
		}
	}
	return null;
};

export const resolveArrayItemType = (
	property: Property,
	currentValue: unknown,
): ArrayItemType => {
	const metadataGuess =
		inferArrayItemTypeFromName(property.type) ??
		inferArrayItemTypeFromName(property.valueTypeName) ??
		inferArrayItemTypeFromName(property.returnTypeName) ??
		inferArrayItemTypeFromName(property.getterReturnTypeName);
	if (metadataGuess) {
		return metadataGuess;
	}
	if (Array.isArray(currentValue)) {
		const valueGuess = inferArrayItemTypeFromValue(currentValue);
		if (valueGuess) {
			return valueGuess;
		}
	}
	return "string";
};

export const inferScalarKindFromName = (typeName: string | null | undefined): ScalarKind => {
	if (typeof typeName !== "string") {
		return "unknown";
	}
	const normalized = typeName.trim().toLowerCase();
	if (normalized.includes("vector2")) return "vector2";
	if (normalized.includes("number")) return "number";
	if (normalized.includes("bool")) return "boolean";
	if (normalized.includes("string")) return "string";
	if (normalized.includes("component")) return "component";
	return "unknown";
};

export const inferScalarKindFromValue = (value: unknown): ScalarKind => {
	if (value instanceof Vector2) return "vector2";
	if (value instanceof EngineComponent) return "component";
	if (typeof value === "number") return "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "string") return "string";
	return "unknown";
};

const arrayItemTypeToScalarKind = (item: ArrayItemType | null): ScalarKind | null => {
	if (!item) return null;
	switch (item) {
		case "string":
			return "string";
		case "number":
			return "number";
		case "vector2":
			return "vector2";
		case "component":
			return "component";
		default:
			return null;
	}
};

export const inferValueKindFromProperty = (
	property: Property,
	runtimeValue: unknown,
): ValueKind => {
	// Determine if this should be treated as an array
	const nameCandidates = [
		property.type,
		property.valueTypeName,
		property.returnTypeName,
		property.getterReturnTypeName,
	];
	const hasArrayName = nameCandidates.some(isArrayType);
	const collection: CollectionKind = hasArrayName || Array.isArray(runtimeValue) ? "array" : "scalar";

	if (collection === "array") {
		const itemFromName = arrayItemTypeToScalarKind(
			inferArrayItemTypeFromName(nameCandidates.find(Boolean) ?? null),
		);
		if (itemFromName) {
			return { collection: "array", item: itemFromName };
		}
		if (Array.isArray(runtimeValue) && runtimeValue.length > 0) {
			const inferred = inferScalarKindFromValue(runtimeValue[0]);
			return { collection: "array", item: inferred === "unknown" ? "string" : inferred };
		}
		return { collection: "array", item: "string" };
	}

	// Scalar value
	let scalarKind = inferScalarKindFromName(nameCandidates.find(Boolean) ?? null);
	if (scalarKind === "unknown") {
		scalarKind = inferScalarKindFromValue(runtimeValue);
	}
	if (scalarKind === "unknown") {
		scalarKind = "string";
	}
	return { collection: "scalar", item: scalarKind };
};
