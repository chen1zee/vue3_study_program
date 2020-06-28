
/**
 * 创建 reactor 对象(实现 model层变化->view层 自动 render绑定),
 * 根据 入参 data 创建 对应  Proxy对象(从内层到外层) 代理 g/setter
 * NEWFEATURE --> 收集依赖 , 建立 depends watcher机制 [v0.3]
 * */
type DataValAnyV03Type = { [k in string]: any }
type JojoOptV03Type = {
  data: () => DataValAnyV03Type,
  methods: { [k in string]: (this: JojoV3) => void },
  render(this: JojoV3): void
}
type TraceMapType = WeakMap<any, PropertyKey[]>|null

class JojoV3 {
  public data: DataValAnyV03Type = {}
  private readonly render: () => void // render 函数 需通过 constructor 指定
  private methods: {[k in string]: () => void} = {}
  private initialing = true // 初始化中flag
  private static readonly RENDER_KEY = "$$render"
  /**
   * 存储 依赖 key: string, val: WeakMap|null
   * 如: key: 'render', val: WeakMap[[a.proxy, ['b', 'c']]] -> 则代表 render 时 触发了 (a.proxy) 的 getter行为 取key 'b', 'c'
   * */
  private depsMap = new Map<string, TraceMapType>()
  /**
   * 用于 劫持过程中 存储 依赖关系
   * 如: render.Begin -> traceMap 重置 -> render.ing -> 收集 getter -> render.end
   * -> depsMap['RENDER']存储依赖 = traceMap -> traceMap 重置
   * WeakMap<k: object, v: []'keys'>
   * */
  private traceMap: TraceMapType = new WeakMap()
  /**
   * 记录本次触发的 proxy.setter [proxyInstance, 'key']
   * DONOTIMPLEMENT 可以做成 setter队列, 时间轮片 收集 本段 触发 setters -> 比对 effectArrs -> render -> new时间轮片
   * */
  private nowSetterDesc: [(null|any), PropertyKey] = [null, '']

  constructor(opt: JojoOptV03Type) {
    this.data = JojoV3.data2Proxy(opt.data(), this)
    this.render = JojoV3.createFuncProxy(opt.render, JojoV3.RENDER_KEY, this)
    Object.entries(opt.methods).forEach(([key, func]) => {
      this.methods[key] = func.bind(this)
    })
    this.initialing = false
    // 初始化 渲染一次
    this.render()
  }

  /**
   * 将 data 转换为 proxy 代理其 g/setter
   * @example {a: 123, b: {c: 321}} ->
   * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
   * */
  static data2Proxy(data: DataValAnyV03Type, instance: JojoV3) {
    let temp: DataValAnyV03Type = {}
    /**
     * DONOTIMPLEMENT Proxy 对于 Array 操作亦有代理能力，如 a.push(123) -> (target: [], p: "push") 但本版本不处理 Array
     * */
    // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
    temp = JojoV3.createGSProxy(data, instance)
    Object.entries(data).forEach(([key, val]) => { // 遍历找出 所有 obj 并 将其 proxy化
      if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
        temp[key] = JojoV3.data2Proxy(val, instance)
      }
    })
    return temp
  }
  /** 代理 data 层 g/setters */
  static createGSProxy(val, instance: JojoV3) {
    return new Proxy(val, {
      get(target: any, p: PropertyKey, receiver): any {
        /** 依赖收集 */
        if (instance.traceMap !== null) {
          if (!instance.traceMap.has(receiver)) { instance.traceMap.set(receiver, []) }
          ;(instance.traceMap.get(receiver) as PropertyKey[]).push(p)
        }
        return target[p]
      },
      set(target: any, p: PropertyKey, value: any, receiver): boolean {
        /** DONOTIMPLEMENT 此版本框架不处理 未声明key */
        if (!target.hasOwnProperty(p)) return false // 抛错处理
        target[p] = value
        // 初始化期间 不render
        if (instance.initialing) return true
        /** 非初始化, 记录setter */
        instance.nowSetterDesc = [receiver, p]
        instance.render()
        return true
      }
    })
  }
  /** 代理 函数 如 render methods */
  static createFuncProxy(func, depsMapKey: string, instance: JojoV3) {
    if (instance.depsMap.has(depsMapKey)) {
      console.error(`createFuncProxy key 冲突 (本框架无特定namespace, methods, watch, computed 等 共用 "": 无前缀)`)
      console.error(`冲突 key, ${depsMapKey}`)
    }
    instance.depsMap.set(depsMapKey, null)
    return new Proxy(func, {
      apply(target, _, argArray?: any) {
        const depWeakMap = instance.depsMap.get(depsMapKey)
        if (depWeakMap) { // 若有依赖列表 比对此次 所触发 proxy.key 是否命中依赖
          // 对应 函数 无 调用 getter 不用调用
          if (!depWeakMap.has(instance.nowSetterDesc[0])) { return void 0 }
        }
        /** traceMap 重置 并 func 运行过程收集 getter */
        instance.traceMap = new WeakMap<object, any>()
        target.apply(instance, argArray)
        /** 将 运行后 依赖 收集给 depsMap */
        instance.depsMap.set(depsMapKey, instance.traceMap)
        instance.traceMap = null
      }
    })
  }
}

/**
 * 测试
 * */
// @ts-ignore
window.insV03 = new JojoV3({
  data: () => ({ a: 123, b: { c: false, d: { e: false } } }),
  methods: {
    addA(this: JojoV3) { ++this.data.a },
    toggleBC(this: JojoV3) {
      this.data.b.c = !this.data.b.c
    },
    /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
    toggleBDE(this: JojoV3) {
      this.data.b.d.e = !this.data.b.d.e
    }
  },
  render(this: JojoV3): void {
    // @ts-ignore
    document.getElementById("app").innerHTML = `
      <div id="v3AddAId">this.data.a: ${this.data.a}</div>
      <div id="v3ToggleBCId">this.data.b.c:  ${this.data.b.c}</div>
      <button id="v3ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `
    // @ts-ignore
    document.getElementById("v3AddAId").onclick = this.methods.addA
    // @ts-ignore
    document.getElementById("v3ToggleBCId").onclick = this.methods.toggleBC
    // @ts-ignore
    document.getElementById("v3ToggleBDEId").onclick = this.methods.toggleBDE
  }
})
