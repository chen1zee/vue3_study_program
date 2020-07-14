
/**
 * Map 获取对应 key || 初始化 对应key 再返回初始值
 * */
export function getMapItemOrInit<T>(
  map: Map<string, T>, key: string, initial: () => T
) {
  let res = map.get(key)
  if (res) return res
  // 未初始化
  map.set(key, initial())
  return (map.get(key) as T)
}

/**
 * 遍历 Map, 若 callBack 返回 false // 则停止遍历
 * @param map
 * @param cb 需要返回bool, 返回true,才会继续遍历， false,中止
 * */
export function forEachMap<K, V>(map: Map<K, V>, cb: (val: V, key: K) => boolean) {
  const keysIter = map.keys()
  for (; true;) {
    const {value: key, done} = keysIter.next()
    if (done) break // 遍历完毕
    const val = map.get(key)
    if (!cb((val as V), key)) break // 若 cb 返回 false 不再遍历后序
  }
}
