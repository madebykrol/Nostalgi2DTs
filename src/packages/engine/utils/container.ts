// Implement simple dependency injection for objects with constructor parameters
export type Constructor<T> =  new (...args: any[]) => T;
export type AbstractConstructor<T> =  abstract new (...args: any[]) => T;

export interface IContainer {
    registerSingleton<T, U extends T>(ctor: Constructor<T> | AbstractConstructor<T>, ctor2: Constructor<U>): void;
    register<T1, T2 extends T1>(ctor: Constructor<T1> | AbstractConstructor<T1>, ctor2: Constructor<T2>): void;
    get<T>(ctor: Constructor<T>): T;
}

