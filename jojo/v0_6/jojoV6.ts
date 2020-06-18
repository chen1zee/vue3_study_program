
type DataValAnyV06 = { [k in string]: any }
type JojoOptV06 = {
  data(): DataValAnyV06
}

export class JojoV6 {
  public data: DataValAnyV06 = {}

  constructor(opt: JojoOptV06) {
    this.data = JojoV6.data2Proxy(opt.data(), this)
  }

  /**
   * 将 data 转换为 proxy 代理其 g/setter
   * @example {a: 123, b: {c: 321}} ->
   * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
   * */
  private static data2Proxy(data: DataValAnyV06, instance: JojoV6) {
    let temp: DataValAnyV06 = {}
    // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
    temp = JojoV6.createDataProxy(data, instance)
  }

  /** 代理 data 层 g/setters */
  private static createDataProxy(obj: DataValAnyV06, instance: JojoV6) {
    return new Proxy(obj, {
      get(target: any, p: PropertyKey, receiver): any {
        /**  */
      }
    })
    return undefined;
  }
}

/** 测试 */
// @ts-ignore
window.insV06 = new JojoV6({
  data: () => ({ a: 123, num: 2, b: { c: false, d: { e: false } } })
})

