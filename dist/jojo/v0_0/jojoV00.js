const data = {
    a: 123
};
class JojoV00 {
    constructor() {
        this.data = {
            a: 123
        };
    }
    render() {
        // @ts-ignore
        document.getElementById("app").innerHTML = `
      <div>data.a = ${this.data.a}</div>
    `;
    }
}
const insV00 = new JojoV00();
insV00.render(); // 渲染
//# sourceMappingURL=jojoV00.js.map