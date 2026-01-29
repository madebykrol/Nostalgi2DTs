import { useCallback, useEffect, useMemo, useState } from "react";
import { NumberEditor } from "./number";
import { Vector2Editor } from "./vector2";
import { Vector2, Component as EngineComponent } from "@nostalgi2d/engine";

type ItemType = "string" | "number" | "vector2" | "component";

type ArrayEditorProps = {
    value: Array<string | number | Vector2 | EngineComponent>;
    onChange: (next: Array<string | number | Vector2 | EngineComponent>) => void;
    itemType: ItemType;
    label?: string;
    description?: string;
    onEditItem?: (item: EngineComponent, index: number) => void;
};

/**
 * Array editor for primitive and vector values.
 * - strings use a text input
 * - numbers use NumberEditor
 * - vector2 uses Vector2Editor
 */
export const ArrayEditor = ({ value, onChange, itemType, label, description, onEditItem }: ArrayEditorProps) => {
    const [items, setItems] = useState<Array<string | number | Vector2 | EngineComponent>>(value ?? []);

    useEffect(() => {
        setItems(value ?? []);
    }, [value]);

    const handleCommit = useCallback(
        (next: Array<string | number | Vector2 | EngineComponent>) => {
            setItems(next);
            onChange(next);
        },
        [onChange]
    );

    const handleItemChange = useCallback(
        (index: number, nextValue: string | number | Vector2 | EngineComponent) => {
            const next = [...items];
            next[index] = nextValue;
            handleCommit(next);
        },
        [items, handleCommit]
    );

    const handleAdd = useCallback(() => {
        if (itemType === "component") {
            // Component arrays are currently read-only; do not allow adding new items here
            return;
        }
        const nextItem: string | number | Vector2 | EngineComponent =
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
        (item: string | number | Vector2 | EngineComponent, index: number) => {
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
                case "component":
                    return (
                        <div className="text-[11px] text-white/80">
                            {item instanceof EngineComponent
                                    ? item.constructor.name
                                    : String(item ?? "(component)")}
                        </div>
                    );
                default:
                    return (
                        <>
                        <b>{itemType}</b>
                        <input
                            type="text"
                            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-white/30 focus:outline-none"
                            value={typeof item === "string" ? item : String(item ?? "")}
                            onChange={(e) => handleItemChange(index, e.target.value)}
                        /></>
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
                            <div className="flex flex-col items-center gap-1">
                                {itemType === "component" && onEditItem ? (
                                    <button
                                        type="button"
                                        className="rounded border border-white/20 bg-slate-900/60 p-1 text-white/80 hover:bg-white/10"
                                        title="Edit component"
                                        onClick={() => {
                                            if (item instanceof EngineComponent) {
                                                onEditItem(item, index);
                                            }
                                        }}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            className="h-3 w-3"
                                            aria-hidden="true"
                                        >
                                            <path
                                                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
                                                fill="currentColor"
                                            />
                                            <path
                                                d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"
                                                fill="currentColor"
                                            />
                                        </svg>
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className="rounded border border-red-500/40 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20"
                                    title="Remove item"
                                    onClick={() => handleRemove(index)}
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        className="h-3 w-3"
                                        aria-hidden="true"
                                    >
                                        <path
                                            d="M6 7h12v13H6z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M9 4h6v2H9z"
                                            fill="currentColor"
                                        />
                                        <path
                                            d="M5 6h14v2H5z"
                                            fill="currentColor"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <button
                className="text-[11px] text-cyan-300 hover:text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleAdd}
                disabled={itemType === "component"}
            >
                Add
            </button>
        </div>
    );
};