import type { MouseEvent } from "react";
import { theme } from "../theme";

export const MenuButton = ({ label, onClick }: { label: string; onClick?: (event: MouseEvent<HTMLButtonElement>) => void }) => (
  <button
    className="px-3 py-1.5 text-xs rounded-lg transition-all border border-transparent hover:border-cyan-400/30 hover:bg-cyan-400/10"
    style={{ color: theme.text }}
    onClick={onClick}
  >
    {label}
  </button>
);

export const IconButton = ({
  icon: Icon,
  tooltip,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) => (
  <button
    className={`p-2 rounded-lg transition-all border border-transparent hover:border-cyan-400/50 hover:bg-cyan-400/10 ${
      disabled ? "opacity-50 cursor-not-allowed" : ""
    }`}
    style={{ color: theme.text }}
    title={tooltip}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
  >
    <Icon className="h-4 w-4" />
  </button>
);

export const ToolButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
      active
        ? "border-cyan-400/60 bg-cyan-400/20 text-white"
        : "border-white/10 text-slate-200 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white"
    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    style={{
      boxShadow: active ? "0 0 12px rgba(8, 247, 254, 0.35)" : undefined,
    }}
    aria-pressed={active ?? false}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);
