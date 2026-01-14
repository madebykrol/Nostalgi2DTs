import { useCallback, useEffect, useMemo, useState } from "react";
import { NumberEditor } from "./number";
import { Vector2Editor } from "./vector2";
import { Vector2 } from "@repo/engine";

type ItemType = "string" | "number" | "vector2";

type ArrayEditorProps = {
    value: Array<string | number | Vector2>;
    onChange: (next: Array<string | number | Vector2>) => void;
    itemType: ItemType;
    label?: string;
    description?: string;
};

/**
 * Array editor for primitive and vector values.
 * - strings use a text input
 * - numbers use NumberEditor
 * - vector2 uses Vector2Editor
 */
export const ArrayEditor = ({ value, onChange, itemType, label, description }: ArrayEditorProps) => {
    const [items, setItems] = useState<Array<string | number | Vector2>>(value ?? []);

    useEffect(() => {
        setItems(value ?? []);
    }, [value]);

    const handleCommit = useCallback(
        (next: Array<string | number | Vector2>) => {
            setItems(next);
            onChange(next);
        },
        [onChange]
    );

    const handleItemChange = useCallback(
        (index: number, nextValue: string | number | Vector2) => {
            const next = [...items];
            next[index] = nextValue;
            handleCommit(next);
        },
        [items, handleCommit]
    );

    const handleAdd = useCallback(() => {
        const nextItem: string | number | Vector2 =
            itemType === "number" ? 0 : itemType === "vector2" ? new Vector2(0, 0) : "";
        handleCommit([...items, nextItem]);
    }, [items, itemType, handleCommit]);

    const handleRemove = useCallback(
        (index: number) => {
            const next = items.filter((_, i) => i !== index);
            handleCommit(next);
        },
        [items, handleCommit]
    );

    const renderEditor = useCallback(
        (item: string | number | Vector2, index: number) => {
            switch (itemType) {
                case "number":
                    return (
                        <NumberEditor
                            value={typeof item === "number" ? item : 0}
                            onChange={(v) => handleItemChange(index, v)}
                        />
                    );
                case "vector2":
                    return (
                        <Vector2Editor
                            value={item instanceof Vector2 ? item : new Vector2(0, 0)}
                            onChange={(v) => handleItemChange(index, v)}
                        />
                    );
                default:
                    return (
                        <input
                            type="text"
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-white/30 focus:outline-none"
                            value={typeof item === "string" ? item : String(item ?? "")}
                            onChange={(e) => handleItemChange(index, e.target.value)}
                        />
                    );
            }
        },
        [handleItemChange, itemType]
    );

    const header = useMemo(() => {
        if (!label && !description) return null;
        return (
            <div className="flex items-center justify-between mb-2">
                {label ? <div className="text-[10px] uppercase text-white/60">{label}</div> : <span />}
                {description ? <div className="text-[10px] text-white/40">{description}</div> : null}
            </div>
        );
    }, [label, description]);

    return (
        <div className="space-y-2">
            {header}
            <div className="space-y-2">
                {items.length === 0 ? (
                    <div className="text-[11px] text-white/40">No items</div>
                ) : (
                    items.map((item, index) => (
                        <div key={index} className="flex items-start gap-2">
                            <div className="flex-1">{renderEditor(item, index)}</div>
                            <button
                                className="text-[11px] text-red-300 hover:text-red-200"
                                onClick={() => handleRemove(index)}
                            >
                                Remove
                            </button>
                        </div>
                    ))
                )}
            </div>
            <button
                className="text-[11px] text-cyan-300 hover:text-cyan-200"
                onClick={handleAdd}
            >
                Add
            </button>
        </div>
    );
};