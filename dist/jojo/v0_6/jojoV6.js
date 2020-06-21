import { addMapSet, forEachMap, setMapMap } from "./utils.js";
export class JojoV6 {
    constructor(opt) {
        this.data = {};
        this.methods = {};
        /**
         * 存储 依赖 key: string, val: TraceMapType
         * 如: key: '$$render', val: WeakMap{[a.proxy, Set['b', 'c']]} ->
         * 则代表 render 时 触发了 (a.proxy) 的 getter行为 取key 'b', 'c'
         * */
        this.depsMap = new Map();
        /**
         * 用于 劫持过程中 存储依赖关系
         * 如: render.Begin -> traceMap 重置 -> render.ing -> 收集 getter -> render.end
         * -> depsMap['RENDER']存储依赖 = traceMap -> traceMap 重置
         * WeakMap<k: proxyInstance, v: Set<PropertyKey>
         * */
        this.traceMap = new WeakMap();
        /** 正在运行本次 数据变化 */
        this.isSetterHandling = false;
        /**
         * 记录本次触发的　proxy.setter[]
         * 如 a.proxy 触发了 'b' = newBVal
         * Map<a.proxy, Map<'b', [preV, newBVal]>>
         * */
        this.nowSettersDescMap = new Map();
        this.initialing = true; // 初始化中flag
        this.data = JojoV6.data2Proxy(opt.data(), this);
        /** methods 处理 */
        Object.entries(opt.methods).forEach(([key, func]) => {
            this.methods[key] = func.bind(this);
        });
        this.render = JojoV6.createRenderProxy(opt.render, JojoV6.RENDER_KEY, this);
        // 初始化后 执行一次 render 并收集依赖
        this.render();
        this.initialing = false;
    }
    /**
     * 运行 副作用函数s -> render
     * */
    runEffectsRender() {
        // TODO watch为副作用, 需遍历处理 then render
        this.render();
    }
    /**
     * 将 data 转换为 proxy 代理其 g/setter
     * @example {a: 123, b: {c: 321}} ->
     * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
     * */
    static data2Proxy(data, instance) {
        /**
         * DONOTIMPLEMENT Proxy 对于 Array 操作亦有代理能力，如 a.push(123) -> (target: [], p: "push") 但本版本不处理 Array
         * */
        // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
        const temp = JojoV6.createDataProxy(data, instance);
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
                temp[key] = JojoV6.data2Proxy(val, instance);
            }
        });
        return temp;
    }
    /** 代理 data 层 g/setters */
    static createDataProxy(obj, instance) {
        return new Proxy(obj, {
            get(target, p, receiver) {
                /** 依赖收集 */
                addMapSet(instance.traceMap, receiver, p);
                return target[p]; // 返回值
            },
            set(target, p, value, receiver) {
                /** DONOTIMPLEMENT 此版本框架不处理 未声明key */
                if (!target.hasOwnProperty(p))
                    return false; // 抛错处理
                const preV = target[p]; // 前值
                // TODO
                if (Object.is(preV, value))
                    return true; // 前后值相同，不触发 响应更新
                target[p] = value;
                // 初始化期间 不render
                if (instance.initialing)
                    return true;
                /** 非初始化, 记录setter */
                if (instance.isSetterHandling) { // 正在处理 上次 setters handle
                    // TODO 此处 futureSetterDescs 冗余 后续用 Map 或者 Set 将其 去重
                    // TODO ing 改写 futureSetterDescs 结构 SetterDescs = Map<proxyInstance, Map<PropertyKey, [val, preV]>>
                    // instance.futureSetterDescs.push([receiver, p])
                    console.log("待完成"); // TODO ing
                    return true;
                }
                /** 处理本次 setters */
                instance.isSetterHandling = true;
                setMapMap(instance.nowSettersDescMap, receiver, p, [preV, value]);
                instance.runEffectsRender(); // 运行 副作用操作 && render
                instance.isSetterHandling = false; // 解锁
                /** 清空setter集 */
                instance.nowSettersDescMap = new Map();
                return true;
            }
        });
    }
    /** render 代理 */
    static createRenderProxy(func, depsMapKey, instance) {
        instance.depsMap.set(depsMapKey, new WeakMap());
        return new Proxy(func, {
            apply(target, _, argArray) {
                if (!instance.initialing) { // 非初始化中
                    /** 比对此次 所触发 proxy.key 是否命中依赖 */
                    const depWeakMap = instance.depsMap.get(depsMapKey);
                    let hasDepChange = false; // 有 依赖 更新
                    // 遍历当前 setters， 判断 是否命中 depMap
                    forEachMap(instance.nowSettersDescMap, (keysMap, proxyInstance) => {
                        const proxyKeySet = depWeakMap.get(proxyInstance);
                        if (!proxyKeySet)
                            return true; // depWeakMap中无对应 依赖 继续遍历
                        // 遍历 nowSetterDesc 对应key
                        forEachMap(keysMap, (_, key) => {
                            if (!proxyKeySet.has(key))
                                return true; // 无对应key 如 a.proxy.b 继续遍历
                            // 命中依赖
                            hasDepChange = true;
                            return false; // break
                        });
                        return !hasDepChange; // 确认有依赖 break
                    });
                    // 对应 函数 无 调用 getter 不用调用
                    if (!hasDepChange)
                        return;
                }
                /** traceMap 重置 并 func 运行过程收集 getter */
                instance.traceMap = new WeakMap();
                target.apply(instance, argArray);
                console.log(instance.traceMap);
                /** 将运行后依赖收集给 depsMap */
                instance.depsMap.set(depsMapKey, instance.traceMap);
                instance.traceMap = new WeakMap();
            }
        });
    }
}
JojoV6.RENDER_KEY = "$$render";
/** 测试 */
// @ts-ignore
window.insV06 = new JojoV6({
    data: () => ({ a: 123, num: 2, b: { c: false, d: { e: false } } }),
    methods: {
        addA() {
            ++this.data.a;
        },
        addTwo() {
            ++this.data.num;
        },
        toggleBC() {
            this.data.b.c = !this.data.b.c;
        },
        /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
        toggleBDE() {
            this.data.b.d.e = !this.data.b.d.e;
        }
    },
    render() {
        console.log("render");
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div id="v6AddAId">data.a: ${this.data.a}</div>
      <div id="v6AddTwoId">data.num: ${this.data.num}</div>
      <div id="v6ToggleBCId">data.b.c: ${this.data.b.c}</div>
      <button id="v6ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `;
        //       <div>aXNum = ${this.computed.aXNum()}</div>
        // @ts-ignore
        document.getElementById("v6AddAId").onclick = this.methods.addA;
        // @ts-ignore
        document.getElementById("v6AddTwoId").onclick = this.methods.addTwo;
        // @ts-ignore
        document.getElementById("v6ToggleBCId").onclick = this.methods.toggleBC;
        // @ts-ignore
        document.getElementById("v6ToggleBDEId").onclick = this.methods.toggleBDE;
    }
});
//# sourceMappingURL=jojoV6.js.map