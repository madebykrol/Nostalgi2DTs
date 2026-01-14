import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
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
	return value.replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "")
    .replace(/\/$/, "");
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

const AssetBrowserPanel = ({ editor }: { editor: Editor }) => {
	const [tree, setTree] = useState<AssetNode | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadStatus, setUploadStatus] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<AssetCategory | "all">("all");
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
	const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
	const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; name: string } | null>(null);
	const [showCreateMenu, setShowCreateMenu] = useState(false);
	const createMenuCloseTimer = useRef<number | null>(null);
	const contextMenuRef = useRef<HTMLDivElement | null>(null);
	const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
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

	useEffect(() => {
		if (!contextMenu) {
			return;
		}

		const closeMenu = (event?: MouseEvent | WheelEvent) => {
			const target = event?.target as Node | undefined;
			if (target && contextMenuRef.current && contextMenuRef.current.contains(target)) {
				return;
			}
			setContextMenu(null);
			setShowCreateMenu(false);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setContextMenu(null);
			}
		};

		window.addEventListener("mousedown", closeMenu, true);
		window.addEventListener("wheel", closeMenu, true);
		window.addEventListener("keydown", handleKey);

		return () => {
			window.removeEventListener("mousedown", closeMenu, true);
			window.removeEventListener("wheel", closeMenu, true);
			window.removeEventListener("keydown", handleKey);
		};
	}, [contextMenu]);

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
						rootEntryId: payloadEntry.id,
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

	const handleImportInputChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const files = event.target.files;
			const targetPath = pendingImportPath ?? "";
			if (files && files.length > 0) {
				await ingestDroppedFiles(targetPath, files);
			}
			setPendingImportPath(null);
			event.target.value = "";
		},
		[ingestDroppedFiles, pendingImportPath]
	);

	const openDirectoryContextMenu = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>, node: AssetNode) => {
			event.preventDefault();
			if (!node.path || node.kind !== "directory") {
				return;
			}

			setSelectedAssetPath(node.path);

			const menuWidth = 220;
			const menuHeight = 180;
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const pointerOffset = 6;

			const clampedX = Math.min(event.clientX + pointerOffset, Math.max(8, viewportWidth - menuWidth - 8));
			const clampedY = Math.min(event.clientY + pointerOffset, Math.max(8, viewportHeight - menuHeight - 8));

			setContextMenu({
				x: clampedX,
				y: clampedY,
				path: node.path,
				name: node.name,
			});
			setShowCreateMenu(false);
		},
		[]
	);

	const directoryMenuItems = useMemo(() => {
		if (!contextMenu) {
			return [] as Array<{ id: string; label: string; action: () => void }>;
		}
		return [
			{
				id: "import",
				label: "Import files…",
				action: () => {
					setPendingImportPath(contextMenu.path);
					if (fileInputRef.current) {
						fileInputRef.current.value = "";
						fileInputRef.current.click();
					}
				},
			},
			{
				id: "toggle",
				label: expanded.has(contextMenu.path) ? "Collapse folder" : "Expand folder",
				action: () => {
					handleToggle(contextMenu.path);
				},
			},
			{
				id: "refresh",
				label: "Refresh",
				action: () => {
					void loadAssets();
				},
			},
		];
	}, [contextMenu, expanded, handleToggle, loadAssets]);

	const createMenuItems = useMemo(
		() => [
			{ id: "create-level", label: "Level" },
			{ id: "create-mesh", label: "Mesh" },
			{ id: "create-animation", label: "Animation" },
			{ id: "create-sprite", label: "Sprite" },
		],
		[]
	);

	const openCreateMenu = useCallback(() => {
		if (createMenuCloseTimer.current) {
			window.clearTimeout(createMenuCloseTimer.current);
			createMenuCloseTimer.current = null;
		}
		setShowCreateMenu(true);
	}, []);

	const scheduleCloseCreateMenu = useCallback(() => {
		if (createMenuCloseTimer.current) {
			window.clearTimeout(createMenuCloseTimer.current);
		}
		createMenuCloseTimer.current = window.setTimeout(() => {
			setShowCreateMenu(false);
			createMenuCloseTimer.current = null;
		}, 180);
	}, []);

	const createMeshAsset = useCallback(
		async (directoryPath: string) => {
			setIsUploading(true);
			setUploadStatus("Creating mesh asset...");
			setError(null);

			const assetId = `mesh-${generateLocalId()}`;
			const entryId = globalThis.crypto?.randomUUID?.() ?? generateLocalId();
			const fileName = toContainerFileName(assetId);
			const targetPath = buildTargetPath(directoryPath, fileName);

			try {
				const meshPayload = {
					id: assetId,
					type: "mesh",
					name: "New Mesh",
					description: "",
					payload: {
						meshId: assetId,
						materialId: "default",
						metadata: {
							vertices: [
								{ x: -0.5, y: -0.5 },
								{ x: 0.5, y: -0.5 },
								{ x: 0, y: 0.5 },
							],
						},
					},
				};

				const payloadBytes = new TextEncoder().encode(JSON.stringify(meshPayload, null, 2));
				const payloadEntry: AssetPayloadPackedEntry = {
					id: entryId,
					name: meshPayload.name,
					type: "mesh",
					contentType: "application/json",
					bytes: payloadBytes,
					metadata: {
						kind: "mesh",
						meshId: assetId,
						createdAt: new Date().toISOString(),
					},
				};

				const manifest: AssetManifest = {
					format: "n2ar",
					version: 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					createdBy: "AssetBrowser",
					updatedBy: "AssetBrowser",
					rootEntryId: entryId,
					entries: [
						{
							id: payloadEntry.id,
              name: payloadEntry.name ?? assetId,
							type: payloadEntry.type,
							contentType: payloadEntry.contentType,
							offset: 0,
							length: payloadEntry.bytes.byteLength,
							hash: await assetServiceRef.current.computeSha256Hex(payloadEntry.bytes),
							encoding: "raw",
							metadata: payloadEntry.metadata ?? {},
						},
					],
				};

				const packed = await assetServiceRef.current.packAsset(manifest, [payloadEntry]);
				await saveBinaryResource(targetPath, bytesToBase64(new Uint8Array(packed)));
				setUploadStatus(`Created mesh asset at ${targetPath || "content"}.`);
				setSelectedAssetPath(targetPath);
				await loadAssets();
			} catch (err) {
				console.error("Failed to create mesh asset", err);
				setError(err instanceof Error ? err.message : "Failed to create mesh asset");
			} finally {
				setIsUploading(false);
			}
		},
		[loadAssets]
	);

	const handleCreateMenuAction = useCallback(
		async (itemId: string) => {
			if (!contextMenu) {
				return;
			}
			const targetPath = contextMenu.path;
			const label = createMenuItems.find((item) => item.id === itemId)?.label ?? itemId;

			setContextMenu(null);
			setShowCreateMenu(false);

			if (itemId === "create-mesh") {
				await createMeshAsset(targetPath);
				return;
			}

			setUploadStatus(`Create ${label} (target: ${targetPath || "root"})`);
		},
		[contextMenu, createMenuItems, createMeshAsset]
	);

	useEffect(() => {
		return () => {
			if (createMenuCloseTimer.current) {
				window.clearTimeout(createMenuCloseTimer.current);
				createMenuCloseTimer.current = null;
			}
		};
	}, []);

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

	const renderNode = (node: AssetNode, depth: number): ReactNode => {
		const key = node.path || "__root__";
		const isDirectory = node.kind === "directory";
		const hasChildren = Boolean(node.children && node.children.length > 0);
		const canToggle = hasChildren;
		const isExpanded = expanded.has(node.path);
		const displayChildren = canToggle && isExpanded;
		const badge = TYPE_BADGES[node.assetType] ?? "UNK";
		const fileSize = !isDirectory ? formatSize(node.sizeBytes) : null;
		const isDropTarget = dropTargetPath === node.path && isDirectory;
		const isSelected = selectedAssetPath === node.path;
		const isSelectable = node.isContainer || node.assetType === "container" || node.kind === "entry";
		const detailText = (() => {
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
			if (node.isContainer && node.manifestType) {
				parts.unshift(node.manifestType);
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
					} ${isDropTarget ? "border border-cyan-400/50 bg-cyan-400/10" : ""} ${
						isSelected ? "border border-cyan-400/60 bg-cyan-400/10" : ""
					} ${isSelectable ? "cursor-pointer" : ""}`}
					style={{ paddingLeft: depth * 12 + 8 }}
					onContextMenu={isDirectory ? (event) => openDirectoryContextMenu(event, node) : undefined}
					onClick={
						isSelectable
							? () => {
								setSelectedAssetPath(node.path);
								if (node.isContainer || node.assetType === "container" || node.kind === "entry") {
									editor.emit("asset:selected", {
										name: node.name,
										path: node.path,
										assetType: node.assetType,
										manifestType: node.manifestType,
										metadata: node.metadata ?? {},
										contentType: node.contentType,
										sizeBytes: node.sizeBytes,
										entryId: node.entryId,
										containerPath: node.containerPath,
									});
								}
							}
						: undefined
					}
					onDoubleClick={
						isSelectable
							? () => {
								setSelectedAssetPath(node.path);
								editor.emit("asset:double-click", {
									name: node.name,
									path: node.path,
									assetType: node.assetType,
									manifestType: node.manifestType,
									metadata: node.metadata ?? {},
									contentType: node.contentType,
									sizeBytes: node.sizeBytes,
									entryId: node.entryId,
									containerPath: node.containerPath,
									rootEntryId: node.rootEntryId,
									isContainer: node.isContainer,
								});
							}
						: undefined
					}
					{...dragHandlers}
				>
					{canToggle ? (
						<button type="button" className="text-white/70 hover:text-white" onClick={() => handleToggle(node.path)}>
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
					<div className="text-[10px] text-white/45" style={{ paddingLeft: depth * 12 + 32 }}>
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
		<div className="relative flex h-full flex-col text-xs text-white/80">
			<input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleImportInputChange} />
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
						<p className="text-cyan-300">{uploadStatus ?? "Processing assets..."}</p>
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
					<div className="space-y-1 text-xs leading-relaxed">{renderNode(filteredTree, 0)}</div>
				)}
			</div>
			{contextMenu
				? createPortal(
					<div className="pointer-events-none fixed inset-0 z-[1800]" onContextMenu={(event) => event.preventDefault()}>
						<div
							ref={contextMenuRef}
							className="pointer-events-auto relative min-w-[220px] rounded-md border border-white/15 bg-slate-900/95 text-white shadow-2xl"
							style={{ position: "absolute", top: contextMenu.y, left: contextMenu.x }}
						>
							<div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-wide text-white/60">
								{contextMenu.name || "Folder"}
							</div>
							<div
								className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white/90 hover:bg-white/10"
								onMouseEnter={openCreateMenu}
								onMouseLeave={scheduleCloseCreateMenu}
								onClick={() => (showCreateMenu ? setShowCreateMenu(false) : openCreateMenu())}
							>
								<span>Create new…</span>
								<span className="text-white/50">▸</span>
							</div>
							{directoryMenuItems.map((item) => (
								<button
									key={item.id}
									type="button"
									className="block w-full px-3 py-2 text-left text-xs text-white/90 hover:bg-white/10"
									onClick={() => {
										setContextMenu(null);
										setShowCreateMenu(false);
										item.action();
									}}
								>
									{item.label}
								</button>
							))}
							{showCreateMenu ? (
								<div
									className="absolute left-full top-8 ml-1 min-w-[200px] rounded-md border border-white/15 bg-slate-950/95 text-white shadow-2xl"
									onMouseEnter={openCreateMenu}
									onMouseLeave={scheduleCloseCreateMenu}
								>
									{createMenuItems.map((item) => (
										<button
											key={item.id}
											type="button"
											className="block w-full px-3 py-2 text-left text-xs text-white/90 hover:bg-white/10"
												onClick={() => {
													void handleCreateMenuAction(item.id);
												}}
										>
											{item.label}
										</button>
									))}
								</div>
							) : null}
						</div>
					</div>,
					document.body
				)
				: null}
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
