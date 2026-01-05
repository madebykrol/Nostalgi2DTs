import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { Editor, EditorUIPlugin } from "@repo/engine";
import { AssetService, type AssetManifest, type AssetPayloadPackedEntry } from "@repo/engine";
import { fetchAssetTree, saveBinaryResource, type AssetCategory, type AssetNode } from "../services/resourceLoader";

const TYPE_FILTERS: Array<{ id: AssetCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "container", label: "Containers" },
  { id: "texture", label: "Textures" },
  { id: "sprite", label: "Sprites" },
  { id: "actor", label: "Actors" },
  { id: "audio", label: "Audio" },
  { id: "data", label: "Data" },
];

const TYPE_BADGES: Record<AssetCategory, string> = {
  directory: "DIR",
  container: "N2A",
  texture: "TEX",
  sprite: "SPR",
  actor: "ACT",
  audio: "AUD",
  data: "DAT",
  unknown: "UNK",
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const stripExtension = (name: string): string => name.replace(/\.[^./\\]+$/, "");

const toSafeStem = (value: string): string => {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized.length > 0 ? sanitized : "dropped-asset";
};

const toContainerFileName = (stem: string) => `${stem}.n2asset`;

const normalizeDirectoryPath = (value: string): string => {
  if (!value) {
    return "";
  }
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
};

const buildTargetPath = (directoryPath: string, fileName: string): string => {
  const normalized = normalizeDirectoryPath(directoryPath);
  return normalized ? `${normalized}/${fileName}` : fileName;
};

const guessAssetTypeFromName = (fileName: string, mime?: string): AssetCategory => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp")) {
    return lower.includes("sprite") ? "sprite" : "texture";
  }
  if (lower.endsWith(".ogg") || lower.endsWith(".mp3") || lower.endsWith(".wav")) {
    return "audio";
  }
  if (lower.endsWith(".json")) {
    return lower.includes("actor") ? "actor" : "data";
  }
  if (mime?.startsWith("image/")) {
    return "texture";
  }
  if (mime?.startsWith("audio/")) {
    return "audio";
  }
  return "data";
};

const generateLocalId = () => Math.random().toString(36).slice(2, 10);

const AssetBrowserPanel = ({ editor: _editor }: { editor: Editor }) => {
  const [tree, setTree] = useState<AssetNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetCategory | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const assetServiceRef = useRef<AssetService>(new AssetService());

  const loadAssets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAssetTree();
      setTree(data);
      const nextExpanded = new Set<string>([""]);
      if (data.path) {
        nextExpanded.add(data.path);
      }
      const expandContainers = (node?: AssetNode | null) => {
        if (!node) {
          return;
        }
        if (node.assetType === "container" && node.path) {
          nextExpanded.add(node.path);
        }
        node.children?.forEach(expandContainers);
      };
      expandContainers(data);
      setExpanded(nextExpanded);
    } catch (err) {
      console.error("Failed to load asset tree", err);
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const ingestDroppedFiles = useCallback(
    async (directoryPath: string, files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }
      setIsUploading(true);
      setUploadStatus(null);
      setError(null);
      try {
        for (const file of fileArray) {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          const stem = toSafeStem(stripExtension(file.name));
          const containerName = toContainerFileName(stem);
          const targetPath = buildTargetPath(directoryPath, containerName);
          const entryType = guessAssetTypeFromName(file.name, file.type);
          const entryId = globalThis.crypto?.randomUUID?.() ?? generateLocalId();
          const contentType = file.type || "application/octet-stream";
          const payloadEntry: AssetPayloadPackedEntry = {
            id: entryId,
            name: stem,
            type: entryType,
            contentType,
            bytes,
            metadata: {
              originalFileName: file.name,
              importedAt: new Date().toISOString(),
            },
          };

          const manifest: AssetManifest = {
            format: "n2ar",
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: "AssetBrowserDrop",
            updatedBy: "AssetBrowserDrop",
            entries: [],
          };

          manifest.entries = [
            {
              id: payloadEntry.id,
              name: payloadEntry.name ?? stem,
              type: payloadEntry.type,
              contentType: payloadEntry.contentType,
              offset: 0,
              length: payloadEntry.bytes.byteLength,
              hash: await assetServiceRef.current.computeSha256Hex(payloadEntry.bytes),
              encoding: payloadEntry.encoding ?? "raw",
              metadata: payloadEntry.metadata ?? {},
            },
          ];

          const packed = await assetServiceRef.current.packAsset(manifest, [payloadEntry]);
          await saveBinaryResource(targetPath, bytesToBase64(new Uint8Array(packed)));
        }
        setUploadStatus(
          `Imported ${fileArray.length} asset${fileArray.length === 1 ? "" : "s"} into ${directoryPath || "content"}.`
        );
        await loadAssets();
      } catch (err) {
        console.error("Failed to import dropped files", err);
        setError(err instanceof Error ? err.message : "Failed to import files");
      } finally {
        setIsUploading(false);
        setDropTargetPath(null);
      }
    },
    [loadAssets]
  );

  const handleToggle = useCallback((path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const filteredTree = useMemo(() => {
    if (!tree) {
      return null;
    }

    const normalizedSearch = search.trim().toLowerCase();
    const matchesFilters = (node: AssetNode): boolean => {
      const matchesType = typeFilter === "all" || node.kind === "directory" || node.assetType === typeFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        node.name.toLowerCase().includes(normalizedSearch) ||
        node.path.toLowerCase().includes(normalizedSearch);
      return matchesType && matchesSearch;
    };

    const applyFilters = (node: AssetNode): AssetNode | null => {
      const filteredChildren = node.children?.map(applyFilters).filter((child): child is AssetNode => Boolean(child));
      const hasChildMatches = Boolean(filteredChildren && filteredChildren.length > 0);
      if (matchesFilters(node) || hasChildMatches) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };

    return applyFilters(tree);
  }, [tree, search, typeFilter]);

  const formatSize = (value?: number) => {
    if (!value) {
      return null;
    }
    if (value < 1024) {
      return `${value} B`;
    }
    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderNode = (node: AssetNode, depth: number): JSX.Element => {
    const key = node.path || "__root__";
    const isDirectory = node.kind === "directory";
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const canToggle = hasChildren;
    const isExpanded = expanded.has(node.path);
    const displayChildren = canToggle && isExpanded;
    const badge = TYPE_BADGES[node.assetType] ?? "UNK";
    const fileSize = !isDirectory ? formatSize(node.sizeBytes) : null;
    const isDropTarget = dropTargetPath === node.path && isDirectory;
    const detailText = (() => {
      if (node.kind !== "entry") {
        return null;
      }
      const parts: string[] = [];
      if (node.contentType) {
        parts.push(node.contentType);
      }
      if (node.entryId) {
        parts.push(`#${node.entryId}`);
      }
      if (node.metadata && typeof node.metadata === "object" && "project" in node.metadata) {
        const project = (node.metadata as { project?: { name?: string; exportPath?: string } }).project;
        if (project?.name) {
          parts.push(project.name);
        } else if (project?.exportPath) {
          parts.push(project.exportPath);
        }
      }
      if (node.containerPath) {
        parts.push(`from ${node.containerPath}`);
      }
      return parts.length > 0 ? parts.join(" • ") : null;
    })();

    const dragHandlers = isDirectory
      ? {
          onDragEnter: (event: DragEvent<HTMLDivElement>) => {
            if (!event.dataTransfer?.types?.includes("Files")) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            setDropTargetPath(node.path);
          },
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            if (!event.dataTransfer?.types?.includes("Files")) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setDropTargetPath(node.path);
          },
          onDragLeave: (event: DragEvent<HTMLDivElement>) => {
            const nextTarget = event.relatedTarget as Node | null;
            if (!event.currentTarget.contains(nextTarget)) {
              setDropTargetPath((current) => (current === node.path ? null : current));
            }
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            if (!event.dataTransfer) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            const files = event.dataTransfer.files;
            if (!files || files.length === 0) {
              setDropTargetPath(null);
              return;
            }
            void ingestDroppedFiles(node.path, files);
            event.dataTransfer.clearData();
          },
        }
      : {};

    return (
      <div key={key} className="space-y-1">
        <div
          className={`flex items-center gap-2 rounded px-2 py-1 text-xs text-white/85 hover:bg-white/5 ${
            node.kind === "entry" ? "text-white/80" : ""
          } ${isDropTarget ? "border border-cyan-400/50 bg-cyan-400/10" : ""}`}
          style={{ paddingLeft: depth * 12 + 8 }}
          {...dragHandlers}
        >
          {canToggle ? (
            <button
              type="button"
              className="text-white/70 hover:text-white"
              onClick={() => handleToggle(node.path)}
            >
              {isExpanded ? "-" : "+"}
            </button>
          ) : (
            <div className="w-3" />
          )}
          <div className="flex items-center gap-2 truncate">
            <span className="rounded border border-white/15 px-1 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
              {badge}
            </span>
            <span className="truncate text-white/90">{node.name}</span>
            {fileSize ? <span className="text-[10px] text-white/50">{fileSize}</span> : null}
          </div>
        </div>
        {detailText ? (
          <div
            className="text-[10px] text-white/45"
            style={{ paddingLeft: depth * 12 + 32 }}
          >
            {detailText}
          </div>
        ) : null}
        {displayChildren ? (
          <div className="space-y-1">
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col text-xs text-white/80">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="flex-1 rounded border border-white/15 bg-white/5 px-3 py-1 text-xs text-white placeholder-white/40 focus:border-cyan-400/60 focus:outline-none"
            placeholder="Search assets by name or path"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            onClick={() => void loadAssets()}
            className="rounded border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
          >
            Refresh
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setTypeFilter(filter.id)}
              className={`rounded px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                typeFilter === filter.id ? "bg-cyan-500/30 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-[11px] text-white/55">
          <p>Drag files from your desktop onto a folder below to auto-wrap them into .n2asset containers.</p>
          {isUploading ? (
            <p className="text-cyan-300">Importing dropped files...</p>
          ) : uploadStatus ? (
            <p className="text-white/70">{uploadStatus}</p>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading ? (
          <div className="text-white/60">Loading assets...</div>
        ) : error ? (
          <div className="text-red-300">{error}</div>
        ) : !filteredTree ? (
          <div className="text-white/60">No assets found for the current filters.</div>
        ) : (
          <div className="space-y-1 text-xs leading-relaxed">
            {renderNode(filteredTree, 0)}
          </div>
        )}
      </div>
    </div>
  );
};

const assetBrowserPanelPlugin: EditorUIPlugin = {
  id: "builtin.asset-browser",
  activate: ({ panels }) => {
    const unregister = panels.register({
      id: "builtin.asset-browser.panel",
      title: "Assets",
      location: "left",
      order: 10,
      render: ({ editor }) => <AssetBrowserPanel editor={editor} />,
    });

    return () => {
      unregister();
    };
  },
};

export default assetBrowserPanelPlugin;
