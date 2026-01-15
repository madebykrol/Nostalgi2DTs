import { ComponentType } from "react";

export interface GUIComponentConfig {
    /** Unique identifier for this GUI component */
    id: string;
    /** The React component to render */
    component: ComponentType<any>;
    /** Additional props to pass to the component */
    props?: Record<string, any>;
    /** Display order (higher values render on top) */
    zIndex?: number;
    /** Whether the component is visible by default */
    visible?: boolean;
}

/**
 * Registry for managing game GUI components
 * Allows registering, unregistering, and querying React components
 * that should be rendered as part of the game UI
 */
export class GUIComponentRegistry {
    private components: Map<string, GUIComponentConfig> = new Map();
    private listeners: Set<() => void> = new Set();
    private visibleCache: GUIComponentConfig[] = [];
    private isDirty = true;

    /**
     * Register a new GUI component
     * @param config - The component configuration
     */
    public register(config: GUIComponentConfig): void {
        this.components.set(config.id, {
            zIndex: 0,
            visible: true,
            ...config,
        });
        this.isDirty = true;
        this.notifyListeners();
    }

    /**
     * Unregister a GUI component by ID
     * @param id - The component ID to remove
     */
    public unregister(id: string): void {
        this.components.delete(id);
        this.isDirty = true;
        this.notifyListeners();
    }

    /**
     * Update the visibility of a component
     * @param id - The component ID
     * @param visible - Whether the component should be visible
     */
    public setVisible(id: string, visible: boolean): void {
        const config = this.components.get(id);
        if (config) {
            config.visible = visible;
            this.isDirty = true;
            this.notifyListeners();
        }
    }

    /**
     * Update the props of a component
     * @param id - The component ID
     * @param props - The new props (merged with existing props)
     */
    public updateProps(id: string, props: Record<string, any>): void {
        const config = this.components.get(id);
        if (config) {
            config.props = { ...config.props, ...props };
            this.isDirty = true;
            this.notifyListeners();
        }
    }

    /**
     * Get a component configuration by ID
     * @param id - The component ID
     * @returns The component configuration or undefined
     */
    public get(id: string): GUIComponentConfig | undefined {
        return this.components.get(id);
    }

    /**
     * Get all registered components sorted by zIndex
     * @returns Array of component configurations
     */
    public getAll(): GUIComponentConfig[] {
        return Array.from(this.components.values()).sort((a, b) =>
            (a.zIndex ?? 0) - (b.zIndex ?? 0)
        );
    }

    /**
     * Get all visible components sorted by zIndex
     * @returns Array of visible component configurations
     */
    public getVisible(): GUIComponentConfig[] {
        if (!this.isDirty) {
            return this.visibleCache;
        }

        this.visibleCache = this.getAll().filter(config => config.visible);
        this.isDirty = false;
        return this.visibleCache;
    }

    /**
     * Clear all registered components
     */
    public clear(): void {
        this.components.clear();
        this.isDirty = true;
        this.notifyListeners();
    }

    /**
     * Subscribe to changes in the registry
     * @param listener - Callback function called when registry changes
     * @returns Unsubscribe function
     */
    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners(): void {
        // Invalidate cache before notifying subscribers so getVisible returns updated data
        this.isDirty = true;
        this.listeners.forEach(listener => listener());
    }
}
