import { forEachMap, getMapItemOrInit } from "./utils.js";
/**
 * 全局 watcher 处理器
 * 用于 收集 每个轮片中  setters -> 触发 watchers -> 收集结束 -> watchers.forEach.run()
 * */
class GlobalWatcherHandler {
    constructor() {
        this.hasTriggerSetters = false; // 本轮片中 开始 触发setters flag
        this.watchersSet = new Set(); // 收集 watchers
        this.ticker = () => {
            window.requestAnimationFrame(() => {
                if (this.hasTriggerSetters) { // 本轮中有触发 setters -> watchers.forEach.run() -> 释放依赖
                    console.log("本轮 ticker有触发 setters 对应 watchers", this.watchersSet);
                    this.hasTriggerSetters = false;
                    console.log(this.watchersSet.size);
                    this.watchersSet.forEach(watcher => { watcher.run(); });
                    this.watchersSet = new Set(); // 清空 watchers
                }
                this.ticker();
            });
        };
    }
}
const globalWatcherHandler = new GlobalWatcherHandler();
globalWatcherHandler.ticker(); // 启动监听 循环
// @ts-ignore
window.globalWatcherHandler = globalWatcherHandler;
class Jojo2V1 {
    constructor(opt) {
        this.methods = {};
        /**
         * 存储 对应 data[key] 的 依赖 Set
         * mapKey: 如 data.bbb.ccc -> bbb_ccc; mapVal: set
         * setVal: Watcher 对应 watcher
         * */
        this.depsSetMap = new Map();
        this.initialing = true; // 初始化ing flag
        this.data = Jojo2V1.data2Observable(opt.data(), this);
        /** methods 处理 */
        this.methods = Jojo2V1.createMethodsProxy(opt.methods, this);
        /** redner 处理 */
        this.renderWatcher = Jojo2V1.createRenderWatcher(opt.render, this);
        /** 运行一次 */
        this.renderWatcher.run();
        // 初始化 render 完毕
        this.initialing = false;
    }
    /**
     * 将data转为 proxy 代理其 g/setter
     * @example {a: 123, b: {c: 321}} ->
     * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
     * */
    static data2Observable(data, instance, prefix = '$data') {
        /** DONOTIMPLEMENT 不处理 Array */
        // 先 外层 proxy -> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
        const temp = Jojo2V1.createDataObservable(data, instance, prefix);
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val === 'object' && !Array.isArray(val) && val !== null) { // object: {}
                temp[key] = Jojo2V1.data2Observable(val, instance, `${prefix}_${key}`);
            }
            // Array 此框架不处理
        });
        return temp;
    }
    /** 代理 data层 g/setters */
    static createDataObservable(obj, instance, prefix) {
        return new Proxy(obj, {
            get(target, p) {
                const depsSetMapKey = `${prefix}_${p}`; // depsSetMap 对应的 key
                // 处理 depsSetMap
                let depsSet = getMapItemOrInit(instance.depsSetMap, depsSetMapKey, () => new Set());
                if (globalWatcherHandler.runningWatcher)
                    depsSet.add(globalWatcherHandler.runningWatcher);
                return target[p]; // 返回值
            },
            set(target, p, value) {
                /** DONOTIMPLEMENT 此版本框架不处理 未声明key */
                if (!target.hasOwnProperty(p))
                    return false; // 抛错处理
                const preV = target[p]; // 前值
                if (Object.is(preV, value))
                    return false; // 前后值相同， 不触发 响应更新
                target[p] = value;
                // 初始化期间 不render
                if (instance.initialing)
                    return true;
                // 非初始化
                const depsSetMapKey = `${prefix}_${p}`; // depsSetMap 对应的 key
                if (!globalWatcherHandler.hasTriggerSetters) {
                    globalWatcherHandler.hasTriggerSetters = true;
                }
                // 通知 Deps 数组中的 watcher 执行更新 ...
                const depsSet = instance.depsSetMap.get(depsSetMapKey);
                if (!depsSet || !depsSet.size)
                    return true;
                depsSet.forEach(watcher => {
                    globalWatcherHandler.watchersSet.add(watcher); // 推入待处理 watchers
                });
                return true;
            }
        });
    }
    /** 代理 methods */
    static createMethodsProxy(methods, instance) {
        const temp = {};
        Object.entries(methods).forEach(([key, func]) => {
            temp[key] = new Proxy(func, {
                apply(target, _, argArray) { return target.apply(instance, argArray); }
            });
        });
        return temp;
    }
    /** render 初始化 */
    static createRenderWatcher(func, instance) {
        const proxyFunc = new Proxy(func, { apply(target) { target.apply(instance); } });
        return new Watcher(proxyFunc, instance, '$$render');
    }
}
class Watcher {
    constructor(func, vm, name) {
        this.job = func;
        this.vm = vm;
        this.name = name;
    }
    /**
     * 执行 watcher
     * 1. globalWatcherHandler.runningWatcher 指向本 watcher
     * 2. 遍历 data.Deps, 移除本 watcher
     * NEWFEATURE 2 不应该每次watcher触发均清理(GC与每次重置 效率对比)，，建立一个 GC机制， 或优化遍历结构&&移除算法
     * 3. data触发getter --> watcher 推入 对应的 DepItem, (globalWatcherHandler.runningWatcher)
     * */
    run() {
        globalWatcherHandler.runningWatcher = this;
        // 清除 depsSetMap 中 所有 本watcher， watcher.job() 时重新收集依赖
        forEachMap(this.vm.depsSetMap, (watcherkSet) => {
            watcherkSet.delete(this);
            return true;
        });
        this.job(); // 运行对应函数
        globalWatcherHandler.runningWatcher = null;
    }
}
// @ts-ignore
window.insV01 = new Jojo2V1({
    data: () => ({
        aaa: 1,
        bbb: { ccc: false },
        ddd: 123,
    }),
    methods: {
        addAaa() {
            return ++this.data.aaa;
        },
        toggleBbbCcc() {
            this.data.bbb.ccc = !this.data.bbb.ccc;
        },
        mixOper() {
            this.methods.addAaa();
            this.methods.toggleBbbCcc();
        },
        addDdd() {
            ++this.data.ddd;
        }
    },
    render() {
        /**
         * 此框架不实现 模板 解析
         * 直接写 dom
         * */
        // @ts-ignore
        document.getElementById('app').innerHTML = `
      <div id="v1AddAaaId">data.aaa: ${this.data.aaa}</div>
      <div id="v1ToggleBbbCccId">data.bbb.ccc: ${this.data.bbb.ccc}</div>
      <button id="v1TestMixMethods">测试多个methods</button><br>
      <button id="v1AddDddId">add ddd</button>
      ${this.data.bbb.ccc ?
            '<div>bbb.ccc == true 才展示 -> ddd: ' + this.data.ddd + '</div>' :
            ''}
      <div> render time ${Date.now()} </div>
    `;
        // @ts-ignore
        document.getElementById("v1AddAaaId").onclick = this.methods.addAaa;
        // @ts-ignore
        document.getElementById('v1ToggleBbbCccId').onclick = this.methods.toggleBbbCcc;
        // @ts-ignore
        document.getElementById('v1TestMixMethods').onclick = this.methods.mixOper;
        // @ts-ignore
        document.getElementById('v1AddDddId').onclick = this.methods.addDdd;
    }
});
//# sourceMappingURL=v01.js.map