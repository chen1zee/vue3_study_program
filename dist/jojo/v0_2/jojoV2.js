class JojoV2 {
    /**
     * TODO 添加 WeakMap 收集依赖
     * []WeakMap<> ->
     * */
    // private depsArr = []
    // private depsMapIdx = -1 // depsMap 指针
    constructor(opt) {
        this.data = {};
        this.methods = {};
        this.initialing = true; // 初始化中flag
        this.data = JojoV2.data2Proxy(opt.data(), this);
        this.render = opt.render.bind(this);
        Object.entries(opt.methods).forEach(([key, func]) => {
            this.methods[key] = func.bind(this);
        });
        this.initialing = false;
        // 初始化 渲染一次
        this.render();
    }
    /**
     * 将 data 转换为 proxy 代理其 g/setter
     * @example {a: 123, b: {c: 321}} ->
     * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
     * */
    static data2Proxy(data, instance) {
        let temp = {};
        /**
         * DONOTIMPLEMENT Proxy 对于 Array 操作亦有代理能力，如 a.push(123) -> (target: [], p: "push") 但本版本不处理 Array
         * */
        // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
        temp = JojoV2.createGSProxy(data, instance);
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
                temp[key] = JojoV2.data2Proxy(val, instance);
            }
        });
        return temp;
    }
    static createGSProxy(val, instance) {
        return new Proxy(val, {
            get(target, p) {
                return target[p];
            },
            set(target, p, value) {
                /** DONOTIMPLEMENT 此版本框架不处理 未声明key */
                if (!target.hasOwnProperty(p))
                    return false; // 抛错处理
                target[p] = value;
                // 初始化期间 不render
                if (!instance.initialing)
                    instance.render();
                return true;
            }
        });
    }
}
/**
 * 测试
 * */
// @ts-ignore
window.insV02 = new JojoV2({
    data: () => ({ a: 123, b: { c: false, d: { e: false } } }),
    methods: {
        addA() { ++this.data.a; },
        toggleBC() {
            this.data.b.c = !this.data.b.c;
        },
        /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
        toggleBDE() {
            this.data.b.d.e = !this.data.b.d.e;
        }
    },
    render() {
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div id="v2AddAId">this.data.a: ${this.data.a}</div>
      <div id="v2ToggleBCId">this.data.b.c ${this.data.b.c}</div>
      <button id="v2ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `;
        // @ts-ignore
        document.getElementById("v2AddAId").onclick = this.methods.addA;
        // @ts-ignore
        document.getElementById("v2ToggleBCId").onclick = this.methods.toggleBC;
        // @ts-ignore
        document.getElementById("v2ToggleBDEId").onclick = this.methods.toggleBDE;
    }
});
//# sourceMappingURL=jojoV2.js.map