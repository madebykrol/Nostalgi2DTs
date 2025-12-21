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
}
