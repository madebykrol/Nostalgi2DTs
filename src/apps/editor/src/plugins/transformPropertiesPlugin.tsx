import { useCallback, useEffect, useRef, useState } from "react";
import { Actor, Editor, Vector2 } from "@repo/engine";
import { EditorUIPlugin } from "@repo/engine";
import { Number } from "../components/number";

const radiansToDegrees = (value: number): number => (value * 180) / Math.PI;
const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

type TransformPropertiesPanelProps = {
	editor: Editor;
};

const TransformPropertiesPanel = ({ editor }: TransformPropertiesPanelProps) => {
	const [selection, setSelection] = useState<Actor[]>(() => editor.getSelectedActors());
	const [, setRevision] = useState(0);
	const transformSnapshotRef = useRef<{ position: { x: number; y: number }; rotation: number }>(
		{ position: { x: 0, y: 0 }, rotation: 0 }
	);

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

			const current = actor.getPosition();
			const next =
				axis === "x"
					? new Vector2(value, current.y)
					: new Vector2(current.x, value);

			actor.setPosition(next);
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

			actor.setRotation(degreesToRadians(value));
			setRevision((revision) => revision + 1);
		},
		[selection]
	);

	useEffect(() => {
		let frameId = 0;
		let cancelled = false;

		const checkForTransformChanges = () => {
			if (cancelled) {
				return;
			}

			const actor = selection[0] ?? null;
			if (actor) {
				const position = actor.getPosition();
				const rotation = actor.getRotation();
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
	const position = actor.getPosition();
	const rotationDegrees = radiansToDegrees(actor.getRotation());

	return (
		<div className="space-y-3 text-xs text-white/90">
			<section className="space-y-2">
				<header className="text-[11px] uppercase tracking-wide text-white/60">Position</header>
				<div className="flex gap-2">
					<label className="flex flex-1 flex-col gap-1">
						<span className="text-[10px] uppercase text-white/50">X</span>
						<Number
							value={position.x}
							step={0.1}
							onChange={handlePositionChange("x")}
						/>
					</label>
					<label className="flex flex-1 flex-col gap-1">
						<span className="text-[10px] uppercase text-white/50">Y</span>
						<Number
							value={position.y}
							step={0.1}
							onChange={handlePositionChange("y")}
						/>
					</label>
				</div>
			</section>
			<section className="space-y-2">
				<header className="text-[11px] uppercase tracking-wide text-white/60">Rotation</header>
				<label className="flex flex-col gap-1">
					<span className="text-[10px] uppercase text-white/50">Degrees</span>
					<Number
						value={rotationDegrees}
						step={1}
						onChange={handleRotationChange}
					/>
				</label>
			</section>
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
			render: ({ editor }) => <TransformPropertiesPanel editor={editor} />,
		});

		return () => {
			unregisterPanel();
		};
	},
};

export default transformPropertiesPlugin;
