import type { ComponentType } from "react";
import type { GUIManager } from "./guiManager";
import type { GUIComponentRegistry, GUIComponentConfig } from "./guiComponentRegistry";
import type { Engine } from "../engine";
import type { Level } from "../level";

export interface GUIModuleContext {
    guiManager: GUIManager;
    componentRegistry: GUIComponentRegistry;
    engine: Engine;
    level: Level;
}

export type GUIModuleEntrypoint =
    | ComponentType<any>
    | (Pick<GUIComponentConfig, "component" | "props" | "zIndex" | "visible"> & { id?: string });

export interface GUIModule {
    /** Unique identifier for the module */
    id: string;
    /**
     * Optional root component that should render by default when the module is active.
     * This is automatically registered and cleaned up by the registry.
     */
    entrypoint?: GUIModuleEntrypoint;
    /**
     * Register UI elements for this module. Return a cleanup function to unregister.
     */
    register?(context: GUIModuleContext): void | (() => void);
}

export class GUIModuleRegistry {
    private modules = new Map<string, GUIModule>();
    private activeCleanups: Array<() => void> = [];

    /** Register a module globally */
    public registerModule(module: GUIModule): void {
        this.modules.set(module.id, module);
    }

    /** Remove a module */
    public unregisterModule(id: string): void {
        this.modules.delete(id);
    }

    /** Activate modules for a level. Clears previous UI and unloads prior modules. */
    public activateForLevel(level: Level, context: GUIModuleContext, isEditor: boolean): void {
        this.teardown();

        // Always clear components on level switch to avoid stale UI
        context.componentRegistry.clear();

        // Do not load UI modules in editor mode
        if (isEditor) {
            return;
        }

        const moduleIds = (level as any).uiModules as string[] | undefined;
        if (!moduleIds || moduleIds.length === 0) {
            return;
        }

        for (const id of moduleIds) {
            const module = this.modules.get(id);
            if (!module) {
                console.warn(`GUIModuleRegistry: module '${id}' not registered`);
                continue;
            }
            console.debug(`GUIModuleRegistry: activating module '${id}'`);
            const entrypointConfig = this.normalizeEntrypoint(module);
            if (entrypointConfig) {
                console.debug(`GUIModuleRegistry: registering entrypoint '${entrypointConfig.id}'`);
                context.componentRegistry.register(entrypointConfig);
                this.activeCleanups.push(() => context.componentRegistry.unregister(entrypointConfig.id));
            }

            if (module.register) {
                const cleanup = module.register(context);
                if (typeof cleanup === "function") {
                    this.activeCleanups.push(cleanup);
                }
            }
        }
    }

    /** Unload currently active modules */
    public teardown(): void {
        for (const cleanup of this.activeCleanups) {
            try {
                cleanup();
            } catch (err) {
                console.error("Error while tearing down GUI module", err);
            }
        }
        this.activeCleanups = [];
    }

    private normalizeEntrypoint(module: GUIModule): GUIComponentConfig | null {
        const { entrypoint } = module;
        if (!entrypoint) {
            return null;
        }

        if (typeof entrypoint === "function") {
            return {
                id: `${module.id}-entrypoint`,
                component: entrypoint,
                zIndex: 0,
                visible: true,
            };
        }

        return {
            id: entrypoint.id ?? `${module.id}-entrypoint`,
            component: entrypoint.component,
            props: entrypoint.props,
            zIndex: entrypoint.zIndex ?? 0,
            visible: entrypoint.visible ?? true,
        };
    }
}
