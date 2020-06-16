/**
 * 向 二维 Map 正确设置 val
 * 如： mapMap = {} -> setMapMap(mapMap, 'a', 'b', 123) -> a: { b: 123 }
 *
 * */
export function setMapMap(mapMap, outerKey, innerKey, val) {
    let innerMap = mapMap.get(outerKey);
    if (!innerMap) {
        mapMap.set(outerKey, new Map());
        innerMap = mapMap.get(outerKey);
    }
    ;
    innerMap.set(innerKey, val);
    console.log(mapMap);
}
//# sourceMappingURL=utils.js.map