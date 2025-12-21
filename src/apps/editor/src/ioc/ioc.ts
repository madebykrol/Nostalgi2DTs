import { createContext, createElement, useContext, useMemo, type ComponentType } from "react";
import { Container, Constructor, type AbstractConstructor } from "@repo/engine";

export const ContainerContext = createContext<Container|null>(null);

export const ContainerProvider = ContainerContext.Provider;

export const useInjection = <T>(ctor: Constructor<T>): T => {
    const container = useContext(ContainerContext);

    if (!container) {
        throw new Error("No IoC container available in context.");
    }

    return useMemo(() => container.get<T>(ctor), [container, ctor]);
};

type ConstructorLike<T> = Constructor<T> | AbstractConstructor<T>;

export type ConstructorRecord = Record<string, ConstructorLike<any>>;

type ResolvedDependencies<Deps extends ConstructorRecord> = {
    [K in keyof Deps]: Deps[K] extends ConstructorLike<infer R> ? R : never;
};

export type InjectedProps<Deps extends ConstructorRecord> = ResolvedDependencies<Deps>;

export type WithoutInjectedProps<Props, Deps extends ConstructorRecord> = Omit<Props, keyof InjectedProps<Deps>>;

export const useInjectedDependencies = <Deps extends ConstructorRecord>(dependencies: Deps): InjectedProps<Deps> => {
    const container = useContext(ContainerContext);

    if (!container) {
        throw new Error("No IoC container available in context.");
    }

    return useMemo(() => {
        const resolved = {} as InjectedProps<Deps>;
        (Object.keys(dependencies) as Array<keyof Deps>).forEach((key) => {
            const ctor = dependencies[key] as ConstructorLike<unknown>;
            resolved[key] = container.get(ctor) as InjectedProps<Deps>[typeof key];
        });
        return resolved;
    }, [container]);
};

export const withInjection = <Deps extends ConstructorRecord>(dependencies: Deps) =>
    <Props extends InjectedProps<Deps>>(
        Component: ComponentType<Props>
    ): ComponentType<WithoutInjectedProps<Props, Deps>> => {
        type ExternalProps = WithoutInjectedProps<Props, Deps>;

        const Wrapped = (props: ExternalProps) => {
            const resolved = useInjectedDependencies(dependencies);
            return createElement(Component, { ...(props as Props), ...resolved });
        };

        Wrapped.displayName = `withInjection(${Component.displayName ?? Component.name ?? "Component"})`;

        return Wrapped;
    };