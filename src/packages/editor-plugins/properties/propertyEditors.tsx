import type { ReactNode } from "react";
import { Vector2 } from "@repo/engine";
import { ArrayEditor, NumberEditor, Vector2Editor } from "@repo/ui";
import type { ValueKind, ScalarKind } from "./propertyTypeUtils";

export type EditorContext = {
  value: unknown;
  label?: string;
  description?: string;
  onChange: (next: unknown) => void;
};

type EditorRenderer = (ctx: EditorContext) => ReactNode;

const renderLabeled = (props: {
  label?: string;
  description?: string;
  body: ReactNode;
}) => {
  const { label, description, body } = props;
  return (
    <label className="flex flex-col gap-1">
      {label ? <span className="text-[10px] uppercase text-white/50">{label}</span> : null}
      {body}
      {description ? <p className="text-[10px] text-white/40">{description}</p> : null}
    </label>
  );
};

const scalarEditors: Record<ScalarKind, EditorRenderer> = {
  number: ({ value, label, description, onChange }) =>
    renderLabeled({
      label,
      description,
      body: (
        <NumberEditor
          value={typeof value === "number" ? value : 0}
          step={1}
          onChange={(v) => onChange(v)}
        />
      ),
    }),

  vector2: ({ value, label, description, onChange }) =>
    renderLabeled({
      label,
      description,
      body: (
        <Vector2Editor
          value={value instanceof Vector2 ? value : new Vector2(0, 0)}
          onChange={(v) => onChange(v)}
        />
      ),
    }),

  boolean: ({ value, label, description, onChange }) => (
    <div className="space-y-1 rounded border border-white/10 bg-white/5 px-3 py-2">
      <label className="flex items-center justify-between gap-2">
        {label ? (
          <span className="text-[10px] uppercase text-white/60">{label}</span>
        ) : null}
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
      {description ? <p className="text-[10px] text-white/40">{description}</p> : null}
    </div>
  ),

  string: ({ value, label, description, onChange }) =>
    renderLabeled({
      label,
      description,
      body: (
        <input
          type="text"
          className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
          value={typeof value === "string" ? value : String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ),
    }),

  component: ({ value, label, description }) => {
    const text =
      value && typeof value === "object"
        ? (value as any).constructor?.name ?? "(component)"
        : "(component)";
    return renderLabeled({
      label,
      description,
      body: <div className="text-[11px] text-white/80">{text}</div>,
    });
  },

  unknown: ({ value, label, description, onChange }) =>
    // Fallback to string representation
    scalarEditors.string({ value, label, description, onChange }),
};

const mapScalarToArrayItemType = (kind: ScalarKind): "string" | "number" | "vector2" | "component" => {
  switch (kind) {
    case "number":
      return "number";
    case "vector2":
      return "vector2";
    case "component":
      return "component";
    case "boolean":
    case "string":
    default:
      return "string";
  }
};

export const renderEditorForKind = (
  kind: ValueKind,
  ctx: EditorContext,
): ReactNode => {
  if (kind.collection === "array") {
    const itemType = mapScalarToArrayItemType(kind.item);
    return renderLabeled({
      label: ctx.label,
      description: ctx.description,
      body: (
        <ArrayEditor
          value={Array.isArray(ctx.value) ? (ctx.value as any[]) : []}
          itemType={itemType as any}
          onChange={(next) => ctx.onChange(next)}
        />
      ),
    });
  }

  const renderer = scalarEditors[kind.item] ?? scalarEditors.unknown;
  return renderer(ctx);
};
