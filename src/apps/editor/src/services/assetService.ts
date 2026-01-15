import type {
  ComponentAsset,
  ComponentAssetStorage,
  EditorComponentAssembler,
  Actor,
  MeshComponent,
} from "@repo/engine";
import { MeshComponent as MeshComp } from "@repo/engine";
import { UnlitMaterial } from "@repo/basicrenderer";
import {
  cloneComponentAsset,
  hashStringToColor,
  type MeshMetadata,
} from "../utils/assetHelpers";
import { buildMeshFromMetadata } from "../utils/meshBuilder";

export const createPrototypeComponentAssetStorage = (): ComponentAssetStorage => {
  const storage: ComponentAsset[] = [];

  return {
    getAssets: () => storage.map(cloneComponentAsset),
    saveAsset: async (asset: ComponentAsset) => {
      const index = storage.findIndex((a) => a.id === asset.id);
      if (index >= 0) {
        storage[index] = cloneComponentAsset(asset);
      } else {
        storage.push(cloneComponentAsset(asset));
      }
    },
    deleteAsset: async (id: string) => {
      const index = storage.findIndex((a) => a.id === id);
      if (index >= 0) {
        storage.splice(index, 1);
      }
    },
  };
};

export const createPrototypeComponentAssembler = (): EditorComponentAssembler => ({
  attachComponentToActor: async (actor: Actor, asset: ComponentAsset) => {
    if (asset.type !== "MeshComponent") {
      console.warn(`Unsupported component type "${asset.type}" for attachment.`);
      return;
    }

    if (!asset.payload) {
      console.warn("Mesh asset payload missing; cannot attach component.");
      return;
    }

    const { mesh, metadata } = buildMeshFromMetadata(asset.payload);
    const material = new UnlitMaterial();
    const component = new MeshComp(mesh, material);

    const hsla = hashStringToColor(asset.id);
    const [h, s, l, a] = hsla;
    const debugColor: [number, number, number, number] = [h, s, l, a];
    (component as any).editorDebugColor = debugColor;
    (component as any).editorAssetId = asset.id;
    (component as any).editorMeshMetadata = metadata;
    actor.addComponent(component);

    console.log(
      `Attached mesh component asset "${asset.name}" to actor ${actor.getId()} (vertices=${metadata.vertices.length})`
    );
  },
});
