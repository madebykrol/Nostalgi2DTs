// Implement simple dependency injection for objects with constructor parameters
export type Constructor<T> =  new (...args: any[]) => T;
export type AbstractConstructor<T> =  abstract new (...args: any[]) => T;

export abstract class Container {
    abstract getByIdentifier<T>(identifier: string): T;
    abstract getTypeForIdentifier(identifier: string): Constructor<unknown> | AbstractConstructor<unknown> | null;
    abstract registerSelf<T>(ctor: Constructor<T>, identifier: string|undefined): unknown;
    abstract registerSingleton<T, U extends T>(ctor: Constructor<T> | AbstractConstructor<T>, ctor2: Constructor<U>): void;
    abstract registerSingletonInstance<T>(ctor: Constructor<T> | AbstractConstructor<T>, instance: T): void
    abstract register<T1, T2 extends T1>(ctor: Constructor<T1> | AbstractConstructor<T1>, ctor2: Constructor<T2>): void;
    abstract registerInstance<T>(ctor: Constructor<T> | AbstractConstructor<T>, instance: T): void;
    abstract get<T>(ctor?: Constructor<T> | AbstractConstructor<T>, args?: any[]): T;
    abstract verify(): string;
}

