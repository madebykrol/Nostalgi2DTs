import { useCallback, useEffect, useRef, useState } from "react";
import {
	Actor,
	Editor,
	EditorUIPlugin,
	Vector2,
	getRegisteredPropertiesForInstance,
	Property,
 	AssetService,
 	AssetPayloadPackedEntry,
} from "@repo/engine";
import { Number } from "@repo/ui";

const radiansToDegrees = (value: number): number => (value * 180) / Math.PI;
const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

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
	const [, setRevision] = useState(0);
	const transformSnapshotRef = useRef<{ position: { x: number; y: number }; rotation: number }>(
		{ position: { x: 0, y: 0 }, rotation: 0 }
	);
	const propertySnapshotRef = useRef<Map<PropertyKey, unknown>>(new Map());

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
			const entries = manifest.entries ?? [];
			const payloadEntries: AssetPayloadPackedEntry[] = entries.map((entry) => {
				const bytes = assetService.getEntryPayloadBytes(buffer, entry, header);
				return {
					id: entry.id,
					name: entry.name,
					type: entry.type,
					contentType: entry.contentType,
					bytes,
					hash: entry.hash,
					encoding: entry.encoding,
					metadata: entry.metadata ?? {},
				};
			});
			const entryIndex = entries.findIndex((entry) => entry.id === selectedAsset.entryId);
			if (entryIndex === -1) {
				throw new Error("Entry not found in manifest.");
			}
			entries[entryIndex].type = nextType;
			payloadEntries[entryIndex].type = nextType;
			manifest.updatedAt = Date.now();
			manifest.entries = entries;

			const packed = await assetService.packAsset(manifest, payloadEntries);
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
			setSelectedAsset((current) => (current ? { ...current, manifestType: nextType } : current));
			setSaveTypeMessage("Manifest type saved.");
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to save manifest type.";
			setSaveTypeError(message);
		} finally {
			setIsSavingType(false);
		}
	}, [manifestTypeInput, selectedAsset]);

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
				const vector = currentValue instanceof Vector2 ? currentValue : new Vector2(
					0, 0
				);
				const setAxis = (axis: "x" | "y") => (value: number) => {
					const next = new Vector2(vector.x, vector.y);
					next[axis] = value;
					applyValue(next);
				};
				return (
					<div key={key} className="space-y-2">
						<div className="text-[10px] uppercase text-white/50">{label}</div>
						<div className="grid grid-cols-2 gap-2">
							<label className="flex flex-col gap-1">
								<span className="text-[10px] uppercase text-white/40">X</span>
								<Number value={vector.x} step={0.1} onChange={setAxis("x")} />
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-[10px] uppercase text-white/40">Y</span>
								<Number value={vector.y} step={0.1} onChange={setAxis("y")} />
							</label>
						</div>
						{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
					</div>
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
						<Number
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
