### vue3 研究记录

#### 1. vue model层->变化->view层render 分析 （双向绑定）
    ##### 1.1. 实现建议框架 Jojo， 实现数据 g/setter 拦截 -> setter触发 render (V0.1)
    ##### 1.2. Jojo框架 利用 (Object.defineProperties[es5],vue2) Proxy(es6,本例使用)， 实现data的 getter setter 代理

