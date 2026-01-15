
import { NumberEditor } from "./number";
import { Vector2 } from "@repo/engine";

type Vector2EditorProps = {
	label?: string;
	description?: string | null;
	value: Vector2;
	step?: number;
	onChange: (next: Vector2) => void;
	fieldLabels?: { x?: string; y?: string };
};

export const Vector2Editor = ({ label, description, value, onChange, step = 0.1, fieldLabels }: Vector2EditorProps) => {
	const setAxis = (axis: "x" | "y") => (nextValue: number) => {
		const next = new Vector2(value.x, value.y);
		next[axis] = nextValue;
		onChange(next);
	};
	return (
		<div className="space-y-2">
			{label ? <div className="text-[10px] uppercase text-white/50">{label}</div> : null}
			<div className="grid grid-cols-2 gap-2">
				<label className="flex flex-col gap-1">
					<span className="text-[10px] uppercase text-white/40">{fieldLabels?.x ?? "X"}</span>
					<NumberEditor value={value.x} step={step} onChange={setAxis("x")} />
				</label>
				<label className="flex flex-col gap-1">
					<span className="text-[10px] uppercase text-white/40">{fieldLabels?.y ?? "Y"}</span>
					<NumberEditor value={value.y} step={step} onChange={setAxis("y")} />
				</label>
			</div>
			{description ? <p className="text-[10px] text-white/40">{description}</p> : null}
		</div>
	);
};