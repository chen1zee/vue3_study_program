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
}
/**
 * 遍历 Map, 若 callBack 返回 false // 则停止遍历
 * @param map
 * @param cb 需要返回bool, 返回true,才会继续遍历， false,中止
 * */
export function forEachMap(map, cb) {
    const keysIter = map.keys();
    for (let iterDone = false; !iterDone;) {
        const { value: key, done } = keysIter.next();
        if (done)
            break; // 遍历完毕
        const val = map.get(key);
        if (!cb(val, key))
            break; // 若 cb 返回 false 不再遍历后序
    }
}
//# sourceMappingURL=utils.js.map