class JojoV4 {
    constructor(opt) {
        this.data = {};
        this.computed = {};
        this.methods = {};
        this.initialing = true; // 初始化中flag
        /**
         * 存储 依赖 key: string, val: WeakMap|null
         * 如: key: 'render', val: WeakMap[[a.proxy, ['b', 'c']]] -> 则代表 render 时 触发了 (a.proxy) 的 getter行为 取key 'b', 'c'
         * */
        this.depsMap = new Map();
        /**
         * 用于 劫持过程中 存储 依赖关系
         * 如: render.Begin -> traceMap 重置 -> render.ing -> 收集 getter -> render.end
         * -> depsMap['RENDER']存储依赖 = traceMap -> traceMap 重置
         * WeakMap<k: object, v: []'keys'>
         * */
        this.traceMap = new WeakMap();
        /**
         * TODO [完善ing] 副作用 Map 如: computed, watch 等 要细分化 不存放一起，
         * ?? key: string: 对应functionKey, val: {returnVal?: any}
         * val.returnVal 记录 执行结果 ， 用于 依赖无更新时 取值
         * */
        this.effectsMap = new Map();
        /**
         * watch Map
         * key proxyInstance 对应 opt.watch['a.b.c'] data.a.b.proxyInstance
         * value: Set<{ key, preV, func, }>
         *  */
        this.watchProxyMapMap = new Map();
        /** 正在运行本次 数据变化 */
        this.isSetterHandling = false;
        /**
         * 记录本次触发的 proxy.setter [proxyInstance, 'key', value]
         * TODO 做成 setter队列, if(isSetterHandling) 收集 本段 触发 setters[] -> render -> isSetterHandling = false [v0.x]
         * [proxyInstance, PropertyKey, val]
         * */
        this.nowSetterDesc = [null, '', null];
        /**
         * 记录 本次 watchAndRender 引起的 其他 setter
         * 并继续处理
         * */
        this.futureSetterDescs = [];
        this.data = JojoV4.data2Proxy(opt.data(), this);
        /** render 处理 */
        this.render = JojoV4.createFuncProxy(opt.render, JojoV4.RENDER_KEY, this);
        /** computed 处理 */
        Object.entries(opt.computed).forEach(([key, func]) => {
            this.computed[key] = JojoV4.createFuncProxy(func, key, this);
        });
        /** watch 处理 */
        Object.entries(opt.watch).forEach(([funcName, func]) => {
            const [proxy, key] = JojoV4.getProxyInstanceAndPropertyKeyByDotStr(funcName, this);
            let watchProxyMap = this.watchProxyMapMap.get(proxy);
            if (!watchProxyMap) { // 初始化
                this.watchProxyMapMap.set(proxy, new Map());
                watchProxyMap = this.watchProxyMapMap.get(proxy);
            }
            ;
            watchProxyMap.set(key, { preV: null, func });
        });
        Object.entries(opt.methods).forEach(([key, func]) => {
            this.methods[key] = func.bind(this);
        });
        this.initialing = false;
        this.watchAndRender(false);
    }
    /**
     * setter 触发对应watchesMap -> 执行 && render
     * @param {Boolean} runWatch 是否 运行watcher flag
     * */
    watchAndRender(runWatch = true) {
        const [proxy, key, value] = this.nowSetterDesc;
        for (let i = 0; i < 1; i++) { // 处理 watcher
            if (!runWatch)
                break;
            const watchProxyMap = this.watchProxyMapMap.get(proxy);
            if (!watchProxyMap)
                break;
            const watcher = watchProxyMap.get(key);
            if (!watcher)
                break;
            // 命中 watcher
            if (Object.is(value, watcher.preV))
                break; // 值相同 不触发 watcher
            watcher.func.call(this, value, watcher.preV); // 执行watcher
            watcher.preV = value; // 记录旧值
        }
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
        temp = JojoV4.createGSProxy(data, instance);
        Object.entries(data).forEach(([key, val]) => {
            if (typeof val == "object" && !Array.isArray(val) && val !== null) { // object: {}
                temp[key] = JojoV4.data2Proxy(val, instance);
            }
        });
        return temp;
    }
    /** 代理 data 层 g/setters */
    static createGSProxy(val, instance) {
        return new Proxy(val, {
            get(target, p, receiver) {
                /** 依赖收集 */
                if (instance.traceMap !== null) {
                    if (!instance.traceMap.has(receiver)) {
                        instance.traceMap.set(receiver, new Set());
                    }
                    instance.traceMap.get(receiver).add(p);
                }
                return target[p];
            },
            set(target, p, value, receiver) {
                /** DONOTIMPLEMENT 此版本框架不处理 未声明key */
                if (!target.hasOwnProperty(p))
                    return false; // 抛错处理
                target[p] = value;
                // 初始化期间 不render
                if (instance.initialing)
                    return true;
                /** 非初始化, 记录setter */
                if (instance.isSetterHandling) { // 正在处理 上次 setters handle
                    instance.isSetterHandling = true;
                    // TODO 此处 futureSetterDescs 冗余 后续用 Map 或者 Set 将其 去重
                    instance.futureSetterDescs.push([receiver, p]);
                    return true;
                }
                // 处理 setters handle
                instance.nowSetterDesc = [receiver, p, value];
                instance.watchAndRender();
                instance.isSetterHandling = false; // 解锁
                return true;
            }
        });
    }
    /**
     * TODO render computed watch 细化各自 proxy代理行为 [v0.x]
     * 代理 函数 如 render computed.xxx
     * */
    static createFuncProxy(func, depsMapKey, instance) {
        if (instance.depsMap.has(depsMapKey)) {
            console.error(`createFuncProxy key 冲突 (本框架无特定namespace, methods, watch, computed 等 共用 "": 无前缀)`);
            console.error(`冲突 key, ${depsMapKey}`);
            throw new Error(`冲突 key, ${depsMapKey}`);
        }
        /**
         * effectsMap 记录 func 返回值 等信息
         * */
        instance.effectsMap.set(depsMapKey, {
            returnVal: undefined // 缓存执行结果
        });
        instance.depsMap.set(depsMapKey, null);
        return new Proxy(func, {
            apply(target, _, argArray) {
                const depWeakMap = instance.depsMap.get(depsMapKey);
                if (depWeakMap) { // 若有依赖列表 比对此次 所触发 proxy.key 是否命中依赖
                    // 对应 函数 无 调用 getter 不用调用
                    if (!depWeakMap.has(instance.nowSetterDesc[0])) {
                        console.log("从 缓存取值");
                        return instance.effectsMap.get(depsMapKey).returnVal;
                    }
                }
                /** traceMap 重置 并 func 运行过程收集 getter */
                instance.traceMap = new WeakMap();
                const runnedVal = target.apply(instance, argArray);
                /** 将 运行后 依赖 收集给 depsMap */
                instance.depsMap.set(depsMapKey, instance.traceMap);
                instance.traceMap = null;
                instance.effectsMap.get(depsMapKey).returnVal = runnedVal;
                return runnedVal;
            }
        });
    }
    /**
     * 根据 .访问字符串 拿取 对应 data.proxyInstance
     * 如: a.b.c --> this.data.a.b.c
     * */
    static getProxyInstanceAndPropertyKeyByDotStr(dotStr, instance) {
        const arr = dotStr.split(".");
        let proxyRes = instance.data;
        /**
         * arr 最后一项为 key
         * 如: 'a.b.c' -> 则 proxyInstance 为 instance.data.a.b; PropertyKey 为 'c'
         * */
        const l = arr.length;
        for (let i = 0; i < l - 1; i++) {
            const proxyInstance = proxyRes[arr[i]];
            if (!proxyInstance) { // 无对应 proxyInstance
                throw new Error(`data.${dotStr} 其中 ${arr.slice(0, i + 1).join(".")}不存在proxyInstance`);
            }
            proxyRes = proxyInstance;
        }
        return [proxyRes, arr[l - 1]];
    }
}
JojoV4.RENDER_KEY = "$$render";
// @ts-ignore
window.JojoV4 = JojoV4;
/**
 * 测试
 * */
// @ts-ignore
window.insV04 = new JojoV4({
    data: () => ({ a: 123, b: { c: false, d: { e: false } } }),
    methods: {
        addA() {
            ++this.data.a;
        },
        toggleBC() {
            this.data.b.c = !this.data.b.c;
        },
        /** 此处示范 b.d.e setter 也会触发 render问题， renderDep[!b.d.e] */
        toggleBDE() {
            this.data.b.d.e = !this.data.b.d.e;
        }
    },
    computed: {
        aX2() {
            return this.data.a * 2;
        }
    },
    watch: {
        a(val, preV) {
            console.log('watch.a');
            console.log(val, preV);
        }
    },
    render() {
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div id="v4AddAId">${this.data.a}</div>
      <div id="v4ToggleBCId">${this.data.b.c}</div>
      <button id="v4ToggleBDEId">toggle BDE</button>
      <div>aX2 = ${this.computed.aX2()}</div>
      <div> render time ${Date.now()}</div>
    `;
        // @ts-ignore
        document.getElementById("v4AddAId").onclick = this.methods.addA;
        // @ts-ignore
        document.getElementById("v4ToggleBCId").onclick = this.methods.toggleBC;
        // @ts-ignore
        document.getElementById("v4ToggleBDEId").onclick = this.methods.toggleBDE;
    }
});
//# sourceMappingURL=jojoV4.js.map