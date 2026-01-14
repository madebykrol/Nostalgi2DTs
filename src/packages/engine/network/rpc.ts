export interface RpcOptions {
    serverSide?: boolean;
}

function isServerRuntime(): boolean {
    // Node / server has no window; browser clients do
    return typeof window === "undefined";
}

export function Rpc(optionsOrServerSide: RpcOptions | boolean = { serverSide: true }): MethodDecorator {
    const options: RpcOptions =
        typeof optionsOrServerSide === "boolean"
            ? { serverSide: optionsOrServerSide }
            : optionsOrServerSide ?? { serverSide: true };

    return function (
        _target: Object,
        _propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ): void {
        const originalMethod = descriptor.value;

        if (typeof originalMethod !== "function") {
            return;
        }

        const rpcName = String(_propertyKey);
        const serverOnly = options.serverSide ?? true;

        descriptor.value = function (this: any, ...args: any[]) {

            console.log(`RPC Decorator invoked for method: ${rpcName}`);
            const onServer = isServerRuntime();

            // If this RPC is marked server-side only, never execute the body on clients
            if (serverOnly && !onServer) {
                // If an Engine instance is reachable, try to forward via callServerRpc
                const maybeEngine = (this as any).engine;
                if (maybeEngine && typeof maybeEngine.callServerRpc === "function") {
                    return maybeEngine.callServerRpc(rpcName, ...args);
                }

                // Otherwise, just skip execution on the client
                console.warn(
                    `RPC method "${rpcName}" is server-side only; call ignored on client.`
                );
                return;
            }

            // On the server, optionally register this method as a server RPC for external callers
            if (serverOnly && onServer) {
                const maybeEngine = (this as any).engine;
                if (maybeEngine && typeof maybeEngine.bindServerRpc === "function") {
                    maybeEngine.bindServerRpc(rpcName, (...invokeArgs: any[]) =>
                        originalMethod.apply(this, invokeArgs)
                    );
                }
            }

            return originalMethod.apply(this, args);
        };
    };
}