import { useCallback, useEffect, useRef, useState } from "react";
import {
	Actor,
	Editor,
	EditorUIPlugin,
	Vector2,
	getRegisteredPropertiesForInstance,
	RegisteredProperty,
} from "@repo/engine";
import { Number } from "@repo/ui";

const radiansToDegrees = (value: number): number => (value * 180) / Math.PI;
const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

const formatPropertyLabel = (property: RegisteredProperty) => {
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
	const [, setRevision] = useState(0);
	const transformSnapshotRef = useRef<{ position: { x: number; y: number }; rotation: number }>(
		{ position: { x: 0, y: 0 }, rotation: 0 }
	);
	const propertySnapshotRef = useRef<Map<PropertyKey, unknown>>(new Map());

	useEffect(() => {
		const handleSelectionChanged = () => {
			setSelection(editor.getSelectedActors());
			setRevision((value) => value + 1);
		};

		editor.subscribe("actor:selected", handleSelectionChanged);
		return () => {
			editor.unsubscribe("actor:selected", handleSelectionChanged);
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

	if (selection.length === 0) {
		return <div className="text-xs text-white/70">Select an actor to edit transform values.</div>;
	}

	if (selection.length > 1) {
		return <div className="text-xs text-white/70">Multiple actors selected. Transform editing is unavailable.</div>;
	}

	const actor = selection[0];
	const position = actor.position;
	const rotationDegrees = radiansToDegrees(actor.rotation);
	const registeredProperties = actor ? getRegisteredPropertiesForInstance(actor) : [];
	const propertyGroups: Array<{ owner: string; properties: RegisteredProperty[] }> = [];
	const groupLookup = new Map<string, RegisteredProperty[]>();

	const formatOwner = (target: Function | undefined) => {
		if (!target) {
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

	const renderPropertyControl = (property: RegisteredProperty) => {
		if (typeof property.key === "symbol") {
			return null;
		}
		const key = property.key;
		const label = formatPropertyLabel(property);
		const description = property.description;
		const currentValue = Reflect.get(actor, key);
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

export default transformPropertiesPlugin;
