
export abstract class Endpoint {
    constructor(protected address: string, protected port: number) {}

    toString(): string {
        return `${this.address}:${this.port}`;
    }

    abstract send(command: string, data: any): void;
    
    onMessage<T>(_messageType: string, _callback: (sessionId: string, data: T) => void): void {}


    // callback when a new connection is established
    abstract connect(onConnection: (socket: Socket, req: IncomingMessage) => void): Promise<void>;

    abstract disconnect(): Promise<void>;
    onDisconnection(): void {}

    abstract cleanup(): void;
}

export abstract class Socket {
    abstract send(data: any): void;
    abstract close(): void;
}


export abstract class IncomingMessage {

}