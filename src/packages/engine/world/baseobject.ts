import { property } from "../utils";

export abstract class BaseObject {


    private _id: string | undefined = undefined;

    @property()
    public set id(id: string) {
        if (this._id !== undefined) {
            throw new Error("ID is already set and cannot be modified.");
        } 
        this._id = id;

    }

    public get id(): string | undefined {
        return this._id;
    }

    private _networkId: string|undefined = undefined;

    constructor() {
        
    }

    set networkdId(networkId: string){
        if (this._networkId !== undefined) 
            throw new Error("Network ID is already set and cannot be modified.");
        
        this._networkId = networkId;
    }

    get networkId(): string | undefined {
        return this._networkId;
    }
    /**
     * 
     * @returns The world id, this is unique for every actor for every session.
     */
    getId(): string | undefined {
        return this.id;
    }

    applyProperties(properties: Record<string, any>): void {

        const writable = new Set<string>();

        const own = Object.getOwnPropertyDescriptors(this);
        for (const [key, d] of Object.entries(own)) {
            const value = (this as any)[key];
            if (typeof value === "function" || (d.get && !d.set) || !d.writable) continue;
            writable.add(key);
        }

        for (const [key, value] of Object.entries(properties)) {
            if (key in this && writable.has(key)) {
                (this as any)[key] = value;
            }
        }
    }

    dispose(): void {
       
    }
}

export class SceneNode extends BaseObject {

    protected children: SceneNode[] = [];

    protected parent: SceneNode | null = null;


    @property()
    public name: string = "";

    constructor() {
        super();
        this.children = [];
    }

    getChildren(): SceneNode[] {
        return this.children;
    }

    getChildrenOfType<T extends SceneNode>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T[] {
        return this.children.filter(c => c instanceof ctor) as T[];
    }

    addChild(child: SceneNode): void {
        // Prevent a node from being added as a child of itself.
        // Use object identity first, and only fall back to IDs when both are defined.
        if (this === child || (this.id !== undefined && this.id === child.id)) {
            throw new Error("Cannot add actor as child of itself");
        }

        if (!this.children.find((x:SceneNode) => x.id == child.id)) {
            this.children.push(child);
            child.setParent(this);
        } else {
            // throw new Error(`Child actor with id ${child.id} already exists`);
        }
    }

    removeChild(child: SceneNode): void {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.setParent(null);
        }
    }

    addChildren(children: SceneNode[]): void {
        for (const child of children) {
            this.addChild(child);
        }
    }

    findChildOfType<T extends SceneNode>(id: string, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T | null {
        for (const child of this.children.filter(c => c instanceof ctor)) {
            if (child.id === id) {
                return child as T;
            }

            const found = child.findChildOfType(id, ctor);
            if(found) {
                return found;
            }
        }
        return null;
    }

    setParent(parent: SceneNode | null): void {
        this.parent = parent;
    }

    getParent(): SceneNode | null {
        return this.parent;
    }

    dispose() {
         for(const child of this.children) {
            child.dispose();
            this.removeChild(child);
        }

        this.children = [];
        this.parent = null;

        super.dispose();
    }
}