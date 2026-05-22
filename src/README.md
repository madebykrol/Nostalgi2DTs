# Nostalgi2D 
Nostalgi 2D is a game engine built using nodejs and typescript.
It's designed to run as standalone client or as a Server / Client application

# Getting started

# Package a webapp

Create a standalone game webapp from the shared runtime template (no per-game app folder required):

```bash
npm run package:game -- --game my-rpg --project-id grasslands-demo
```

This builds the `evergreen` runtime app, reads project definitions from `apps/resources/content/projects/projects.json`, writes `game-project.json`, and bundles the project's declared assets into the package.

Project discovery order:

1. Folder manifests under `apps/resources/content/projects/<project-id>/project.manifest.json`.
2. Legacy registry (`apps/resources/content/projects/projects.json`) as a fallback.

Recommended project folder structure:

```text
apps/resources/content/projects/
	grasslands-demo/
		project.manifest.json
		levels/
		objects/
		textures/
		tilemaps/
```

Project registry shape:

```json
{
	"projects": [
		{
			"id": "grasslands-demo",
			"manifest": "./grasslands-demo/project.manifest.json"
		}
	]
}
```

Project manifest shape:

```json
{
	"id": "grasslands-demo",
	"title": "Grasslands Demo",
	"startupLevel": "levels/grasslands",
	"assetRoots": ["/levels", "/objects", "/textures", "/tilemaps"],
	"assetFiles": []
}
```

`assetRoots` and `assetFiles` behavior:

- Paths starting with `/` are resolved from `apps/resources/content`.
- Other paths are resolved from the project folder when using folder manifests.

Optional flags:

- `--template <app>`: use another runtime app template.
- `--asset-source <path>`: use a different assets source folder.
- `--project-registry <path>`: use another project registry file.
- `--skip-build`: package from existing `apps/<template>/dist`.

Build and package a specific app:

```bash
npm run package:webapp -- flappy-rectangle
```

Build and package all webapps under `apps/`:

```bash
npm run package:webapp -- --all
```

Both commands produce artifacts in `dist/webapps/`:

- `<project>-<timestamp>`: immutable package snapshot.
- `<project>`: latest package output for that project.


