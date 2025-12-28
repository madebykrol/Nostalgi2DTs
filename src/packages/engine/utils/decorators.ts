import "reflect-metadata";

export type PropertyDecoratorOptions = {
    choices?: readonly unknown[];
    label?: string;
    description?: string;
};

export type RegisteredProperty = {
    target: Function;
    key: string | symbol;
    type: string | null;
    designType?: unknown;
    valueType?: unknown;
    valueTypeName?: string | null;
    choices?: readonly unknown[];
    label?: string;
    description?: string;
};

const registry = new WeakMap<Function, Map<string | symbol, RegisteredProperty>>();

const ensureRegistryEntry = (ctor: Function) => {
    let entry = registry.get(ctor);
    if (!entry) {
        entry = new Map();
        registry.set(ctor, entry);
    }
    return entry;
};

const readDesignType = (target: object, propertyKey: string | symbol) => {
    if (typeof Reflect === "undefined" || typeof Reflect.getMetadata !== "function") {
        return {
            designType: undefined,
            typeName: null,
            valueType: undefined,
            valueTypeName: null,
        };
    }
    const designType = Reflect.getMetadata("design:type", target, propertyKey);
    const typeName = typeof designType === "function" && designType.name ? designType.name : null;
    const paramTypes = Reflect.getMetadata("design:paramtypes", target, propertyKey) as unknown[] | undefined;
    const valueType = Array.isArray(paramTypes) && paramTypes.length > 0 ? paramTypes[0] : undefined;
    const valueTypeName = typeof valueType === "function" && valueType.name ? valueType.name : null;
    return { designType, typeName, valueType, valueTypeName };
};

const registerProperty = (target: object, propertyKey: string | symbol, options?: PropertyDecoratorOptions) => {
    if (!target || typeof target !== "object") {
        return;
    }
    const ctor = (target as { constructor?: Function }).constructor;
    if (!ctor || typeof ctor !== "function") {
        return;
    }
    const { designType, typeName, valueType, valueTypeName } = readDesignType(target, propertyKey);
    const choices = options?.choices ? (Array.from(options.choices) as readonly unknown[]) : undefined;
    const metadata: RegisteredProperty = {
        target: ctor,
        key: propertyKey,
        type: valueTypeName ?? typeName,
        designType,
        valueType,
        valueTypeName,
        choices,
        label: options?.label,
        description: options?.description,
    };
    ensureRegistryEntry(ctor).set(propertyKey, metadata);
};

export const getRegisteredProperties = (ctor: Function, { includeBase = true }: { includeBase?: boolean } = {}) => {
    const chain: Function[] = [];
    let current: Function | undefined | null = ctor;
    while (current && typeof current === "function") {
        chain.push(current);
        if (!includeBase) {
            break;
        }
        const prototype = Object.getPrototypeOf(current.prototype);
        if (!prototype || prototype === Object.prototype) {
            break;
        }
        current = prototype.constructor;
    }

    const ordered = new Map<string | symbol, RegisteredProperty>();
    for (let index = chain.length - 1; index >= 0; index -= 1) {
        const map = registry.get(chain[index]);
        if (!map) {
            continue;
        }
        map.forEach((entry, key) => {
            ordered.set(key, entry);
        });
    }
    return Array.from(ordered.values());
};

export const getRegisteredProperty = (ctor: Function, propertyKey: string | symbol, { includeBase = true }: { includeBase?: boolean } = {}) => {
    const properties = getRegisteredProperties(ctor, { includeBase });
    return properties.find((entry) => entry.key === propertyKey);
};

export const getRegisteredPropertiesForInstance = (instance: object, options?: { includeBase?: boolean }) => {
    if (!instance || typeof instance !== "object") {
        return [] as RegisteredProperty[];
    }
    const ctor = (instance as { constructor?: Function }).constructor;
    if (!ctor || typeof ctor !== "function") {
        return [] as RegisteredProperty[];
    }
    return getRegisteredProperties(ctor, options);
};

export const getRegisteredPropertyForInstance = (instance: object, propertyKey: string | symbol, options?: { includeBase?: boolean }) => {
    if (!instance || typeof instance !== "object") {
        return undefined;
    }
    const ctor = (instance as { constructor?: Function }).constructor;
    if (!ctor || typeof ctor !== "function") {
        return undefined;
    }
    return getRegisteredProperty(ctor, propertyKey, options);
};

type PropertyDecoratorOverload = PropertyDecorator & {
    (options?: PropertyDecoratorOptions): PropertyDecorator;
};

export const property: PropertyDecoratorOverload = ((optionsOrTarget?: PropertyDecoratorOptions | object, propertyKey?: string | symbol) => {
    if (typeof propertyKey !== "undefined") {
        registerProperty(optionsOrTarget as object, propertyKey);
        return;
    }
    const options = optionsOrTarget as PropertyDecoratorOptions | undefined;
    return (target: object, key: string | symbol) => {
        registerProperty(target, key, options);
    };
}) as PropertyDecoratorOverload;
