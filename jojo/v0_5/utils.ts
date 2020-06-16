

/**
 * 向 二维 Map 正确设置 val
 * 如： mapMap = {} -> setMapMap(mapMap, 'a', 'b', 123) -> a: { b: 123 }
 *
 * */
export function setMapMap<OuterKeyT, innerKeyT, innerValT>(
  mapMap: Map<OuterKeyT, Map<innerKeyT, innerValT>>,
  outerKey: OuterKeyT, innerKey: innerKeyT, val: innerValT,
) {
  let innerMap = mapMap.get(outerKey)
  if (!innerMap) {
    mapMap.set(outerKey, new Map<innerKeyT, innerValT>())
    innerMap = mapMap.get(outerKey)
  }
  ;(innerMap as Map<innerKeyT, innerValT>).set(innerKey, val)
  console.log(mapMap)
}
