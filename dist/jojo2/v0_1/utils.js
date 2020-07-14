/**
 * Map 获取对应 key || 初始化 对应key 再返回初始值
 * */
export function getMapItemOrInit(map, key, initial) {
    let res = map.get(key);
    if (res)
        return res;
    // 未初始化
    map.set(key, initial());
    return map.get(key);
}
/**
 * 遍历 Map, 若 callBack 返回 false // 则停止遍历
 * @param map
 * @param cb 需要返回bool, 返回true,才会继续遍历， false,中止
 * */
export function forEachMap(map, cb) {
    const keysIter = map.keys();
    for (; true;) {
        const { value: key, done } = keysIter.next();
        if (done)
            break; // 遍历完毕
        const val = map.get(key);
        if (!cb(val, key))
            break; // 若 cb 返回 false 不再遍历后序
    }
}
//# sourceMappingURL=utils.js.map