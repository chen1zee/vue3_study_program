### vue3 研究记录

1. #### vue model层->变化->view层render 分析 （双向绑定）
    1. 实现建议框架 Jojo， 实现数据 g/setter 拦截 -> setter触发 render (V0.1) // [done in V0.1](./jojo/v0_1/jojoV01.ts)
    2. Jojo框架 利用 (Object.defineProperties[es5],vue2) Proxy(es6,本例使用)， 实现data的 getter setter 代理 // [done in V0.2](./jojo/v0_2/jojoV2.ts)
    3. Jojo 添加 effects 的 data依赖Map 如: renderDepMap = {a.proxy: ['c', 'd']} -> 表示 render 函数 触发了 a.proxy 代理的 key 'c', 'd'
    利用 Map&WeakMap 实现 // [done in V0.3](./jojo/v0_3/jojoV3.ts)
    4. Jojo 实现 watch, computed API
2. #### vue3 函数式组件 （vue3 组合式 API）
    1. Jojo框架实现 函数式 hooks
3. #### vue3组合式API 与 React hooks 比较
    1. vue3组合式API实现原理与运行示例
    2. React hooks实现原理与运行示例
4. #### React hooks + mobx 实现 类双向绑定
    1. mobx observable(可观察源) && observe(观察者) 模式
    2. React hooks 实现 render层， mobx管理数据源 示例
