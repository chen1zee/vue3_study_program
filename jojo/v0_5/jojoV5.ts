/**
 * 创建 reactor 对象(实现 model层变化->view层 自动 render绑定),
 * 根据 入参 data 创建 对应  Proxy对象(从内层到外层) 代理 g/setter
 * 收集依赖 , 建立 depends watcher机制 [v0.3]
 * TODO computed 需要修改成 value类型 proxy 而不是 funcProxy
 * */
import {forEachMap, setMapMap} from "./utils.js";

type DataValAnyV05Type = { [k in string]: any }
type JojoOptV05Type = {
  data: () => DataValAnyV05Type,
  methods: { [k in string]: (this: JojoV5) => void },
  computed: { [k in string]: (this: JojoV5) => any },
  watch: { [k in string]: (this: JojoV5, val: any, preV: any) => void },
  render(this: JojoV5): void
}
type TraceMapType = WeakMap<any, Set<PropertyKey>>|null
type EffectsMapValType = {
  returnVal?: any
}
type WatchesMapValType = Map<PropertyKey, { // 对应 PropertyKey
  preV: any, // 存储 对应 watch proxyInstance.key 的val 用以标记 preV
  func: any, // 执行函数
}>
/**
 * 触发的 setter 描述  如 a.proxy['b'] && a.proxy['c']
 * 结构为 Map<{a.proxy, Map<{'b', b's_value}, {'c', c's_value}>}>
 * */
type SetterDescsMapType = Map<any, Map<PropertyKey, any>>

export class JojoV5 {
  public data: DataValAnyV05Type = {}
  private readonly render: () => void // render 函数 需通过 constructor 指定
  public computed: {[k in string]: () => any} = {}
  private methods: {[k in string]: (...a: any) => void} = {}
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
   * TODO [完善ing] 副作用 Map 如: computed, watch 等 要细分化 不存放一起，
   * ?? key: string: 对应functionKey, val: {returnVal?: any}
   * val.returnVal 记录 执行结果 ， 用于 依赖无更新时 取值
   * */
  private effectsMap = new Map<string, EffectsMapValType>()
  /**
   * watch Map
   * key proxyInstance 对应 opt.watch['a.b.c'] data.a.b.proxyInstance
   * value: Set<{ key, preV, func, }>
   *  */
  private watchProxyMapMap = new Map<any, WatchesMapValType>()
  /** 正在运行本次 数据变化 */
  private isSetterHandling = false
  /**
   * TODO 新 结构
   * 记录本次触发的 proxy.setter
   * 如 a.proxy 触发了 'b', 'c'
   * Map<{a.proxy, Map<{'b', b's_value}, {'c', c's_value}>}>
   * */
  private nowSetterDescsMap: SetterDescsMapType = new Map()
  /**
   * 记录 本次 watchAndRender 引起的 其他 setter
   * 并继续处理
   *
   * */
  private futureSetterDescs: [(null|any), PropertyKey][] = []

  constructor(opt: JojoOptV05Type) {
    this.data = JojoV5.data2Proxy(opt.data(), this)
    /** render 处理 */
    this.render = JojoV5.createFuncProxy(opt.render, JojoV5.RENDER_KEY, this)
    /** computed 处理 */
    Object.entries(opt.computed).forEach(([key, func]) => {
      this.computed[key] = JojoV5.createFuncProxy(func, key, this)
    })
    /** watch 处理 */
    Object.entries(opt.watch).forEach(([funcName, func]) => {
      const [proxy, key] = JojoV5.getProxyInstanceAndPropertyKeyByDotStr(funcName, this)
      let watchProxyMap = this.watchProxyMapMap.get(proxy)
      if (!watchProxyMap) { // 初始化
        this.watchProxyMapMap.set(proxy, new Map())
        watchProxyMap = this.watchProxyMapMap.get(proxy)
      }
      ;(watchProxyMap as WatchesMapValType).set(key, { preV: null, func })
    })
    Object.entries(opt.methods).forEach(([key, func]) => {
      this.methods[key] = func.bind(this)
    })
    this.initialing = false
    this.watchAndRender(false)
  }

  /**
   * setter 触发对应watchesMap -> 执行 && render
   * @param {Boolean} runWatch 是否 运行watcher flag
   * */
  private watchAndRender(runWatch = true) {
    // TODO ing 使用 nowSetterDescsMap
    const proxy = null, key = 0, value = null

    for (let i = 0; i < 1; i++) { // 处理 watcher
      if (!runWatch) break
      const watchProxyMap = this.watchProxyMapMap.get(proxy)
      if (!watchProxyMap) break
      const watcher = watchProxyMap.get(key)
      if (!watcher) break
      // 命中 watcher
      if (Object.is(value, watcher.preV)) break // 值相同 不触发 watcher

      watcher.func.call(this, value, watcher.preV) // 执行watcher
      watcher.preV = value // 记录旧值
    }
    this.render()
  }

  /**
   * 将 data 转换为 proxy 代理其 g/setter
   * @example {a: 123, b: {c: 321}} ->
   * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
   * */
  static data2Proxy(data: DataValAnyV05Type, instance: JojoV5) {
    let temp: DataValAnyV05Type = {}
    /**
     * DONOTIMPLEMENT Proxy 对于 Array 操作亦有代理能力，如 a.push(123) -> (target: [], p: "push") 但本版本不处理 Array
     * */
    // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
    temp = JojoV5.createDataProxy(data, instance)
    Object.entries(data).forEach(([key, val]) => { // 遍历找出 所有 obj 并 将其 proxy化
      if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
        temp[key] = JojoV5.data2Proxy(val, instance)
      }
    })
    return temp
  }
  /** 代理 data 层 g/setters */
  static createDataProxy(val, instance: JojoV5) {
    return new Proxy(val, {
      get(target: any, p: PropertyKey, receiver): any {
        /** 依赖收集 */
        if (instance.traceMap !== null) {
          if (!instance.traceMap.has(receiver)) { instance.traceMap.set(receiver, new Set()) }
          (instance.traceMap.get(receiver) as Set<PropertyKey>).add(p)
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
        if (instance.isSetterHandling) { // 正在处理 上次 setters handle
          // TODO 此处 futureSetterDescs 冗余 后续用 Map 或者 Set 将其 去重
          instance.futureSetterDescs.push([receiver, p])
          return true
        }
        instance.isSetterHandling = true
        // 处理 setters handle
        setMapMap<any, PropertyKey, any>(instance.nowSetterDescsMap, receiver, p, value)
        instance.watchAndRender()
        instance.isSetterHandling = false // 解锁
        // TODO ing 将 nowSetterDesc 改变结构成 nowSetterDescsMap
        /** 清空setter集 */
        instance.nowSetterDescsMap = new Map()
        return true
      }
    })
  }
  /**
   * TODO render computed watch 细化各自 proxy代理行为 [v0.x]
   * 代理 函数 如 render computed.xxx
   * */
  static createFuncProxy(func, depsMapKey: string, instance: JojoV5) {
    if (instance.depsMap.has(depsMapKey)) {
      console.error(`createFuncProxy key 冲突 (本框架无特定namespace, methods, watch, computed 等 共用 "": 无前缀)`)
      console.error(`冲突 key, ${depsMapKey}`)
      throw new Error(`冲突 key, ${depsMapKey}`)
    }
    /**
     * effectsMap 记录 func 返回值 等信息
     * */
    instance.effectsMap.set(depsMapKey, {
      returnVal: undefined // 缓存执行结果
    })
    instance.depsMap.set(depsMapKey, null)
    return new Proxy(func, {
      apply(target, _, argArray?: any) {
        const depWeakMap = instance.depsMap.get(depsMapKey)
        if (depWeakMap) { // 若有依赖列表 比对此次 所触发 proxy.key 是否命中依赖
          let hasDepChange = false // 有 依赖 更新
          forEachMap(instance.nowSetterDescsMap, (keyVMap, proxyInstance) => {
            const proxyKeySet = depWeakMap.get(proxyInstance)
            if (!proxyKeySet) return true // depWeakMap中无对应 依赖
            // 遍历 nowSetterDesc 对应key
            forEachMap((keyVMap as Map<PropertyKey, any>), (_, key) => {
              if (!proxyKeySet.has(key)) return true
              // 命中依赖
              hasDepChange = true;
              return false // break
            })
            return !hasDepChange // 确认有依赖 break
          })

          // 对应 函数 无 调用 getter 不用调用
          if (!hasDepChange) {
            console.log("从 缓存取值")
            return (instance.effectsMap.get(depsMapKey) as EffectsMapValType).returnVal
          }
        }
        /** traceMap 重置 并 func 运行过程收集 getter */
        instance.traceMap = new WeakMap<object, any>()
        console.log(depsMapKey)
        const runnedVal = target.apply(instance, argArray)
        console.log(instance.traceMap)
        /** 将 运行后 依赖 收集给 depsMap */
        instance.depsMap.set(depsMapKey, instance.traceMap)
        instance.traceMap = null
        ;(instance.effectsMap.get(depsMapKey) as EffectsMapValType).returnVal = runnedVal
        return runnedVal
      }
    })
  }
  /**
   * 根据 .访问字符串 拿取 对应 data.proxyInstance
   * 如: a.b.c --> this.data.a.b.c
   * */
  static getProxyInstanceAndPropertyKeyByDotStr(dotStr: string, instance: JojoV5): [any, PropertyKey] {
    const arr = dotStr.split(".")
    let proxyRes = instance.data
    /**
     * arr 最后一项为 key
     * 如: 'a.b.c' -> 则 proxyInstance 为 instance.data.a.b; PropertyKey 为 'c'
     * */
    const l = arr.length
    for (let i = 0; i < l - 1; i++) {
      const proxyInstance = proxyRes[arr[i]]
      if (!proxyInstance) { // 无对应 proxyInstance
        throw new Error(`data.${dotStr} 其中 ${arr.slice(0,i+1).join(".")}不存在proxyInstance`)
      }
      proxyRes = proxyInstance
    }
    return [proxyRes, arr[l - 1]]
  }
}

/**
 * 测试
 * */
// @ts-ignore
window.insV05 = new JojoV5({
  data: () => ({ a: 123, num: 2, b: { c: false, d: { e: false } } }),
  methods: {
    addA() {
      ++this.data.a
    },
    addTwo() {
      ++this.data.num
    },
    toggleBC() {
      this.data.b.c = !this.data.b.c
    },
    /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
    toggleBDE() {
      this.data.b.d.e = !this.data.b.d.e
    }
  },
  computed: {
    aXNum() {
      return this.data.a * this.data.num
    }
  },
  watch: {
    a(val, preV) {
      console.log('watch.a')
      console.log(val, preV)
    }
  },
  render(this: JojoV5): void {
    // @ts-ignore
    document.getElementById("app").innerHTML = `
      <div id="v5AddAId">data.a: ${this.data.a}</div>
      <div id="v5AddTwoId">data.num: ${this.data.num}</div>
      <div id="v5ToggleBCId">data.b.c: ${this.data.b.c}</div>
      <button id="v5ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `
    //       <div>aXNum = ${this.computed.aXNum()}</div>
    // @ts-ignore
    document.getElementById("v5AddAId").onclick = this.methods.addA
    // @ts-ignore
    document.getElementById("v5AddTwoId").onclick = this.methods.addTwo
    // @ts-ignore
    document.getElementById("v5ToggleBCId").onclick = this.methods.toggleBC
    // @ts-ignore
    document.getElementById("v5ToggleBDEId").onclick = this.methods.toggleBDE
  }
})
