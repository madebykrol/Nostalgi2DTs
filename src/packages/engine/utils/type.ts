const whiteListNames = [
    "Vector2",
];
export const normalizeClassName = (name: string) => {
    if(!name) return name;

    if(whiteListNames.includes(name)) {
        return name;
    }
    
    return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/\d+$/, "");;
}

export class LevelData {
    
}
