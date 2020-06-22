
const data = {
  a: 123
}

class JojoV00 {
  public data = {
    a: 123
  }

  render() {
    // @ts-ignore
    document.getElementById("app").innerHTML = `
      <div>data.a = ${this.data.a}</div>
    `
  }
}

const insV00 = new JojoV00()
insV00.render() // 渲染

