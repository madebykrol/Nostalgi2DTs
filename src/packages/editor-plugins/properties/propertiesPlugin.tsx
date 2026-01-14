import { useCallback, useEffect, useRef, useState } from "react";
import {
	Actor,
	Editor,
	EditorUIPlugin,
	Vector2,
	getRegisteredPropertiesForInstance,
	Property,
	AssetService,
	type AssetPayloadPackedEntry,
	type AssetManifest,
} from "@repo/engine";
import { ArrayEditor, NumberEditor, Vector2Editor } from "@repo/ui";

const hasNativeNumberIsFinite = typeof Number.isFinite === "function";
const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && (hasNativeNumberIsFinite ? Number.isFinite(value) : isFinite(value));





const radiansToDegrees = (value: number): number => (value * 180) / Math.PI;
const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

type LevelPropertyDraft = {
	id: string;
	index: number;
	key: string;
	type: string | null | undefined;
	value: string | Array<string | number | Vector2>;
	isEditable: boolean;
	label?: string | null;
	description?: string | null;
	canEditStructure: boolean;
	isNew: boolean;
};

type AssetSelection = {
	name: string;
	path: string;
	assetType?: string;
	manifestType?: string;
	metadata?: Record<string, unknown>;
	contentType?: string;
	sizeBytes?: number;
	entryId?: string;
	containerPath?: string;
};

const RESOURCE_BASE = "http://localhost:4000";

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
};

const textDecoder = new TextDecoder("utf-8");
const textEncoder = new TextEncoder();

const loadContainerBuffer = async (containerPath: string) => {
	const loadUrl = new URL(`${RESOURCE_BASE}/api/resources/content`);
	loadUrl.searchParams.set("path", containerPath);
	loadUrl.searchParams.set("encoding", "base64");
	const res = await fetch(loadUrl.toString());
	if (!res.ok) {
		throw new Error(`Failed to load container: ${res.status} ${res.statusText}`);
	}
	const base64 = await res.text();
	const buffer = base64ToArrayBuffer(base64);
	const assetService = new AssetService();
	const header = assetService.parseHeader(buffer);
	const manifest = assetService.readManifest(buffer);
	return { buffer, assetService, header, manifest };
};

const saveContainerBuffer = async (containerPath: string, packed: ArrayBuffer) => {
	const packedBase64 = arrayBufferToBase64(packed);
	const saveUrl = `${RESOURCE_BASE}/api/resources/content?path=${encodeURIComponent(containerPath)}`;
	const saveRes = await fetch(saveUrl, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content: packedBase64, encoding: "base64" }),
	});
	if (!saveRes.ok) {
		throw new Error(`Failed to save container: ${saveRes.status} ${saveRes.statusText}`);
	}
};

const repackAndSaveContainer = async (
	containerPath: string,
	manifest: AssetManifest,
	payloadEntries: AssetPayloadPackedEntry[],
	assetService: AssetService,
) => {
	const packed = await assetService.packAsset(manifest, payloadEntries);
	await saveContainerBuffer(containerPath, packed);
};

const coerceLevelPropertyValue = (type: string | null | undefined, value: string) => {
	const normalized = type?.toLowerCase();
	switch (normalized) {
		case "number": {
			const parsed = Number(value);
			return isFiniteNumber(parsed) ? parsed : 0;
		}
		case "boolean": {
			return value.toLowerCase() === "true";
		}
		case "null":
		case "undefined": {
			return null;
		}
		default:
			return value;
	}
};

const VECTOR2_TYPE_NAME = "vector2";

const isVector2Type = (type: string | null | undefined): boolean => {
	if (typeof type !== "string") {
		return false;
	}
	return type.trim().toLowerCase() === VECTOR2_TYPE_NAME;
};

type Vector2Components = { x: number; y: number };

const parseVector2DraftValue = (value: string): Vector2Components => {
	const [xRaw, yRaw] = value.split(",").map((entry) => Number(entry.trim()));
	return {
		x: isFiniteNumber(xRaw) ? xRaw : 0,
		y: isFiniteNumber(yRaw) ? yRaw : 0,
	};
};

const formatVector2DraftValue = (components: Vector2Components): string => `${components.x},${components.y}`;

const extractVector2ComponentsFromSerialized = (
	prop: { properties?: Array<{ key?: string; value?: unknown }> } | null | undefined,
): Vector2Components => {
	const children = Array.isArray(prop?.properties) ? prop?.properties : [];
	const getComponent = (axis: "x" | "y") => {
		const entry = children.find((child) => child?.key === axis);
		const raw = entry?.value;
		const numeric = typeof raw === "number" ? raw : Number(raw);
		return isFiniteNumber(numeric) ? numeric : 0;
	};
	return { x: getComponent("x"), y: getComponent("y") };
};

const serializedVector2ToDraftValue = (
	prop: { properties?: Array<{ key?: string; value?: unknown }> } | null | undefined,
): string => {
	return formatVector2DraftValue(extractVector2ComponentsFromSerialized(prop));
};

const runtimeVector2ToDraftValue = (value: unknown): string | null => {
	if (value instanceof Vector2) {
		return formatVector2DraftValue({ x: value.x, y: value.y });
	}
	if (value && typeof value === "object" && "x" in value && "y" in value) {
		const x = Number((value as { x?: unknown }).x);
		const y = Number((value as { y?: unknown }).y);
		return formatVector2DraftValue({
			x: isFiniteNumber(x) ? x : 0,
			y: isFiniteNumber(y) ? y : 0,
		});
	}
	return null;
};

const propertyRepresentsVector2 = (property: Property | null | undefined): boolean => {
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

const isArrayType = (type: string | null | undefined): boolean => {
	if (typeof type !== "string") {
		return false;
	}
	const normalized = type.trim().toLowerCase();
	return normalized === "array" || normalized.endsWith("[]") || normalized.startsWith("array<") || normalized.includes("array of");
};

const parseArrayDraftValue = (value: string | Array<string | number | Vector2>): Array<string | number | Vector2> => {
	if (Array.isArray(value)) {
		return value;
	}
	if (typeof value !== "string") {
		return [];
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return [];
	}
	try {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) ? (parsed as Array<string | number | Vector2>) : [];
	} catch (error) {
		console.warn("Failed to parse array draft value", error);
		return [];
	}
};

type ArrayItemType = "string" | "number" | "vector2";

const inferArrayItemTypeFromName = (typeName: string | null | undefined): ArrayItemType | null => {
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
	return null;
};

const inferArrayItemTypeFromValue = (values: unknown[]): ArrayItemType | null => {
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
	}
	return null;
};

const resolveArrayItemType = (property: Property, currentValue: unknown): ArrayItemType => {
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

type SerializedDraftValue = {
	value: string | number | boolean | null | Array<string | number | Vector2>;
	properties: Array<{ key: string; type: string; value: number; properties: null; node: null }> | null;
};

const buildSerializedValueForDraft = (
	type: string | null | undefined,
	rawValue: string | Array<string | number | Vector2>,
): SerializedDraftValue => {
	if (isVector2Type(type) && typeof rawValue === "string") {
		const components = parseVector2DraftValue(rawValue);
		return {
			value: null,
			properties: [
				{ key: "x", type: "Number", value: components.x, properties: null, node: null },
				{ key: "y", type: "Number", value: components.y, properties: null, node: null },
			],
		};
	}

	if (isArrayType(type)) {
		const parsedArray = parseArrayDraftValue(rawValue);
		return {
			value: parsedArray as SerializedDraftValue["value"],
			properties: null,
		};
	}

	return {
		value: coerceLevelPropertyValue(type, rawValue as string) as SerializedDraftValue["value"],
		properties: null,
	};
};

const isSerializablePrimitive = (value: unknown): value is string | number | boolean | null | undefined => {
	return (
		value === null ||
		value === undefined ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
};

const stringifyLevelPropertyValue = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	if (Array.isArray(value)) {
		try {
			return JSON.stringify(value);
		} catch (error) {
			console.warn("Failed to stringify array property", error);
			return "";
		}
	}
	if (value instanceof Vector2) {
		return formatVector2DraftValue({ x: value.x, y: value.y });
	}
	if (value && typeof value === "object" && "x" in value && "y" in value) {
		const x = Number((value as { x?: unknown }).x);
		const y = Number((value as { y?: unknown }).y);
		return formatVector2DraftValue({
			x: isFiniteNumber(x) ? x : 0,
			y: isFiniteNumber(y) ? y : 0,
		});
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return "";
};

const isSimpleSerializedProperty = (prop: { properties?: unknown; node?: unknown } | null | undefined): boolean => {
	return !prop?.properties && !prop?.node;
};

const normalizeDraftType = (type: string | null | undefined, fallback?: string | null): string | null => {
	if (typeof type === "string") {
		const trimmed = type.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	if (typeof fallback === "string") {
		const trimmedFallback = fallback.trim();
		if (trimmedFallback.length > 0) {
			return trimmedFallback;
		}
	}
	return fallback ?? null;
};

const formatPropertyLabel = (property: Property) => {
	if (property.label) {
		return property.label;
	}
	if (typeof property.key === "string") {
		return property.key
			.replace(/([A-Z])/g, " $1")
			.replace(/^./, (character) => character.toUpperCase());
	}
	return String(property.key);
};

const normalizeChoice = (value: unknown, index: number) => {
	const key = typeof value === "string" || typeof value === "number" ? String(value) : `choice_${index}`;
	const label = typeof value === "string" ? value : String(value);
	return { key, label, value };
};

type PropertiesPanelProps = {
	editor: Editor;
};

const PropertiesPanel = ({ editor }: PropertiesPanelProps) => {
	const [selection, setSelection] = useState<Actor[]>(() => editor.getSelectedActors());
	const [selectedAsset, setSelectedAsset] = useState<AssetSelection | null>(null);
	const [manifestTypeInput, setManifestTypeInput] = useState<string>("");
	const [isSavingType, setIsSavingType] = useState(false);
	const [saveTypeError, setSaveTypeError] = useState<string | null>(null);
	const [saveTypeMessage, setSaveTypeMessage] = useState<string | null>(null);
	const [levelTypeInput, setLevelTypeInput] = useState<string>("");
	const [isLoadingLevelType, setIsLoadingLevelType] = useState(false);
	const [isSavingLevelType, setIsSavingLevelType] = useState(false);
	const [levelTypeError, setLevelTypeError] = useState<string | null>(null);
	const [levelTypeMessage, setLevelTypeMessage] = useState<string | null>(null);
	const [levelPropertyDrafts, setLevelPropertyDrafts] = useState<LevelPropertyDraft[]>([]);
	const [isSavingLevelProperties, setIsSavingLevelProperties] = useState(false);
	const [levelPropertiesError, setLevelPropertiesError] = useState<string | null>(null);
	const [levelPropertiesMessage, setLevelPropertiesMessage] = useState<string | null>(null);
	const [, setRevision] = useState(0);
	const transformSnapshotRef = useRef<{ position: { x: number; y: number }; rotation: number }>(
		{ position: { x: 0, y: 0 }, rotation: 0 }
	);
	const propertySnapshotRef = useRef<Map<PropertyKey, unknown>>(new Map());
	const levelMetadataKind = (selectedAsset?.metadata as { kind?: string } | undefined)?.kind?.toString().toLowerCase();
	const isLevelAsset = Boolean(
		selectedAsset && (
			selectedAsset.manifestType?.toLowerCase() === "level" ||
			levelMetadataKind === "level"
		)
	);

	useEffect(() => {
		const handleSelectionChanged = () => {
			setSelectedAsset(null);
			setSelection(editor.getSelectedActors());
			setRevision((value) => value + 1);
		};

		editor.subscribe("actor:selected", handleSelectionChanged);
		return () => {
			editor.unsubscribe("actor:selected", handleSelectionChanged);
		};
	}, [editor]);

	useEffect(() => {
		const handleAssetSelected = (asset: AssetSelection | null) => {
			setSelectedAsset(asset ?? null);
			if (asset) {
				setSelection([]);
			}
			setRevision((value) => value + 1);
		};

		editor.subscribe("asset:selected", handleAssetSelected);
		return () => {
			editor.unsubscribe("asset:selected", handleAssetSelected);
		};
	}, [editor]);

	const handlePositionChange = useCallback(
		(axis: "x" | "y") => (value: number) => {
			const actor = selection[0];
			if (!actor) {
				return;
			}

			const current = actor.position;
			const next =
				axis === "x"
					? new Vector2(value, current.y)
					: new Vector2(current.x, value);

			actor.position = next;
			setRevision((revision) => revision + 1);
		},
		[selection]
	);

	const handleRotationChange = useCallback(
		(value: number) => {
			const actor = selection[0];
			if (!actor) {
				return;
			}

			actor.rotation = degreesToRadians(value);
			setRevision((revision) => revision + 1);
		},
		[selection]
	);

	useEffect(() => {
		const actor = selection[0] ?? null;
		if (!actor) {
			transformSnapshotRef.current = { position: { x: 0, y: 0 }, rotation: 0 };
			propertySnapshotRef.current = new Map();
			return;
		}
		const position = actor.position;
		transformSnapshotRef.current = {
			position: { x: position.x, y: position.y },
			rotation: actor.rotation,
		};
		const snapshot = new Map<string | symbol, unknown>();
		for (const property of getRegisteredPropertiesForInstance(actor)) {
			snapshot.set(property.key, Reflect.get(actor, property.key));
		}
		propertySnapshotRef.current = snapshot;
	}, [selection]);

	useEffect(() => {
		if (selectedAsset) {
			setManifestTypeInput(selectedAsset.manifestType ?? selectedAsset.assetType ?? "");
			setSaveTypeError(null);
			setSaveTypeMessage(null);
		} else {
			setManifestTypeInput("");
		}
		}, [selectedAsset]);

	useEffect(() => {
		if (!selectedAsset || !isLevelAsset) {
			setLevelTypeInput("");
			setLevelTypeError(null);
			setLevelTypeMessage(null);
			setLevelPropertyDrafts([]);
			setLevelPropertiesError(null);
			setLevelPropertiesMessage(null);
			setIsLoadingLevelType(false);
			return;
		}
		if (!selectedAsset.entryId) {
			setLevelTypeInput("");
			setLevelTypeError(null);
			setLevelTypeMessage(null);
			setLevelPropertyDrafts([]);
			setLevelPropertiesError(null);
			setLevelPropertiesMessage(null);
			setIsLoadingLevelType(false);
			return;
		}
		let cancelled = false;
		const loadLevelType = async () => {
			setIsLoadingLevelType(true);
			setLevelTypeError(null);
			setLevelTypeMessage(null);
			try {
				const containerPath = selectedAsset.containerPath ?? selectedAsset.path.split("#")[0] ?? selectedAsset.path;
				const { buffer, assetService, header, manifest } = await loadContainerBuffer(containerPath);
				const entries = manifest.entries ?? [];
				const entryIndex = entries.findIndex((entry) => entry.id === selectedAsset.entryId);
				if (entryIndex === -1) {
					throw new Error("Entry not found in container.");
				}
				const payloadBytes = assetService.getEntryPayloadBytes(buffer, entries[entryIndex], header);
				const levelJson = textDecoder.decode(payloadBytes);
				const data = JSON.parse(levelJson) as { type?: string; properties?: any[] };
				const currentType = typeof data.type === "string" && data.type.trim().length > 0 ? data.type : "Level";
				if (!cancelled) {
					setLevelTypeInput(currentType);
					const rawProperties = Array.isArray(data.properties) ? data.properties : [];
					const serializedDrafts: LevelPropertyDraft[] = rawProperties.map((prop, index) => {
						const key = typeof prop?.key === "string" ? prop.key : `property_${index}`;
						const normalizedType = normalizeDraftType(prop?.type, null);
						const arrayValue = isArrayType(normalizedType)
							? parseArrayDraftValue((prop as { value?: unknown })?.value as unknown as string | Array<string | number | Vector2>)
							: null;
						const vectorValue = isVector2Type(normalizedType) ? serializedVector2ToDraftValue(prop) : null;
						const scalarValue =
							prop?.value === null || prop?.value === undefined
								? ""
								: typeof prop.value === "string"
								? prop.value
								: String(prop.value);
						return {
							id: `${key}-${index}`,
							index,
							key,
							type: normalizedType,
							value: arrayValue ?? vectorValue ?? scalarValue,
							isEditable: isSimpleSerializedProperty(prop),
							label: key,
							description: undefined,
							canEditStructure: false,
							isNew: false,
						};
					});
					let finalDrafts: LevelPropertyDraft[] = serializedDrafts;
					try {
						const deserializedLevel = editor.deserializeLevel(levelJson);
						if (deserializedLevel) {
							const runtimeProperties = editor.getPropertiesForInstance(deserializedLevel);
							const serializedByKey = new Map(serializedDrafts.map((draft) => [draft.key, draft]));
							const runtimeDrafts: LevelPropertyDraft[] = runtimeProperties.map((prop, runtimeIndex) => {
								const key = typeof prop.key === "string" ? prop.key : String(prop.key);
								const serializedMatch = serializedByKey.get(key);
								const runtimeValue = editor.getPropertyValue(deserializedLevel, prop);
								const runtimeVectorValue = propertyRepresentsVector2(prop) ? runtimeVector2ToDraftValue(runtimeValue) : null;
								const fallbackValue =
									serializedMatch?.value ?? runtimeVectorValue ?? stringifyLevelPropertyValue(runtimeValue);
								const runtimeTypeGuess =
									serializedMatch?.type ??
									prop.type ??
									prop.valueTypeName ??
									prop.returnTypeName ??
									prop.getterReturnTypeName ??
									null;
								return {
									id: `${key}-${runtimeIndex}`,
									index: serializedMatch?.index ?? -1,
									key,
									type: normalizeDraftType(runtimeTypeGuess, serializedMatch?.type ?? prop.type ?? null),
									value: fallbackValue,
									isEditable: true,
									label: prop.label ?? key,
									description: prop.description,
									canEditStructure: !serializedMatch,
									isNew: !serializedMatch,
								};
							});
							const runtimeKeys = new Set(runtimeDrafts.map((draft) => draft.key));
							const unmatchedSerialized = serializedDrafts.filter((draft) => !runtimeKeys.has(draft.key));
							finalDrafts = [...runtimeDrafts, ...unmatchedSerialized];
						}
					} catch (runtimeError) {
						console.warn("Failed to deserialize level for property metadata", runtimeError);
					}
					setLevelPropertyDrafts(finalDrafts);
					setLevelPropertiesError(null);
					setLevelPropertiesMessage(null);
				}
			} catch (error) {
				if (!cancelled) {
					const message = error instanceof Error ? error.message : "Failed to load level type.";
					setLevelTypeError(message);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingLevelType(false);
				}
			}
		};
		void loadLevelType();
		return () => {
			cancelled = true;
		};
	}, [selectedAsset, isLevelAsset, editor]);

	useEffect(() => {
		let frameId = 0;
		let cancelled = false;

		const checkForTransformChanges = () => {
			if (cancelled) {
				return;
			}

			const actor = selection[0] ?? null;
			if (actor) {
				let didChange = false;
				const position = actor.position;
				const rotation = actor.rotation;
				const previous = transformSnapshotRef.current;

				if (
					position.x !== previous.position.x ||
					position.y !== previous.position.y ||
					rotation !== previous.rotation
				) {
					transformSnapshotRef.current = {
						position: { x: position.x, y: position.y },
						rotation,
					};
					didChange = true;
				}

				const snapshot = propertySnapshotRef.current;
				const keysSeen = new Set<PropertyKey>();
				const registered = getRegisteredPropertiesForInstance(actor);
				for (const property of registered) {
					const key = property.key;
					keysSeen.add(key);
					const currentValue = Reflect.get(actor, key);
					const previousValue = snapshot.get(key);
					if (!snapshot.has(key) || !Object.is(previousValue, currentValue)) {
						snapshot.set(key, currentValue);
						didChange = true;
					}
				}
				snapshot.forEach((_, key) => {
					if (!keysSeen.has(key)) {
						snapshot.delete(key);
						didChange = true;
					}
				});

				if (didChange) {
					setRevision((value) => value + 1);
				}
			}

			frameId = window.requestAnimationFrame(checkForTransformChanges);
		};

		frameId = window.requestAnimationFrame(checkForTransformChanges);

		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [selection]);

	const saveManifestType = useCallback(async () => {
		if (!selectedAsset) {
			return;
		}
		if (!selectedAsset.entryId) {
			setSaveTypeError("Select an asset entry to edit its manifest type.");
			return;
		}
		const containerPath = selectedAsset.containerPath ?? selectedAsset.path.split("#")[0] ?? selectedAsset.path;
		const nextType = manifestTypeInput.trim();
		if (nextType.length === 0) {
			setSaveTypeError("Type cannot be empty.");
			return;
		}

		setIsSavingType(true);
		setSaveTypeError(null);
		setSaveTypeMessage(null);

		try {
			const { buffer, assetService, header, manifest } = await loadContainerBuffer(containerPath);
			const entries = manifest.entries ?? [];
			const payloadEntries: AssetPayloadPackedEntry[] = entries.map((entry) => ({
				id: entry.id,
				name: entry.name,
				type: entry.type,
				contentType: entry.contentType,
				bytes: assetService.getEntryPayloadBytes(buffer, entry, header),
				hash: entry.hash,
				encoding: entry.encoding,
				metadata: entry.metadata ?? {},
			}));
			const entryIndex = entries.findIndex((entry) => entry.id === selectedAsset.entryId);
			if (entryIndex === -1) {
				throw new Error("Entry not found in manifest.");
			}
			payloadEntries[entryIndex].type = nextType;
			manifest.updatedAt = Date.now();
			await repackAndSaveContainer(containerPath, manifest, payloadEntries, assetService);
			setSelectedAsset((current) => (current ? { ...current, manifestType: nextType } : current));
			setSaveTypeMessage("Manifest type saved.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save manifest type.";
			setSaveTypeError(message);
		} finally {
			setIsSavingType(false);
		}
	}, [manifestTypeInput, selectedAsset]);

	const handleLevelPropertyValueChange = useCallback(
		(draftId: string, nextValue: string | Array<string | number | Vector2>) => {
			setLevelPropertyDrafts((previous) =>
				previous.map((draft) => (draft.id === draftId ? { ...draft, value: nextValue } : draft))
			);
		},
	[]
	);

	const handleLevelPropertyKeyChange = useCallback((draftId: string, nextKey: string) => {
		setLevelPropertyDrafts((previous) =>
			previous.map((draft) => (draft.id === draftId ? { ...draft, key: nextKey } : draft))
		);
	}, []);

	const handleLevelPropertyTypeChange = useCallback((draftId: string, nextType: string) => {
		setLevelPropertyDrafts((previous) =>
			previous.map((draft) => (draft.id === draftId ? { ...draft, type: nextType } : draft))
		);
	}, []);

	const handleAddLevelProperty = useCallback(() => {
		setLevelPropertyDrafts((previous) => [
			...previous,
			{
				id: `new-property-${Date.now()}-${Math.random().toString(36).slice(2)}`,
				index: -1,
				key: "",
				type: "string",
				value: "",
				isEditable: true,
				label: "New Property",
				description: undefined,
				canEditStructure: true,
				isNew: true,
			},
		]);
	}, []);

	const saveLevelType = useCallback(async () => {
		if (!selectedAsset || !isLevelAsset) {
			return;
		}
		if (!selectedAsset.entryId) {
			setLevelTypeError("Select a level entry to edit its type.");
			return;
		}
		const containerPath = selectedAsset.containerPath ?? selectedAsset.path.split("#")[0] ?? selectedAsset.path;
		const nextType = levelTypeInput.trim();
		if (nextType.length === 0) {
			setLevelTypeError("Level type cannot be empty.");
			return;
		}

		setIsSavingLevelType(true);
		setLevelTypeError(null);
		setLevelTypeMessage(null);

		try {
			const { buffer, assetService, header, manifest } = await loadContainerBuffer(containerPath);
			const entries = manifest.entries ?? [];
			const entryIndex = entries.findIndex((entry) => entry.id === selectedAsset.entryId);
			if (entryIndex === -1) {
				throw new Error("Entry not found in manifest.");
			}
			const existingBytes = assetService.getEntryPayloadBytes(buffer, entries[entryIndex], header);
			const currentJson = textDecoder.decode(existingBytes);
			const parsed = JSON.parse(currentJson) as Record<string, unknown>;
			parsed.type = nextType;
			const updatedBytes = textEncoder.encode(JSON.stringify(parsed, null, 2));
			const payloadEntries: AssetPayloadPackedEntry[] = entries.map((entry, idx) => ({
				id: entry.id,
				name: entry.name,
				type: entry.type,
				contentType: entry.contentType,
				bytes: idx === entryIndex ? updatedBytes : assetService.getEntryPayloadBytes(buffer, entry, header),
				hash: idx === entryIndex ? undefined : entry.hash,
				encoding: entry.encoding,
				metadata: entry.metadata ?? {},
			}));
			manifest.updatedAt = Date.now();
			await repackAndSaveContainer(containerPath, manifest, payloadEntries, assetService);
			setLevelTypeMessage("Level type saved.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save level type.";
			setLevelTypeError(message);
		} finally {
			setIsSavingLevelType(false);
		}
	}, [isLevelAsset, levelTypeInput, selectedAsset]);

	const saveLevelProperties = useCallback(async () => {
		if (!selectedAsset || !isLevelAsset) {
			return;
		}
		if (!selectedAsset.entryId) {
			setLevelPropertiesError("Select a level entry to edit properties.");
			return;
		}
		const containerPath = selectedAsset.containerPath ?? selectedAsset.path.split("#")[0] ?? selectedAsset.path;
		const invalidDraft = levelPropertyDrafts.find(
			(draft) => draft.isEditable && draft.canEditStructure && draft.key.trim().length === 0
		);
		if (invalidDraft) {
			setLevelPropertiesError("All editable level properties must have a key before saving.");
			return;
		}
		setIsSavingLevelProperties(true);
		setLevelPropertiesError(null);
		setLevelPropertiesMessage(null);

		try {
			const { buffer, assetService, header, manifest } = await loadContainerBuffer(containerPath);
			const entries = manifest.entries ?? [];
			const entryIndex = entries.findIndex((entry) => entry.id === selectedAsset.entryId);
			if (entryIndex === -1) {
				throw new Error("Entry not found in manifest.");
			}
			const payloadBytes = assetService.getEntryPayloadBytes(buffer, entries[entryIndex], header);
			const parsed = JSON.parse(textDecoder.decode(payloadBytes)) as { properties?: any[] };
			const rawProperties = Array.isArray(parsed.properties) ? parsed.properties : [];
			const draftLookup = new Map<string, LevelPropertyDraft>();
			for (const draft of levelPropertyDrafts) {
				if (!draft.isEditable) {
					continue;
				}
				draftLookup.set(draft.key, draft);
			}
			const updatedDraftKeys = new Set<string>();
			const updatedProperties = rawProperties.map((prop) => {
				const key = typeof prop?.key === "string" ? prop.key : undefined;
				if (!key) {
					return prop;
				}
				const draft = draftLookup.get(key);
				if (!draft) {
					return prop;
				}
				updatedDraftKeys.add(key);
				const resolvedType = normalizeDraftType(draft.type, typeof prop?.type === "string" ? prop.type : null);
				const serializedValue = buildSerializedValueForDraft(resolvedType, draft.value);
				return {
					...prop,
					key,
					type: resolvedType,
					value: serializedValue.value,
					properties: serializedValue.properties,
					node: null,
				};
			});
			const appendedDrafts = levelPropertyDrafts.filter(
				(draft) =>
					draft.isEditable &&
					draft.index < 0 &&
					draft.key.trim().length > 0 &&
					!updatedDraftKeys.has(draft.key)
			);
			const appendedStartIndex = updatedProperties.length;
			const appendedIndexMap = new Map<string, number>();
			const appendedProperties = appendedDrafts.map((draft, appendIndex) => {
				const trimmedKey = draft.key.trim();
				const nextIndex = appendedStartIndex + appendIndex;
				appendedIndexMap.set(trimmedKey, nextIndex);
				const resolvedType = normalizeDraftType(draft.type, "string") ?? "string";
				const serializedValue = buildSerializedValueForDraft(resolvedType, draft.value);
				return {
					key: trimmedKey,
					type: resolvedType,
					value: serializedValue.value,
					properties: serializedValue.properties,
					node: null,
				};
			});
			parsed.properties = [...updatedProperties, ...appendedProperties];
			const updatedBytes = textEncoder.encode(JSON.stringify(parsed, null, 2));
			const payloadEntries: AssetPayloadPackedEntry[] = entries.map((entry, idx) => ({
				id: entry.id,
				name: entry.name,
				type: entry.type,
				contentType: entry.contentType,
				bytes: idx === entryIndex ? updatedBytes : assetService.getEntryPayloadBytes(buffer, entry, header),
				hash: idx === entryIndex ? undefined : entry.hash,
				encoding: entry.encoding,
				metadata: entry.metadata ?? {},
			}));
			manifest.updatedAt = Date.now();
			await repackAndSaveContainer(containerPath, manifest, payloadEntries, assetService);
			setLevelPropertyDrafts((previous) =>
				previous.map((draft) => {
					if (!draft.isEditable) {
						return draft;
					}
					if (draft.index >= 0) {
						return { ...draft, isNew: false };
					}
					const trimmedKey = draft.key.trim();
					const nextIndex = appendedIndexMap.get(trimmedKey);
					if (typeof nextIndex === "number") {
						return {
							...draft,
							index: nextIndex,
							isNew: false,
							canEditStructure: false,
						};
					}
					return draft;
				})
			);
			setLevelPropertiesMessage("Level properties saved.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save level properties.";
			setLevelPropertiesError(message);
		} finally {
			setIsSavingLevelProperties(false);
		}
	}, [isLevelAsset, levelPropertyDrafts, selectedAsset]);

	if (selectedAsset) {
		const metadataEntries = Object.entries(selectedAsset.metadata ?? {});
		const formatValue = (value: unknown) => {
			if (value === null || value === undefined) {
				return "—";
			}
			if (typeof value === "object") {
				try {
					return JSON.stringify(value, null, 2);
				} catch (error) {
					console.warn("Failed to stringify metadata", error);
					return String(value);
				}
			}
			return String(value);
		};

		return (
			<div className="space-y-3 text-xs text-white/90">
				<section className="space-y-3">
					<header className="text-[11px] uppercase tracking-wide text-white/60">Asset Metadata</header>
					<div className="space-y-2 rounded border border-white/10 bg-white/5 p-3">
						<div className="space-y-1 text-white/80">
							<div className="flex items-center justify-between gap-2">
								<span className="text-[10px] uppercase text-white/50">Name</span>
								<span className="truncate text-white">{selectedAsset.name}</span>
							</div>
							<div className="flex items-center justify-between gap-2">
								<span className="text-[10px] uppercase text-white/50">Path</span>
								<span className="truncate text-white/80">{selectedAsset.path}</span>
							</div>
							{selectedAsset.containerPath ? (
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] uppercase text-white/50">Container</span>
									<span className="truncate text-white/80">{selectedAsset.containerPath}</span>
								</div>
							) : null}
							{selectedAsset.assetType ? (
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] uppercase text-white/50">Category</span>
									<span className="text-white/80">{selectedAsset.assetType}</span>
								</div>
							) : null}
							<div className="space-y-1">
								<div className="text-[10px] uppercase text-white/50">Manifest Type</div>
								<div className="flex items-center gap-2">
									<input
										type="text"
										className="flex-1 rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
										value={manifestTypeInput}
										onChange={(event) => setManifestTypeInput(event.target.value)}
										disabled={isSavingType || !selectedAsset.entryId}
									/>
									<button
										type="button"
										className="rounded border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
										onClick={() => void saveManifestType()}
										disabled={isSavingType || !selectedAsset.entryId}
									>
										{isSavingType ? "Saving..." : "Save"}
									</button>
								</div>
								{!selectedAsset.entryId ? (
									<p className="text-[10px] text-white/50">Select an entry inside the container to edit its manifest type.</p>
								) : null}
								{saveTypeError ? (
									<p className="text-[11px] text-red-300">{saveTypeError}</p>
								) : null}
								{saveTypeMessage ? (
									<p className="text-[11px] text-cyan-200">{saveTypeMessage}</p>
								) : null}
							</div>
							{selectedAsset.contentType ? (
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] uppercase text-white/50">Content Type</span>
									<span className="text-white/80">{selectedAsset.contentType}</span>
								</div>
							) : null}
							{selectedAsset.sizeBytes ? (
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] uppercase text-white/50">Size</span>
									<span className="text-white/80">{selectedAsset.sizeBytes.toLocaleString()} bytes</span>
								</div>
							) : null}
							{selectedAsset.entryId ? (
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] uppercase text-white/50">Entry ID</span>
									<span className="text-white/80">{selectedAsset.entryId}</span>
								</div>
							) : null}
						</div>
					</div>
					{isLevelAsset ? (
						<div className="space-y-3 rounded border border-white/10 bg-white/5 p-3">
							<div className="text-[10px] uppercase tracking-wide text-white/60">Level Settings</div>
							<div className="space-y-3">
								<div className="space-y-1">
									<div className="text-[10px] uppercase text-white/50">Level Type (Class)</div>
									<div className="flex items-center gap-2">
										<input
											type="text"
											className="flex-1 rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
											value={levelTypeInput}
											onChange={(event) => setLevelTypeInput(event.target.value)}
											disabled={isLoadingLevelType || isSavingLevelType || !selectedAsset.entryId}
											placeholder="e.g. GrasslandsMap"
										/>
										<button
											type="button"
											className="rounded border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
											onClick={() => void saveLevelType()}
											disabled={
												isLoadingLevelType ||
												isSavingLevelType ||
												!selectedAsset.entryId
											}
										>
											{isSavingLevelType ? "Saving..." : isLoadingLevelType ? "Loading..." : "Save"}
										</button>
									</div>
									<p className="text-[10px] text-white/40">
										This updates the serialized level's `type` field so future loads instantiate the selected class.
									</p>
									{!selectedAsset.entryId ? (
										<p className="text-[10px] text-white/50">
											Select a level entry inside the container to edit its type.
										</p>
									) : null}
									{levelTypeError ? (
										<p className="text-[11px] text-red-300">{levelTypeError}</p>
									) : null}
									{levelTypeMessage ? (
										<p className="text-[11px] text-cyan-200">{levelTypeMessage}</p>
									) : null}
								</div>
								<div className="space-y-2">
									<div className="text-[10px] uppercase text-white/50">Level Properties</div>
									{!selectedAsset.entryId ? (
										<p className="text-[11px] text-white/50">Select a level entry inside the container to edit its properties.</p>
									) : levelPropertyDrafts.length === 0 ? (
										<p className="text-[11px] text-white/60">No properties detected. Add one to get started.</p>
									) : (
										<div className="space-y-2">
											{levelPropertyDrafts.map((draft) => {
												const propertyType = draft.type ?? "string";
												const isVectorProperty = isVector2Type(propertyType);
												const vectorDraftComponents = isVectorProperty
													? parseVector2DraftValue(typeof draft.value === "string" ? draft.value : "")
													: null;
												const vectorDraftValue = vectorDraftComponents ? new Vector2(vectorDraftComponents.x, vectorDraftComponents.y) : null;
												const handleVectorChange = (next: Vector2) => {
													if (isSavingLevelProperties || !selectedAsset?.entryId) {
														return;
													}
													handleLevelPropertyValueChange(
														draft.id,
														formatVector2DraftValue({ x: next.x, y: next.y }),
													);
												};

												const renderDraftEditor = () => {
													const normalizedType = propertyType.trim().toLowerCase();
													if (isArrayType(normalizedType)) {
														const arrayValue = parseArrayDraftValue(draft.value);
														const itemType = inferArrayItemTypeFromName(propertyType) ?? "string";
														return (
															<ArrayEditor
																value={arrayValue}
																itemType={itemType}
																onChange={(next) => {
																	if (isSavingLevelProperties || !selectedAsset?.entryId) {
																		return;
																	}
																	handleLevelPropertyValueChange(draft.id, next);
																}}
															/>
														);
													}

													if (isVectorProperty && vectorDraftValue) {
														return <Vector2Editor value={vectorDraftValue} onChange={handleVectorChange} />;
													}

													return (
														<input
															type="text"
															className="w-full rounded border border-white/20 bg-slate-950 px-2 py-1 text-xs text-white"
															value={typeof draft.value === "string" ? draft.value : JSON.stringify(draft.value)}
															onChange={(event) => handleLevelPropertyValueChange(draft.id, event.target.value)}
															disabled={isSavingLevelProperties || !selectedAsset.entryId}
														/>
													);
												};
												return (
													<div
														key={draft.id}
														className="space-y-1 rounded border border-white/10 bg-slate-900/40 p-2"
													>
														<div className="flex flex-col gap-1 text-[10px] uppercase text-white/50">
															<div className="flex flex-wrap items-center justify-between gap-2">
																{draft.canEditStructure ? (
																	<input
																		type="text"
																		className="flex-1 rounded border border-white/20 bg-slate-950 px-2 py-1 text-[11px] capitalize text-white"
																		value={draft.key}
																		onChange={(event) => handleLevelPropertyKeyChange(draft.id, event.target.value)}
																		disabled={isSavingLevelProperties || !selectedAsset.entryId}
																		placeholder="Property key (e.g. gameMode)"
																	/>
																) : (
																	<span className="truncate text-white">{draft.label ?? draft.key}</span>
																)}
																<div className="flex items-center gap-2 text-white/40">
																	{draft.canEditStructure ? (
																		<input
																			type="text"
																			className="w-32 rounded border border-white/20 bg-slate-950 px-2 py-1 text-[11px] lowercase text-white"
																			value={propertyType}
																			onChange={(event) => handleLevelPropertyTypeChange(draft.id, event.target.value)}
																			disabled={isSavingLevelProperties || !selectedAsset.entryId}
																			placeholder="type"
																		/>
																	) : (
																		<span>{propertyType}</span>
																	)}
																	{draft.isNew ? <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">New</span> : null}
																</div>
															</div>
															{draft.description ? (
																<p className="text-[10px] normal-case text-white/45">{draft.description}</p>
															) : null}
														</div>
														{draft.isEditable ? (
															renderDraftEditor()
														) : (
															<p className="text-[11px] text-white/45">Nested property editing is not supported yet.</p>
														)}
													</div>
												);
											})}
										</div>
									)}
									<div className="space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<button
												type="button"
												className="rounded border border-dashed border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
												onClick={handleAddLevelProperty}
												disabled={isSavingLevelProperties || !selectedAsset.entryId}
											>
												Add Property
											</button>
											<button
												type="button"
												className="rounded border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
												onClick={() => void saveLevelProperties()}
												disabled={
													isSavingLevelProperties ||
													!selectedAsset.entryId ||
													levelPropertyDrafts.length === 0
												}
											>
												{isSavingLevelProperties ? "Saving..." : "Save Level Properties"}
											</button>
										</div>
										{levelPropertiesError ? (
											<p className="text-[11px] text-red-300">{levelPropertiesError}</p>
										) : null}
										{levelPropertiesMessage ? (
											<p className="text-[11px] text-cyan-200">{levelPropertiesMessage}</p>
										) : null}
									</div>
								</div>
							</div>
						</div>
					) : null}
					<div className="space-y-2 rounded border border-white/10 bg-white/5 p-3">
						<div className="text-[10px] uppercase tracking-wide text-white/60">Metadata Properties</div>
						{metadataEntries.length === 0 ? (
							<div className="text-[11px] text-white/60">No metadata found for this asset.</div>
						) : (
							<div className="space-y-2">
								{metadataEntries.map(([key, value]) => (
									<div key={key} className="space-y-1 rounded border border-white/10 bg-slate-900/40 p-2">
										<div className="text-[10px] uppercase text-white/50">{key}</div>
										<pre className="whitespace-pre-wrap break-words text-[11px] text-white/85">{formatValue(value)}</pre>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			</div>
		);
	}

	if (selection.length === 0) {
		return <div className="text-xs text-white/70">Select an actor to edit transform values.</div>;
	}

	if (selection.length > 1) {
		return <div className="text-xs text-white/70">Multiple actors selected. Transform editing is unavailable.</div>;
	}

	const actor = selection[0];
	const position = actor.position;
	const rotationDegrees = radiansToDegrees(actor.rotation);
	const registeredProperties = actor ? editor.getPropertiesForInstance(actor) : [];
	const propertyGroups: Array<{ owner: string; properties: Property[] }> = [];
	const groupLookup = new Map<string, Property[]>();

	const formatOwner = (target: unknown) => {
		if (typeof target === "string" && target.length > 0) {
			return target;
		}
		if (!target || typeof target !== "function") {
			return "Prototype";
		}
		if (target.name) {
			return target.name;
		}
		const descriptor = Object.getOwnPropertyDescriptor(target, "name");
		if (descriptor && typeof descriptor.value === "string" && descriptor.value.length > 0) {
			return descriptor.value;
		}
		return target.constructor?.name ?? "Prototype";
	};

	for (const property of registeredProperties) {
		if (typeof property.key === "symbol") {
			continue;
		}
		const owner = formatOwner(property.target).replace(/\d+$/, "");
		let group = groupLookup.get(owner);
		if (!group) {
			group = [];
			groupLookup.set(owner, group);
			propertyGroups.push({ owner, properties: group });
		}
		group.push(property);
	}

	const renderPropertyControl = (property: Property) => {
		if (typeof property.key === "symbol") {
			return null;
		}
		const key = property.key;
		const label = formatPropertyLabel(property);
		const description = property.description;
		const currentValue = editor.getPropertyValue(actor, property);
		const applyValue = (nextValue: unknown) => {
			if (Object.is(currentValue, nextValue)) {
				return;
			}
			try {
				Reflect.set(actor, key, nextValue);
				propertySnapshotRef.current.set(key, nextValue);
				setRevision((revision) => revision + 1);
			} catch (error) {
				console.warn(`Failed to set property ${String(key)}`, error);
			}
		};

		if (property.choices && property.choices.length > 0) {
			const normalized = property.choices.map(normalizeChoice);
			const selected = normalized.find((entry) => Object.is(entry.value, currentValue));
			const selectValue = selected?.key ?? "__placeholder__";
			return (
				<label key={key} className="flex flex-col gap-1">
					<span className="text-[10px] uppercase text-white/50">{label}</span>
					<select
						className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
						value={selectValue}
						onChange={(event) => {
							if (event.target.value === "__placeholder__") {
								return;
							}
							const match = normalized.find((entry) => entry.key === event.target.value);
							if (match) {
								applyValue(match.value);
							}
						}}
					>
						<option value="__placeholder__" disabled>
							Select a value
						</option>
						{normalized.map((entry) => (
							<option key={entry.key} value={entry.key}>
								{entry.label}
							</option>
						))}
					</select>
					{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
				</label>
			);
		}

			const resolvedType = (property.valueType as unknown) ?? property.designType;
			if (resolvedType === Vector2 || property.valueTypeName === "Vector2" || property.type === "Vector2") {
				const vector = currentValue instanceof Vector2 ? currentValue : new Vector2(0, 0);
				return (
					<Vector2Editor
						key={key}
						label={label}
						value={vector}
						onChange={(next) => applyValue(next)}
						description={description}
					/>
				);
			}

			switch (property.type) {
			case "Boolean": {
				return (
					<div key={key} className="space-y-1 rounded border border-white/10 bg-white/5 px-3 py-2">
						<label className="flex items-center justify-between gap-2">
							<span className="text-[10px] uppercase text-white/60">{label}</span>
							<input
								type="checkbox"
								checked={Boolean(currentValue)}
								onChange={(event) => applyValue(event.target.checked)}
							/>
						</label>
						{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
					</div>
				);
			}
			case "Number": {
				return (
					<label key={key} className="flex flex-col gap-1">
						<span className="text-[10px] uppercase text-white/50">{label}</span>
						<NumberEditor
							value={typeof currentValue === "number" ? currentValue : 0}
							step={1}
							onChange={(value) => applyValue(value)}
						/>
						{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
					</label>
				);
			}
			default: {
				return (
					<label key={key} className="flex flex-col gap-1">
						<span className="text-[10px] uppercase text-white/50">{label}</span>
						<input
							type="text"
							className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
							value={typeof currentValue === "string" ? currentValue : String(currentValue ?? "")}
							onChange={(event) => applyValue(event.target.value)}
						/>
						{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
					</label>
				);
			}
		}
	};

	return (
		<div className="space-y-3 text-xs text-white/90">
			{propertyGroups.length > 0 ? (
				<section className="space-y-3">
					<header className="text-[11px] uppercase tracking-wide text-white/60">Properties</header>
					<div className="space-y-3">
						{propertyGroups.map(({ owner, properties }) => (
							<div key={owner} className="space-y-2 rounded border border-white/10 bg-white/5 p-3">
								<div className="text-[10px] uppercase tracking-wide text-white/50">{owner}</div>
								<div className="space-y-2">
									{properties.map((property) => renderPropertyControl(property))}
								</div>
							</div>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
};

const transformPropertiesPlugin: EditorUIPlugin = {
	id: "builtin.transform-properties",
	activate: ({ panels }) => {
		const unregisterPanel = panels.register({
			id: "builtin.transform-properties.panel",
			title: "Properties",
			location: "right",
			order: 100,
			render: ({ editor }) => <PropertiesPanel editor={editor} />,
		});

		return () => {
			unregisterPanel();
		};
	},
};

export { transformPropertiesPlugin };
