import { isServer,isBrowser } from ".";

export abstract class ResourceManager {
    public abstract loadResource(resource: string): Promise<any>;
}

export class DefaultResourceManager extends ResourceManager {
    async loadResource(path: string): Promise<any> {
        // Default implementation could be empty or throw an error
       if(isServer()) {
        console.log("Load from filesystem");
       }

       if( isBrowser()) {
        console.log("Load from network");
       }
    }
}