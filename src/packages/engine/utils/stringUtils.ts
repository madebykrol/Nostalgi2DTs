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
}

@injectable()
export class Serializer {
    
}