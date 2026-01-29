import { StringUtils } from "@nostalgi2d/engine";

export const formatConsoleArg = (arg: unknown): string => {
  if (typeof arg === "string") {
    return arg;
  }

  if (arg instanceof Error) {
    const stack = arg.stack ? `\n${arg.stack}` : "";
    return `${arg.name}: ${arg.message}${stack}`;
  }

  try {
    return StringUtils.cleanStringify(arg);
  } catch (_error) {
    return String(arg);
  }
};
