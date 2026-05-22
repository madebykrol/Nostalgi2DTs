#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const appsDir = path.resolve(rootDir, "apps");
const outputRoot = path.resolve(rootDir, "dist", "webapps");
const defaultAssetSource = path.resolve(rootDir, "apps", "projects", "content");
const defaultProjectRegistry = path.resolve(defaultAssetSource, "projects", "projects.json");
const PROJECT_MANIFEST_FILENAME = "project.manifest.json";

function toPosix(relativePath) {
  return relativePath.replaceAll(path.sep, "/");
}

function printUsage() {
  console.log("Usage:");
  console.log("  npm run package:webapp -- <project>");
  console.log("  npm run package:webapp -- --all");
  console.log("  npm run package:webapp -- --game <name> --project-id <id> [--template <app>] [--asset-source <path>]");
  console.log("");
  console.log("Options:");
  console.log("  --all         Package all webapp projects under apps/");
  console.log("  --game        Package a standalone game app from one runtime template");
  console.log("  --project-id  Project id from the project registry");
  console.log("  --project-registry  Path to projects registry json");
  console.log("  --template    Runtime app template (default: evergreen)");
  console.log("  --asset-source  Folder to copy into packaged /assets (default: apps/projects/content)");
  console.log("  --skip-build  Skip running build before packaging");
}

function parseArgs(argv) {
  const options = {
    all: false,
    skipBuild: false,
    project: undefined,
    gameName: undefined,
    projectId: undefined,
    projectRegistry: defaultProjectRegistry,
    template: "evergreen",
    assetSource: defaultAssetSource,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      options.all = true;
      continue;
    }

    if (arg === "--game") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        console.error("Missing value for --game");
        printUsage();
        process.exit(1);
      }
      options.gameName = value;
      index += 1;
      continue;
    }

    if (arg === "--project-id") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        console.error("Missing value for --project-id");
        printUsage();
        process.exit(1);
      }
      options.projectId = value;
      index += 1;
      continue;
    }

    if (arg === "--project-registry") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        console.error("Missing value for --project-registry");
        printUsage();
        process.exit(1);
      }
      options.projectRegistry = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
      index += 1;
      continue;
    }

    if (arg === "--template") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        console.error("Missing value for --template");
        printUsage();
        process.exit(1);
      }
      options.template = value;
      index += 1;
      continue;
    }

    if (arg === "--asset-source") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        console.error("Missing value for --asset-source");
        printUsage();
        process.exit(1);
      }
      options.assetSource = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
      index += 1;
      continue;
    }

    if (arg === "--skip-build") {
      options.skipBuild = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }

    if (!options.project) {
      options.project = arg;
      continue;
    }

    console.error(`Unexpected argument: ${arg}`);
    printUsage();
    process.exit(1);
  }

  return options;
}

function ensureValidGameOptions(options) {
  if (!options.gameName) {
    return;
  }

  if (options.all || options.project) {
    throw new Error("--game cannot be combined with project selection arguments");
  }

  if (!options.projectId) {
    throw new Error("--project-id is required when using --game");
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getWebAppProjects() {
  const entries = await readdir(appsDir, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectName = entry.name;
    const projectDir = path.resolve(appsDir, projectName);
    const packageJsonPath = path.resolve(projectDir, "package.json");
    const viteConfigPath = path.resolve(projectDir, "vite.config.ts");

    if (!(await exists(packageJsonPath)) || !(await exists(viteConfigPath))) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (!packageJson.scripts?.build) {
      continue;
    }

    projects.push(projectName);
  }

  return projects.sort();
}

function runCommand(command, args, cwd, envOverrides = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => rejectPromise(error));
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function runNpmCommand(args, cwd, envOverrides = {}) {
  if (process.platform === "win32") {
    return runCommand("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], cwd, envOverrides);
  }

  return runCommand("npm", args, cwd, envOverrides);
}

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    "-",
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join("");
}

async function packageProject(projectName, skipBuild) {
  const projectDir = path.resolve(appsDir, projectName);
  const projectDistDir = path.resolve(projectDir, "dist");

  if (!(await exists(projectDir))) {
    throw new Error(`Project does not exist: apps/${projectName}`);
  }

  if (!(await exists(path.resolve(projectDir, "vite.config.ts")))) {
    throw new Error(`Project is not a webapp (missing vite.config.ts): apps/${projectName}`);
  }

  if (!skipBuild) {
    console.log(`\nBuilding ${projectName}...`);
    await runNpmCommand(["run", "build", `--workspace=${projectName}`], rootDir);
  }

  if (!(await exists(projectDistDir))) {
    throw new Error(`Build output is missing: apps/${projectName}/dist`);
  }

  const timestamp = getTimestamp();
  const packageDir = path.resolve(outputRoot, `${projectName}-${timestamp}`);
  const latestDir = path.resolve(outputRoot, projectName);

  await mkdir(outputRoot, { recursive: true });
  await rm(packageDir, { recursive: true, force: true });
  await rm(latestDir, { recursive: true, force: true });

  await cp(projectDistDir, packageDir, { recursive: true });
  await cp(projectDistDir, latestDir, { recursive: true });

  const metadata = {
    project: projectName,
    createdAt: new Date().toISOString(),
    sourceDist: toPosix(path.relative(rootDir, projectDistDir)),
    output: [
      toPosix(path.relative(rootDir, packageDir)),
      toPosix(path.relative(rootDir, latestDir)),
    ],
  };

  await writeFile(
    path.resolve(packageDir, "package-info.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    path.resolve(latestDir, "package-info.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  console.log(`Packaged ${projectName}:`);
  console.log(`  - ${toPosix(path.relative(rootDir, packageDir))}`);
  console.log(`  - ${toPosix(path.relative(rootDir, latestDir))} (latest)`);
}

function toSafeAppName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalizeProjectId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeAssetPaths(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeDestinationPath(value) {
  const normalized = value
    .replace(/^\/+/, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");

  if (normalized.includes("..")) {
    throw new Error(`Asset path cannot include '..': ${value}`);
  }
  return normalized;
}

function resolveDeclaredSourcePath(declaredPath, projectAssetBaseDir, assetSourceDir) {
  if (declaredPath.startsWith("/")) {
    return path.resolve(assetSourceDir, declaredPath.slice(1));
  }
  return path.resolve(projectAssetBaseDir, declaredPath);
}

async function discoverFolderProjects(assetSourceDir) {
  const projectsDir = path.resolve(assetSourceDir, "projects");
  if (!(await exists(projectsDir))) {
    return [];
  }

  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectDir = path.resolve(projectsDir, entry.name);
    const manifestPath = path.resolve(projectDir, PROJECT_MANIFEST_FILENAME);
    if (!(await exists(manifestPath))) {
      continue;
    }

    const manifest = await readJsonFile(manifestPath);
    const startupLevel = typeof manifest.startupLevel === "string" ? manifest.startupLevel.trim() : "";
    if (!startupLevel) {
      continue;
    }

    const id = normalizeProjectId(manifest.id || entry.name);
    if (!id) {
      continue;
    }

    projects.push({
      id,
      title: typeof manifest.title === "string" && manifest.title.trim().length > 0 ? manifest.title.trim() : entry.name,
      startupLevel,
      assetRoots: sanitizeAssetPaths(manifest.assetRoots),
      assetFiles: sanitizeAssetPaths(manifest.assetFiles),
      manifestPath,
      projectAssetBaseDir: projectDir,
      sourceMode: "folder-manifest",
    });
  }

  return projects;
}

async function resolveGameProject(options) {
  const normalizedProjectId = normalizeProjectId(options.projectId);
  if (!normalizedProjectId) {
    throw new Error("Invalid project id");
  }

  const folderProjects = await discoverFolderProjects(options.assetSource);
  const fromFolder = folderProjects.find((entry) => entry.id === normalizedProjectId);
  if (fromFolder) {
    return {
      ...fromFolder,
      id: normalizedProjectId,
      registryPath: null,
    };
  }

  const registryPath = options.projectRegistry;
  if (!(await exists(registryPath))) {
    throw new Error(
      `Project id '${options.projectId}' was not found in folder manifests and registry does not exist: ${registryPath}`
    );
  }

  const registry = await readJsonFile(registryPath);
  const projects = Array.isArray(registry.projects) ? registry.projects : [];
  const selected = projects.find((entry) => entry && normalizeProjectId(entry.id) === normalizedProjectId);

  if (!selected) {
    throw new Error(`Project id '${options.projectId}' was not found in ${toPosix(path.relative(rootDir, registryPath))}`);
  }

  if (!selected.manifest || typeof selected.manifest !== "string") {
    throw new Error(`Project '${options.projectId}' is missing a 'manifest' path in the registry`);
  }

  const registryDir = path.dirname(registryPath);
  const manifestPath = path.isAbsolute(selected.manifest)
    ? selected.manifest
    : path.resolve(registryDir, selected.manifest);

  if (!(await exists(manifestPath))) {
    throw new Error(`Project manifest does not exist: ${manifestPath}`);
  }

  const manifest = await readJsonFile(manifestPath);
  const startupLevel = typeof manifest.startupLevel === "string" ? manifest.startupLevel.trim() : "";
  if (!startupLevel) {
    throw new Error(`Project manifest must include a non-empty 'startupLevel': ${manifestPath}`);
  }

  return {
    id: normalizedProjectId,
    title:
      typeof manifest.title === "string" && manifest.title.trim().length > 0
        ? manifest.title.trim()
        : options.gameName,
    startupLevel,
    assetRoots: sanitizeAssetPaths(manifest.assetRoots),
    assetFiles: sanitizeAssetPaths(manifest.assetFiles),
    registryPath,
    manifestPath,
    projectAssetBaseDir: options.assetSource,
    sourceMode: "legacy-registry",
  };
}

async function copyPathFromAssetSource(sourcePath, destinationRelativePath, destinationAssetsDir) {
  if (!(await exists(sourcePath))) {
    throw new Error(`Declared asset path does not exist: ${sourcePath} (target: ${destinationRelativePath})`);
  }

  const sourceStats = await stat(sourcePath);
  const destinationPath = path.resolve(destinationAssetsDir, destinationRelativePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (sourceStats.isDirectory()) {
    await cp(sourcePath, destinationPath, { recursive: true });
    return;
  }

  await cp(sourcePath, destinationPath);
}

async function copyProjectAssets(gameProject, assetSourceDir, destinationRootDir) {
  const destinationAssetsDir = path.resolve(destinationRootDir, "assets");
  await mkdir(destinationAssetsDir, { recursive: true });

  const roots = gameProject.assetRoots;
  const files = gameProject.assetFiles;

  if (roots.length === 0 && files.length === 0) {
    await cp(assetSourceDir, destinationAssetsDir, { recursive: true });
    return;
  }

  for (const declaredRoot of roots) {
    const sourcePath = resolveDeclaredSourcePath(declaredRoot, gameProject.projectAssetBaseDir, assetSourceDir);
    const destinationRelative = normalizeDestinationPath(declaredRoot);
    await copyPathFromAssetSource(sourcePath, destinationRelative, destinationAssetsDir);
  }

  for (const declaredFile of files) {
    const sourcePath = resolveDeclaredSourcePath(declaredFile, gameProject.projectAssetBaseDir, assetSourceDir);
    const destinationRelative = normalizeDestinationPath(declaredFile);
    await copyPathFromAssetSource(sourcePath, destinationRelative, destinationAssetsDir);
  }
}

async function packageGame(options) {
  const templateName = options.template;
  const gameName = toSafeAppName(options.gameName ?? "");
  const templateDir = path.resolve(appsDir, templateName);
  const templateDistDir = path.resolve(templateDir, "dist");
  const assetSourceDir = options.assetSource;
  const gameProject = await resolveGameProject(options);

  if (!gameName) {
    throw new Error("Game name must contain at least one letter or number");
  }

  if (!(await exists(templateDir))) {
    throw new Error(`Template app does not exist: apps/${templateName}`);
  }

  if (!(await exists(path.resolve(templateDir, "vite.config.ts")))) {
    throw new Error(`Template app is not a webapp: apps/${templateName}`);
  }

  if (!(await exists(assetSourceDir))) {
    throw new Error(`Asset source does not exist: ${assetSourceDir}`);
  }

  if (!options.skipBuild) {
    console.log(`\nBuilding runtime template ${templateName}...`);
    await runNpmCommand(
      [`--workspace=${templateName}`, "exec", "vite", "build"],
      rootDir,
      { NOSTALGI_SKIP_STATIC_COPY: "1" },
    );
  }

  if (!(await exists(templateDistDir))) {
    throw new Error(`Build output is missing: apps/${templateName}/dist`);
  }

  const timestamp = getTimestamp();
  const packageDir = path.resolve(outputRoot, `${gameName}-${timestamp}`);
  const latestDir = path.resolve(outputRoot, gameName);

  await mkdir(outputRoot, { recursive: true });
  await rm(packageDir, { recursive: true, force: true });
  await rm(latestDir, { recursive: true, force: true });

  await cp(templateDistDir, packageDir, { recursive: true });
  await cp(templateDistDir, latestDir, { recursive: true });

  await copyProjectAssets(gameProject, assetSourceDir, packageDir);
  await copyProjectAssets(gameProject, assetSourceDir, latestDir);

  const gameProjectConfig = {
    id: gameProject.id,
    title: gameProject.title,
    startupLevel: gameProject.startupLevel,
    assetRoots: gameProject.assetRoots,
    assetFiles: gameProject.assetFiles,
  };

  await writeFile(
    path.resolve(packageDir, "game-project.json"),
    `${JSON.stringify(gameProjectConfig, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    path.resolve(latestDir, "game-project.json"),
    `${JSON.stringify(gameProjectConfig, null, 2)}\n`,
    "utf8",
  );

  const metadata = {
    mode: "game",
    game: gameName,
    projectId: gameProject.id,
    template: templateName,
    startupLevel: gameProject.startupLevel,
    createdAt: new Date().toISOString(),
    sourceDist: toPosix(path.relative(rootDir, templateDistDir)),
    sourceAssets: toPosix(path.relative(rootDir, assetSourceDir)),
    projectSourceMode: gameProject.sourceMode,
    projectRegistry: gameProject.registryPath ? toPosix(path.relative(rootDir, gameProject.registryPath)) : null,
    projectManifest: toPosix(path.relative(rootDir, gameProject.manifestPath)),
    output: [
      toPosix(path.relative(rootDir, packageDir)),
      toPosix(path.relative(rootDir, latestDir)),
    ],
  };

  await writeFile(
    path.resolve(packageDir, "package-info.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    path.resolve(latestDir, "package-info.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  console.log(`Packaged game ${gameName}:`);
  console.log(`  project id: ${gameProject.id}`);
  console.log(`  - ${toPosix(path.relative(rootDir, packageDir))}`);
  console.log(`  - ${toPosix(path.relative(rootDir, latestDir))} (latest)`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureValidGameOptions(options);

  if (options.gameName) {
    await packageGame(options);
    console.log("\nDone. Packaged 1 game webapp.");
    return;
  }

  let targets = [];

  if (options.all) {
    targets = await getWebAppProjects();
    if (targets.length === 0) {
      throw new Error("No webapp projects found under apps/");
    }
  } else if (options.project) {
    targets = [options.project];
  } else {
    printUsage();
    process.exit(1);
  }

  for (const projectName of targets) {
    await packageProject(projectName, options.skipBuild);
  }

  console.log(`\nDone. Packaged ${targets.length} project(s).`);
}

main().catch((error) => {
  console.error("package:webapp failed", error);
  process.exit(1);
});
