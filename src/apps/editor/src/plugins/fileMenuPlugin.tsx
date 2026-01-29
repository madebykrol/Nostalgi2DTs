import { useMemo, useState } from "react";
import type { EditorUIPlugin } from "@nostalgi2d/engine";
import { createBlankLevelAsset } from "../services/resourceLoader";

const LEVEL_TYPE_SUGGESTIONS = [
  { id: "Level", label: "Level (base class)" },
  { id: "GrasslandsMap", label: "GrasslandsMap (example)" },
];

const ensureLevelFilePath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized.length === 0) {
    return "";
  }
  return normalized.toLowerCase().endsWith(".n2asset") ? normalized : `${normalized}.n2asset`;
};

const FileMenuModal = ({ onClose, onNew }: { onClose: () => void; onNew: () => void }) => (
  <div className="fixed inset-0 z-[2050] flex items-start justify-center bg-black/60 p-6">
    <div className="mt-24 w-[320px] rounded-2xl border border-white/10 bg-[#050914] text-white shadow-[0_25px_80px_rgba(5,9,20,0.65)]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.5em] text-white/40">File</p>
          <p className="text-lg font-semibold">Project Actions</p>
        </div>
        <button
          type="button"
          className="rounded-md border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
          onClick={onClose}
        >
          Close
        </button>
      </header>
      <ul className="divide-y divide-white/5 text-sm">
        <li>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/5"
            onClick={onNew}
          >
            <div>
              <p className="font-semibold text-white">New…</p>
              <p className="text-xs text-white/60">Create fresh levels or assets</p>
            </div>
            <span className="text-xs text-white/40">Ctrl+N</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
);

const CreationOptionCard = ({
  title,
  description,
  active,
  onSelect,
}: {
  title: string;
  description: string;
  active: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    className={`flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left transition-all ${
      active ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/10 hover:border-cyan-400/40 hover:bg-white/5"
    }`}
    onClick={onSelect}
  >
    <span className="text-sm font-semibold text-white">{title}</span>
    <span className="text-xs text-white/60">{description}</span>
  </button>
);

const NewAssetModal = ({ onClose }: { onClose: () => void }) => {
  const creationOptions = useMemo(
    () => [
      {
        id: "level",
        title: "Level",
        description: "Start from a blank playable space",
      },
    ],
    []
  );
  const [selectedOption, setSelectedOption] = useState<string>(creationOptions[0]?.id ?? "level");
  const [levelName, setLevelName] = useState("New Level");
  const [levelPath, setLevelPath] = useState(() => {
    const suffix = Date.now().toString(36);
    return `levels/new-level-${suffix}.n2asset`;
  });
  const [levelType, setLevelType] = useState(LEVEL_TYPE_SUGGESTIONS[0]?.id ?? "Level");
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateLevel = async () => {
    const trimmedPath = levelPath.trim();
    const trimmedName = levelName.trim() || "New Level";
    const trimmedType = levelType.trim() || "Level";
    const resolvedPath = ensureLevelFilePath(trimmedPath);
    if (resolvedPath.length === 0) {
      setStatus({ kind: "error", message: "Please provide a file path" });
      return;
    }
    setLevelPath(resolvedPath);
    setLevelType(trimmedType);
    setIsSubmitting(true);
    setStatus({ kind: "idle" });
    try {
      await createBlankLevelAsset(resolvedPath, { levelName: trimmedName, levelType: trimmedType });
      setStatus({ kind: "success", message: `Created ${resolvedPath}` });
    } catch (error: any) {
      setStatus({ kind: "error", message: error?.message ?? "Failed to create level" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const showLevelForm = selectedOption === "level";

  return (
    <div className="fixed inset-0 z-[2050] flex items-start justify-center bg-black/70 p-6">
      <div className="mt-20 w-[640px] rounded-2xl border border-white/10 bg-[#050914] text-white shadow-[0_25px_80px_rgba(5,9,20,0.65)]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.5em] text-white/40">Create</p>
            <p className="text-lg font-semibold">New Asset</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/15 px-3 py-1 text-xs uppercase tracking-wide text-white/70 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="grid gap-6 px-5 py-5 sm:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            {creationOptions.map((option) => (
              <CreationOptionCard
                key={option.id}
                title={option.title}
                description={option.description}
                active={selectedOption === option.id}
                onSelect={() => setSelectedOption(option.id)}
              />
            ))}
          </div>
          {showLevelForm ? (
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm">
              <div>
                <p className="text-base font-semibold text-white">Blank Level</p>
                <p className="text-xs text-white/60">Creates an empty Level asset stored as a .n2asset container.</p>
              </div>
              <label className="block text-xs uppercase tracking-[0.3em] text-white/50">
                Level Name
                <input
                  type="text"
                  value={levelName}
                  onChange={(event) => setLevelName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.3em] text-white/50">
                File Path
                <input
                  type="text"
                  value={levelPath}
                  onChange={(event) => setLevelPath(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                  placeholder="levels/my-level.n2asset"
                />
              </label>
              <label className="block text-xs uppercase tracking-[0.3em] text-white/50">
                Level Type (class)
                <input
                  type="text"
                  list="level-type-suggestions"
                  value={levelType}
                  onChange={(event) => setLevelType(event.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-cyan-400/60 focus:outline-none"
                  placeholder="Level or YourCustomLevel"
                />
                <datalist id="level-type-suggestions">
                  {LEVEL_TYPE_SUGGESTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
                <span className="mt-1 block text-[10px] lowercase tracking-[0.3em] text-white/40">
                  Pick or type the class registered with the editor container.
                </span>
              </label>
              {status.kind !== "idle" ? (
                <div
                  className={`text-xs ${status.kind === "success" ? "text-emerald-300" : "text-red-300"}`}
                >
                  {status.message}
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/10"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black disabled:opacity-60"
                  onClick={handleCreateLevel}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating…" : "Create Level"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              <p>Select an item on the left to continue.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const fileMenuPlugin: EditorUIPlugin = {
  id: "builtin.file-menu",
  activate: ({ modalTriggers, modals }) => {
    const openNewAssetModal = () => {
      modals.open((api) => <NewAssetModal onClose={api.close} />);
    };

    const unregisterFileMenu = modalTriggers.register({
      id: "builtin.file-menu.trigger",
      event: "toolbar.menu",
      menuId: "file",
      order: -20,
      render: (_context, api) => (
        <FileMenuModal
          onClose={api.close}
          onNew={() => {
            api.close();
            openNewAssetModal();
          }}
        />
      ),
    });

    return () => {
      unregisterFileMenu();
    };
  },
};

export default fileMenuPlugin;
