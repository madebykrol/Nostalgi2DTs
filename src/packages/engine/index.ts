
// components
export {
	World,
	type WorldSettings,
	Actor,
	Component,
	BaseObject,
	CollisionComponent,
	CircleCollisionComponent,
	PolygonCollisionComponent,
	BoxCollisionComponent,
} from "./world";

export { Engine, type EngineNetworkMode, type PostProcessingTarget } from "./engine";

export { Vector2, Matrix4, Matrix3, MathUtils, Vertex2 } from "./math";

export {
	PhysicsBody,
	BoundingVolume,
	PhysicsComponent,
	type BodyType,
	type CollisionShapeDescriptor,
	type CircleCollisionShapeDescriptor,
	type PolygonCollisionShapeDescriptor,
	type CollisionShapeKind,
} from "./physics";

export { Level } from "./level";

export {
	Url,
	Timer,
	TimerManager,
	TimerHandle,
	SpatialGrid,
	type SpatialQueryResult,
	type Constructor,
	type AbstractConstructor,
	Container,
	InversifyContainer,
	inject,
	injectable,
	multiInject,
	optional,
	unmanaged,
	ResourceManager,
	DefaultResourceManager,
	StringUtils,
	property,
	getRegisteredProperties,
	getRegisteredProperty,
	getRegisteredPropertiesForInstance,
	getRegisteredPropertyForInstance,
	type PropertyDecoratorOptions,
	type RegisteredProperty,
	isServer,
	isBrowser,
} from "./utils";

export { Frustum, Camera, OrthoCamera } from "./camera";

export { SoundManager, GainChannel, SoundHandle, createBoinkSound } from "./audio";

export {
	Endpoint,
	ServerReplicationManager,
	ClientReplicationManager,
	type InputState,
	type ActorState,
	type ActorSpawnMessage,
	type ActorUpdateMessage,
	type ActorDespawnMessage,
	type WorldSnapshotMessage,
	type ErrorMessage,
	type ClientInputMessage,
	type ClientReadyMessage,
	type ServerToClientMessage,
	type ClientToServerMessage,
	type NetworkMessage,
} from "./network";

export {
	type TranslationGizmoDimensions,
	type TranslationGizmoAxis,
	type TranslationGizmoHandle,
	TranslationGizmoMaterial,
	EditorActor,
	GizmoActor,
	GizmoHandle,
	RotationGizmoActor,
	type RotationGizmoHandle,
	RotationGizmoMaterial,
	ScalingGizmoActor,
	TranslationXHandle,
	TranslationYHandle,
	TranslationGizmoActor,
	TranslationGizmoFragmentShader,
	TranslationGizmoVertexShader,
	RotationGizmoFragmentShader,
	RotationGizmoVertexShader,
	type GizmoType,
	Editor,
	type EditorPluginManifestEntry,
	type PanelLocation,
	type PanelRenderProps,
	type PanelDescriptor,
	type SceneContextMenuContext,
	type SceneContextMenuItemDescriptor,
	type SceneDragContext,
	type SceneDragHandlerDescriptor,
	type ModalTriggerEventType,
	type ModalTriggerContextMap,
	type ModalTriggerDescriptor,
	type ModalRenderer,
	type ModalHandle,
	type EditorUIPluginContext,
	type ComponentAsset,
	type MeshComponentAssetPayload,
	type ComponentAssetStorage,
	type EditorComponentAssembler,
	type EditorUIPlugin,
} from "./editor";
export { EngineBuilder } from "./engineBuilder";
export { actor, registerDecoratedActors } from "./actorRegistry";
export {GameInstance, Controller, PlayerState, GameMode} from "./game";
export {InputManager} from "./input";


export { VertexShader } from "./rendering";
export { FragmentShader } from "./rendering";
export { Material, type MaterialRenderContext, MeshComponent } from "./rendering";
export type { MaterialRenderPass } from "./rendering";
export { PostProcessMaterial, PostProcessingVolumeActor, SphereWarpPostProcessMaterial, VhsPostProcessMaterial } from "./rendering";
export { Mesh } from "./rendering";
export { Quad } from "./rendering";


