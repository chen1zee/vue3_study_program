import { addMapSet, forEachMap, setMapMap } from "./utils.js";
export class JojoV6 {
    constructor(opt) {
        this.data = {};
        this.computed = {};
        this.methods = {};
        /**
         * 存储 依赖 key: string, val: TraceMapType
         * 如: key: '$$render', val: WeakMap{[a.proxy, Set['b', 'c']]} ->
         * 则代表 render 时 触发了 (a.proxy) 的 getter行为 取key 'b', 'c'
         * */
        this.depsMap = new Map();
        /**
         * key: DepKey: 如 '$$render'
         * val: TraceMapType 对应 依赖收集
         * 用于 劫持过程中 存储依赖关系
         * 如: render.Begin -> traceMap 重置 -> render.ing -> 收集 getter -> render.end
         * -> depsMap['RENDER']存储依赖 = traceMap -> traceMap 重置
         * WeakMap<k: proxyInstance, v: Set<PropertyKey>
         * */
        this.depsTraceMap = new Map();
        /** 正在运行本次 数据变化 */
        this.isSetterHandling = false;
        /** 副作用 进行中 flag */
        this.isEffecting = false;
        /**
         * 记录本次触发的　proxy.setter[]
         * 如 a.proxy 触发了 'b' = newBVal
         * Map<a.proxy, Map<'b', [preV, newBVal]>>
         * */
        this.nowSettersDescMap = new Map();
        /**
         * 记录 isSetterHandling = true // 处理本轮 setters中
         * 所引起的 其他 setters, 在下一轮次处理
         * 在下一轮时， 赋值给 nowSettersDescMap
         * */
        this.futureSettersDescMap = new Map();
        this.initialing = true; // 初始化中flag
        this.data = JojoV6.data2Proxy(opt.data(), this);
        this.computed = JojoV6.createComputedProxy(opt.computed, this);
        /** methods 处理 */
        this.methods = JojoV6.createMethodsProxy(opt.methods, this);
        this.render = JojoV6.createRenderProxy(opt.render, JojoV6.RENDER_KEY, this);
        // 初始化后 执行一次 render 并收集依赖
        this.render();
        this.initialing = false;
    }
    /**
     * 运行 副作用函数s -> render
     * */
    runEffectsRender() {
        this.futureSettersDescMap = new Map(); // 初始化 future
        // 查看是否有 futureSetters
        if (this.futureSettersDescMap.size) {
            // TODO watch Effect 有其他副作用 继续处理
            console.log('has future');
            console.log(this.futureSettersDescMap);
        }
        else {
            console.log('is empty future');
        }
        this.isSetterHandling = false;
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
                forEachMap(instance.depsTraceMap, (traceMap) => {
                    addMapSet(traceMap, receiver, p);
                    return true;
                });
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
                return JojoV6.addSettersDesc(instance, receiver, p, preV, value);
            }
        });
    }
    /** 代理 methods */
    static createMethodsProxy(methods, instance) {
        const temp = {};
        Object.entries(methods).forEach(([key, func]) => {
            let isRootEffect = false; // 此次effect 是否 根effect
            temp[key] = function () {
                if (!instance.isEffecting) { // 本次 触发为 根effect
                    instance.nowSettersDescMap = new Map(); // 初始化 settersDescMap
                    isRootEffect = true;
                    instance.isEffecting = true;
                }
                // TODO 处理 promise 异步方法
                func.apply(instance, arguments);
                if (isRootEffect) { // 根effect
                    // 处理 所触发 setters
                    instance.isEffecting = false;
                    isRootEffect = false; // 根effect 重置
                    instance.isSetterHandling = true;
                    instance.runEffectsRender();
                }
            };
        });
        return temp;
    }
    /** render 代理 */
    static createRenderProxy(func, depKey, instance) {
        instance.depsMap.set(depKey, new Map());
        return new Proxy(func, {
            apply(target, _, argArray) {
                const depMap = instance.depsMap.get(depKey);
                if (depMap.size) { // 有依赖关系
                    /** 比对此次 所触发 proxy.key 是否命中依赖 */
                    // 对应 函数 无 调用 getter 不用调用
                    if (!JojoV6.depHasChange(instance, depKey))
                        return;
                }
                /** traceMap 重置 并 func 运行过程收集 getter */
                instance.depsTraceMap.set(depKey, new Map());
                target.apply(instance, argArray);
                /** 将运行后依赖收集给 depsMap */
                instance.depsMap.set(depKey, instance.depsTraceMap.get(depKey));
                instance.depsTraceMap.set(depKey, new Map());
            }
        });
    }
    static createComputedProxy(computed, instance) {
        const preVObj = {}; // 存储 computed preV
        return new Proxy(computed, {
            get(target, p, receiver) {
                const depKey = `${JojoV6.COMP_PREFIX}_${p}`;
                let depMap = instance.depsMap.get(depKey);
                if (!depMap) {
                    depMap = new Map();
                    instance.depsMap.set(depKey, depMap);
                }
                if (depMap.size) { // 存在依赖， 比对
                    /** 比对此次 所触发 proxy.key 是否命中依赖 */
                    if (!JojoV6.depHasChange(instance, depKey)) {
                        // computed getter 算进 traceMap
                        forEachMap(instance.depsTraceMap, (traceMap, iDepKey) => {
                            // 自己排除依赖列表
                            if (iDepKey == depKey)
                                return true;
                            addMapSet(traceMap, receiver, p);
                            return true;
                        });
                        return preVObj[p];
                    }
                }
                /** traceMap 重置， 并 func 运行过程收集 getter */
                instance.depsTraceMap.set(depKey, new Map());
                const val = target[p].call(instance); // 运行 && 依赖收集
                // 收集完毕， 存储 && 重置资源
                instance.depsMap.set(depKey, instance.depsTraceMap.get(depKey));
                instance.depsTraceMap.set(depKey, new Map());
                // computed getter 算进 traceMap
                forEachMap(instance.depsTraceMap, (traceMap, iDepKey) => {
                    // 自己排除依赖列表
                    if (iDepKey == depKey)
                        return true;
                    addMapSet(traceMap, receiver, p);
                    return true;
                });
                /** 若值变化 ， 算触发了一次 setter */
                if (!Object.is(preVObj[p], val)) {
                    JojoV6.addSettersDesc(instance, receiver, p, preVObj[p], val);
                }
                console.log(`${depKey}执行computed函数计算新值`);
                preVObj[p] = val;
                return val;
            }
        });
    }
    /**
     * @param instance
     * @param depKey 依赖key
     * */
    static depHasChange(instance, depKey) {
        let hasChange = false; // 有依赖更新 flag
        /** 比对此次 所触发 proxy.key 是否命中依赖 */
        const depWeakMap = instance.depsMap.get(depKey);
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
                hasChange = true;
                return false; // break
            });
            return !hasChange; // 确认有依赖 break
        });
        return hasChange;
    }
    /**
     * setterDesc 插入
     * @param instance
     * @param receiver
     * @param p
     * @param preV
     * @param val
     */
    static addSettersDesc(instance, receiver, p, preV, val) {
        if (instance.isSetterHandling) { // 正在处理 上次 setters handle
            setMapMap(instance.futureSettersDescMap, receiver, p, [preV, val]);
            return true;
        }
        /** 记录 setters */
        setMapMap(instance.nowSettersDescMap, receiver, p, [preV, val]);
        return true;
    }
}
JojoV6.RENDER_KEY = "$$render";
JojoV6.COMP_PREFIX = "$$comp";
/** 测试 */
// @ts-ignore
window.insV06 = new JojoV6({
    data: () => ({ a: 123, num: 2, b: { c: false, d: { e: false } } }),
    computed: {
        aXNum() { return this.data.a * this.data.num; },
        cAXNum() {
            if (this.data.b.c) {
                return this.computed.aXNum;
            }
            return "c is false";
        }
    },
    methods: {
        addAAndTwo() {
            ++this.data.a;
            this.methods.addTwo();
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
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div id="v6AddAId">data.a: ${this.data.a}</div>
      <div id="v6AddTwoId">data.num: ${this.data.num}</div>
      <div>v6.computed.aXNum: ${this.computed.aXNum}</div>
      <div>v6.computed.cAXNum: ${this.computed.cAXNum}</div>
      <div id="v6ToggleBCId">data.b.c: ${this.data.b.c}</div>
      <button id="v6ToggleBDEId">toggle BDE</button>
      <div> render time ${Date.now()}</div>
    `;
        //       <div>aXNum = ${this.computed.aXNum()}</div>
        // @ts-ignore
        document.getElementById("v6AddAId").onclick = this.methods.addAAndTwo;
        // @ts-ignore
        document.getElementById("v6AddTwoId").onclick = this.methods.addTwo;
        // @ts-ignore
        document.getElementById("v6ToggleBCId").onclick = this.methods.toggleBC;
        // @ts-ignore
        document.getElementById("v6ToggleBDEId").onclick = this.methods.toggleBDE;
    }
});
//# sourceMappingURL=jojoV6.js.map