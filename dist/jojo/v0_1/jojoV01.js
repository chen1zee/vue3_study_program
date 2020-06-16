class JojoV01 {
    constructor(opt) {
        /** TODO data 应该为 private 不允许 class外部调用 (私有变量)，保证其 g/setter 完全代理其行为 */
        this.data = {};
        this.methods = {};
        this.data = JojoV01.data2InstanceData(opt.data(), this);
        this.render = opt.render.bind(this);
        Object.entries(opt.methods).forEach(([key, func]) => {
            this.methods[key] = func.bind(this);
        });
        // 初始化 渲染一次
        this.render();
    }
    /**
     * 将 data 转换为 拥有 getter setter 对象
     * @example {a: 123, b: {c: 321}} ->
     * {
     *   a: {_val: 123, $get(), $set()},
     *   b: {_val: {c: 321}, $get(), $set(), c: *pointer},
     * }
     * &pointer = {_val: 321, $get(), $set()}
     * */
    static data2InstanceData(data, instance) {
        const temp = {};
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
                // 注入 _val, $get, $set && val{object} -> 添加_val,_g/setter
                // @ts-ignore
                temp[key] = Object.assign(Object.assign({}, JojoV01.data2InstanceData(val, instance)), JojoV01.createGSObj(val, instance));
                return;
            }
            // 普通类型 && array && null
            temp[key] = JojoV01.createGSObj(val, instance);
        });
        return temp;
    }
    /**
     * 将 形如 {a: 123} -> 注入 -> {a: {_val: 123, $get(), $set()}}
     * */
    static createGSObj(val, instance) {
        const t = {
            _val: val, $get() { return t._val; },
            $set(v) {
                t._val = v;
                /**
                 * TODO 缺少 watcher 机制 [v0.x]， 导致 data 中 每个 setter 都触发 render
                 * 而实际应根据 render 依赖(getter收集) -> 如 renderDep[data.a, data.b] -> 则 data.c 的setter 不应该触发 render
                 * */
                instance.render();
            }
        };
        return t;
    }
}
/**
 * 测试
 * */
// @ts-ignore
window.insV01 = new JojoV01({
    data: () => ({ a: 123, b: { c: false, d: { e: false } } }),
    methods: {
        addA() {
            const dataA = this.data.a;
            dataA.$set(dataA.$get() + 1);
        },
        toggleBC() {
            const dataBC = this.data.b.c;
            dataBC.$set(!dataBC.$get());
        },
        /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
        toggleBDE() {
            const dataBDE = this.data.b.d.e;
            dataBDE.$set(!dataBDE.$get());
        }
    },
    render() {
        /**
         * TODO [do not implement] 忽略vue 中 template 转换 js -> fragments -> mounted -> events 到 model.methods 的转发 (view层 event 到 model 层handler 的绑定)
         * 也就是 此框架 只 实现 model层到view层的绑定
         * 以下直接 写 dom
         * */
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div id="v1AddAId">${this.data.a.$get()}</div>
      <div id="v1ToggleBCId">${this.data.b.c.$get()}</div>
      <button id="v1ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `;
        // @ts-ignore
        document.getElementById("v1AddAId").onclick = this.methods.addA;
        // @ts-ignore
        document.getElementById("v1ToggleBCId").onclick = this.methods.toggleBC;
        // @ts-ignore
        document.getElementById("v1ToggleBDEId").onclick = this.methods.toggleBDE;
    }
});
//# sourceMappingURL=jojoV01.js.map