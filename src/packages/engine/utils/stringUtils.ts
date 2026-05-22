import { injectable } from "inversify";

export class StringUtils {

    public static cleanStringify(object:any) {
       return JSON.stringify(object, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (value instanceof Array) {
                    return value.map(
                        (item, index) => 
                        (index === value.length - 1 ? 
                            'circular reference' : item));
                }
                return { ...value, circular: 'circular reference' };
            }
            return value;
        })
    }

    private static encoder = new TextEncoder();
    private static decoder = new TextDecoder("utf-8");

    public static DecodeUtf(uint8Data: Uint8Array): string {
        return this.decoder.decode(uint8Data);
    }

    public static encodeUtf8(text: string): Uint8Array {
        return this.encoder.encode(text);
    }

    public static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    };

    public static arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

}

@injectable()
export class Serializer {
    
}