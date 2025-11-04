export declare abstract class Endpoint<TSocket, TReq> {
    protected address: string;
    protected port: number;
    constructor(address: string, port: number);
    toString(): string;
    abstract send(command: string, data: any): void;
    onMessage<T>(_command: string, _callback: (data: T) => void): void;
    abstract connect(onConnection: (socket: TSocket, req: TReq) => void): Promise<void>;
    abstract disconnect(): Promise<void>;
    onDisconnection(): void;
    abstract cleanup(): void;
}
//# sourceMappingURL=endpoint.d.ts.map