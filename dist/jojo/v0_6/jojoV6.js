export class JojoV6 {
    constructor(opt) {
        /**
         * 用于 劫持过程中 存储依赖关系
         * 如: render.Begin -> traceMap 重置 -> render.ing -> 收集 getter -> render.end
         * -> depsMap['RENDER']存储依赖 = traceMap -> traceMap 重置
         * WeakMap<k: proxyInstance, v: Set<PropertyKey>
         * */
        this.traceMap = new WeakMap();
        /** 正在运行本次 数据变化 */
        this.isSetterHandling = false;
        this.data = {};
        this.initialing = true; // 初始化中flag
        this.data = JojoV6.data2Proxy(opt.data(), this);
    }
    /**
     * 将 data 转换为 proxy 代理其 g/setter
     * @example {a: 123, b: {c: 321}} ->
     * {a: Proxy<123>, b: Proxy<{c: 321}> & { c: Proxy<321> }}
     * */
    static data2Proxy(data, instance) {
        let temp = {};
        // 先 外层 proxy-> 遍历 data.key === {...}, 利用proxy 设置代理setter行为
        temp = JojoV6.createDataProxy(data, instance);
    }
    /** 代理 data 层 g/setters */
    static createDataProxy(obj, instance) {
        return new Proxy(obj, {
            get(target, p, receiver) {
                /** 依赖收集 */
                const traceMap = instance.traceMap;
                if (!traceMap.has(receiver)) {
                    traceMap.set(receiver, new Set());
                }
                ;
                traceMap.get(receiver).add(p);
                // 返回值
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
                    // TODO 此处 futureSetterDescs 冗余 后续用 Map 或者 Set 将其 去重
                    // TODO ing 改写 futureSetterDescs 结构 SetterDescs = Map<proxyInstance, Map<PropertyKey, [val, preV]>>
                    instance.futureSetterDescs.push([receiver, p]);
                    return true;
                }
            }
        });
        return undefined;
    }
}
/** 测试 */
// @ts-ignore
window.insV06 = new JojoV6({
    data: () => ({ a: 123, num: 2, b: { c: false, d: { e: false } } })
});
//# sourceMappingURL=jojoV6.js.map