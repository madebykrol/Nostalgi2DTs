export class Url {
    static isValidUrl(url: string): boolean {
        try {
            var urlObj = new URL(url);
            return urlObj.protocol === "http:" || urlObj.protocol === "https:";
        } catch {
            return false;
        }
    }
    
        
}