

/**
 * 向 二维 Map 正确设置 val
 * 如： mapMap = {} -> setMapMap(mapMap, 'a', 'b', 123) -> { a: { b: 123 } }
 *
 * */
export function setMapMap<OuterKey, InnerKey, InnerVal>(
  mapMap: Map<OuterKey, Map<InnerKey, InnerVal>>,
  outerKey: OuterKey, innerKey: InnerKey, val: InnerVal,
) {
  let innerMap = mapMap.get(outerKey)
  if (!innerMap) {
    mapMap.set(outerKey, new Map<InnerKey, InnerVal>())
    innerMap = mapMap.get(outerKey)
  }
  ;(innerMap as Map<InnerKey, InnerVal>).set(innerKey, val)
}

type ObjAllMap<K extends object, V> = Map<K, V> | WeakMap<K, V>;

/**
 * MapSet add
 * 如: mapSet = {} -> addMapSet(mapSet, 'a', 123) -> {a: Set[123]}
 * */
export function addMapSet<MapKey extends object, V>(
  mapSet: ObjAllMap<MapKey, Set<V>>, mapKey: MapKey, val: V
) {
  let set = mapSet.get(mapKey)
  if (!set) {
    mapSet.set(mapKey, new Set())
    set = mapSet.get(mapKey)
  }
  ;(set as Set<V>).add(val)
}

/**
 * 遍历 Map, 若 callBack 返回 false // 则停止遍历
 * @param map
 * @param cb 需要返回bool, 返回true,才会继续遍历， false,中止
 * */
export function forEachMap<K, V>(map: Map<K, V>, cb: (val: V, key: K) => boolean) {
  const keysIter = map.keys()
  for (let iterDone = false; !iterDone;) {
    const {value: key, done} = keysIter.next()
    if (done) break // 遍历完毕
    const val = map.get(key)
    if (!cb((val as V), key)) break // 若 cb 返回 false 不再遍历后序
  }
}
