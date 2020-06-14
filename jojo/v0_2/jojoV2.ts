
/**
 * 创建 reactor 对象(实现 model层变化->view层 自动 render绑定),
 * NEWFEATURE 根据 入参 data 创建 对应  Proxy对象(从内层到外层) 代理 g/setter
 * TODO getter --> 收集依赖 , 建立 depends watcher机制 [v0.x]
 * */
type DataValAnyV02Type = { [k in string]: any }
type JojoOptV02Type = {
  data: () => DataValAnyV02Type,
  methods: { [k in string]: (this: Jojo) => void },
  render(this: Jojo): void
}

class Jojo {
  /** TODO data 应该为 private 不允许 class外部调用 (私有变量)，保证其 g/setter 完全代理其行为 */
  public data: DataValAnyV02Type = {}
  private readonly render: () => void // render 函数 需通过 constructor 指定
  private methods: {[k in string]: () => void} = {}

  constructor(opt: JojoOptV02Type) {
    this.data = Jojo.data2Proxy(opt.data(), this)
    this.render = opt.render.bind(this)
    Object.entries(opt.methods).forEach(([key, func]) => {
      this.methods[key] = func.bind(this)
    })
    // 初始化 渲染一次
    this.render()
  }

  /**
   * TODO ing 深层 嵌套 proxy 创建
   * 将 data 转换为 proxy 代理其 g/setter
   * @example {a: 123, b: {c: 321}} ->
   * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
   * */
  static data2Proxy(data: DataValAnyV02Type, instance: Jojo) {
    const temp: DataValAnyV02Type = {}
    Object.entries(data).forEach(([key, val]) => { // 遍历找出 所有 obj 并 将其 proxy化
      if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
        // 先迭代 底层数据， 再 proxy化
        Jojo.data2Proxy(temp[key], instance)
        temp[key] = Jojo.createGSProxy(val, instance)
        return
      }
    })
    // TODO ing solving
    temp = Jojo.createGSProxy(data, instance)
    return temp
  }
  static createGSProxy(val, instance: Jojo) {
    return new Proxy(val, {
      get(target: any, p: PropertyKey): any {
        return target[p]
      },
      set(target: any, p: PropertyKey, value: any): boolean {
        target[p] = value
        instance.render()
        return true
      }
    })
  }
}

/**
 * 测试
 * */
// @ts-ignore
window.insV02 = new Jojo({
  data: () => ({ a: 123, b: { c: false, d: { e: false } } }),
  methods: {
    addA(this: Jojo) {
      const dataA = this.data.a
      dataA.$set(dataA.$get() + 1)
    },
    toggleBC(this: Jojo) {
      const dataBC = this.data.b.c
      dataBC.$set(!dataBC.$get() )
    },
    /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
    toggleBDE(this: Jojo) {
      const dataBDE = this.data.b.d.e
      dataBDE.$set(!dataBDE.$get())
    }
  },
  render(this: Jojo): void {
    /**
     * TODO [do not implement] 忽略vue 中 template 转换 js -> fragments -> mounted -> events 到 model.methods 的转发 (view层 event 到 model 层handler 的绑定)
     * 也就是 此框架 只 实现 model层到view层的绑定
     * 以下直接 写 dom
     * */
    // @ts-ignore
    document.getElementById("app").innerHTML = `
      <div id="test1">${this.data.a.$get()}</div>
      <div id="test2">${this.data.b.c.$get()}</div>
      <button id="test3">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `
    // @ts-ignore
    document.getElementById("test1").onclick = this.methods.addA
    // @ts-ignore
    document.getElementById("test2").onclick = this.methods.toggleBC
    // @ts-ignore
    document.getElementById("test3").onclick = this.methods.toggleBDE
  }
})
