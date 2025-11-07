import { v4 as uuidv4 } from "uuid";

export abstract class BaseObject {

    protected children: BaseObject[] = [];

    protected parent: BaseObject | null = null;
    protected readonly id: string = "";

    constructor() {
        this.children = [];
        this.id = uuidv4();
    }

    /**
     * 
     * @returns The world id, this is unique for every actor for every session.
     */
    getId(): string {
        return this.id;
    }

    getChildren(): BaseObject[] {
        return this.children;
    }

    getChildrenOfType<T extends BaseObject>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T[] {
        return this.children.filter(c => c instanceof ctor) as T[];
    }

    addChild(child: BaseObject): void {
        if (this.id === child.id) {
            throw new Error("Cannot add actor as child of itself");
        }

        if (!this.children.find((x:BaseObject) => x.id == child.id)) {
            this.children.push(child);
            child.setParent(this);
        } else {
            // throw new Error(`Child actor with id ${child.id} already exists`);
        }
    }

    removeChild(child: BaseObject): void {
        const index = this.children.indexOf(child);
        if (index !== -1) {
            this.children.splice(index, 1);
            child.setParent(null);
        }
    }

    addChildren(children: BaseObject[]): void {
        for (const child of children) {
            this.addChild(child);
        }
    }

    findChildOfType<T extends BaseObject>(id: string, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T | null {
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

    setParent(parent: BaseObject | null): void {
        this.parent = parent;
    }

    getParent(): BaseObject | null {
        return this.parent;
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
}