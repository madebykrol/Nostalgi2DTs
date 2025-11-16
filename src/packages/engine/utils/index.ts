export * from "./url";
export * from "./timer";
export * from "./timermanager";
export * from "./spatialGrid";
export * from "./container";
export * from "./inversifyContainer";
export {inject, injectable, multiInject, optional, unmanaged} from "inversify";


export const isServer = () =>
  typeof process !== 'undefined' &&
  !!process.versions &&
  !!process.versions.node;

export const isBrowser = () =>
  ![typeof window, typeof document].includes('undefined');