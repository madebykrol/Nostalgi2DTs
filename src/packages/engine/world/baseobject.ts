export abstract class BaseObject {

    protected children: BaseObject[] = [];

    protected parent: BaseObject | null = null;

    constructor(public name: string) {
        this.name = name;
        this.children = [];
    }

    getChildren(): BaseObject[] {
        return this.children;
    }

    getChildrenOfType<T extends BaseObject>(ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T[] {
        return this.children.filter(c => c instanceof ctor) as T[];
    }

    addChild(child: BaseObject): void {

        if (this.name === child.name) {
            throw new Error("Cannot add actor as child of itself");
        }

        if (!this.children.find((x:BaseObject) => x.name == child.name)) {
            this.children.push(child);
            child.setParent(this);
        } else {
            // throw new Error(`Child actor with name ${child.name} already exists`);
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

    findChildOfType<T extends BaseObject>(name: string, ctor: (abstract new (...args: any[]) => T) | (new (...args: any[]) => T)): T | null {
        for (const child of this.children.filter(c => c instanceof ctor)) {
            if (child.name === name) {
                return child as T;
            }

            const found = child.findChildOfType(name, ctor);
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
}