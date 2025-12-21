# Mesh Component Designer Workflow

> Working notes on the in-editor mesh designer so we can evolve it into a production-ready asset pipeline.

## 1. Editor Workflow Recap
- Mesh assets are managed via the built-in "Meshes" panel (see `meshComponentDesignerPlugin`).
- Each asset stores `meshId`, `materialId`, and `metadata.vertices` (an ordered list of `{ x, y }`).
- The **Open Designer** button launches the canvas modal where vertices can be added, dragged, or removed.
- Saving persists the asset through `ComponentAssetStorage.saveAsset`, while Attach lets you test the mesh on the selected actor immediately.

## 2. Serialization Format
- Current payload shape (JSON friendly):
  ```json
  {
    "id": "mesh-sample",
    "type": "mesh",
    "name": "Sample Mesh",
    "description": "",
    "payload": {
      "meshId": "sample_mesh",
      "materialId": "basic_material",
      "metadata": {
        "vertices": [
          { "x": -0.5, "y": -0.5 },
          { "x": 0.5, "y": -0.5 },
          { "x": 0.2, "y": 0.6 },
          { "x": -0.4, "y": 0.4 }
        ]
      }
    }
  }
  ```
- `vertices` must keep a consistent winding order. The runtime tessellates them with a fan (0, i, i+1).
- UVs and indices are derived at load time (`buildMeshFromMetadata` in the editor bootstrap).

## 3. Persistence Strategy (To Implement)
- Replace the in-memory prototype storage (`createPrototypeComponentAssetStorage` in the editor `main.tsx`) with a backed implementation:
  1. **Load**: On editor boot, read `meshes.json` (local file, database row, or API) and hydrate the storage.
  2. **Save**: On `saveAsset`, write the updated list back to disk/db.
  3. **Delete**: Remove the entry and persist the new list.
- Consider adding autosave or an explicit *Export Mesh Assets* command that writes the JSON bundle developers will check-in.

## 4. Build Integration Plan
- Treat the exported `meshes.json` as game content:
  1. Store it under `src/apps/client/public/assets/meshes.json` (or similar).
  2. Extend the build pipeline (Turbo task / Vite hook) to copy the latest export from the editor workspace into the client bundle.
  3. Optionally validate the JSON (schema check) during CI to catch malformed vertices.
- Document the copy command in the repo README once the pipeline exists.

## 5. Runtime Consumption (Client/Game)
- During client start-up, load the JSON once (e.g., fetch from `/assets/meshes.json`).
- Cache the parsed `ComponentAsset[]` in a service.
- When game code needs to spawn a mesh component:
  1. Look up by `meshId` or asset `id`.
  2. Rebuild the mesh via `buildMeshFromMetadata` (shared helper or duplicated code in the runtime package).
  3. Instantiate `MeshComponent` with the reconstructed mesh and the material referenced by `materialId`.
- Maintain parity with the editor by reusing the same serializer/normalizer logic; consider publishing a shared utility in `packages/engine`.

## 6. Next Steps / Open Questions
- [ ] Extract mesh serialization helpers into a reusable module (shared between editor + runtime).
- [ ] Design proper persistence (electron fs, REST API, or local file write) and integrate with editor storage.
- [ ] Add automated tests that load a sample `meshes.json` and verify the reconstructed mesh data.
- [ ] Investigate UV generation requirements for non-convex shapes (current fan triangulation assumes convex polygons).
- [ ] Decide how materials referenced by `materialId` are resolved during the build/runtime pipeline.
