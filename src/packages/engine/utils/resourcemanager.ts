export abstract class ResourceManager {
    public abstract loadResource(resource: string): Promise<any>;
}