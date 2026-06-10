// VibeMail Glass — WebGL nebula background. Typed port of nebula.js.
// Mounted when animatedBg = true; unmounted when false. "Nebula Drift" —
// domain-warped cosmic clouds, idle drift only (no mouse/ripple interaction).

const VERT = ["attribute vec2 a_pos;", "void main(){gl_Position=vec4(a_pos,0.0,1.0);}"].join("\n");

const FRAG = [
  "precision highp float;",
  "uniform vec2  u_res;",
  "uniform float u_time;",
  "uniform float u_dark;",
  "const float u_intensity = 0.7;",

  "float hash21(vec2 p){",
  "  p = fract(p * vec2(123.34, 456.21));",
  "  p += dot(p, p + 45.32);",
  "  return fract(p.x * p.y);",
  "}",
  "vec2 hash22(vec2 p){ return vec2(hash21(p), hash21(p + vec2(19.3, 7.1))); }",
  "float vnoise(vec2 p){",
  "  vec2 i = floor(p), f = fract(p);",
  "  vec2 u = f * f * (3.0 - 2.0 * f);",
  "  float a = hash21(i);",
  "  float b = hash21(i + vec2(1.0, 0.0));",
  "  float c = hash21(i + vec2(0.0, 1.0));",
  "  float d = hash21(i + vec2(1.0, 1.0));",
  "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
  "}",
  "float fbm(vec2 p){",
  "  float v = 0.0, a = 0.5;",
  "  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);",
  "  for(int i = 0; i < 6; i++){",
  "    v += a * vnoise(p);",
  "    p = m * p;",
  "    a *= 0.5;",
  "  }",
  "  return v;",
  "}",
  "vec3 starLayer(vec2 uv, float density, float sz, float thresh){",
  "  vec2 g = uv * density;",
  "  vec2 id = floor(g);",
  "  vec2 f = fract(g) - 0.5;",
  "  float h = hash21(id);",
  "  vec2 off = (hash22(id + 3.0) - 0.5) * 0.7;",
  "  float star = smoothstep(sz, 0.0, length(f - off));",
  "  float tw = 0.55 + 0.45 * sin(u_time * (1.4 + u_intensity * 1.6) + h * 40.0);",
  "  return vec3(star * step(thresh, h) * tw);",
  "}",

  "vec3 render(vec2 uv, float u_aspect, float dark){",
  "  vec2 p = (uv - 0.5) * vec2(u_aspect, 1.0) * 3.0;",
  "  float t = u_time * 0.045 * (0.4 + u_intensity);",
  "  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3)));",
  "  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.15 * t),",
  "                fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.12 * t));",
  "  float f = fbm(p + 4.0 * r);",
  "  float dens = pow(clamp(f, 0.0, 1.0), 3.3);",
  "  float warp = clamp(length(r), 0.0, 1.0);",
  "  float fil  = pow(clamp(r.x, 0.0, 1.0), 3.6);",
  "  float core = pow(dens, 4.2);",
  "  if(dark > 0.5){",
  "    vec3 col = vec3(0.003, 0.010, 0.007);",
  "    col += vec3(0.04, 0.30, 0.13) * dens * 1.15;",
  "    col += vec3(0.10, 0.18, 0.50) * pow(warp, 2.6) * 0.35;",
  "    col += vec3(0.26, 0.95, 0.50) * fil * 1.0;",
  "    col += vec3(0.85, 1.0, 0.90)  * core * 0.55;",
  "    col *= 1.0 - 0.55 * length(uv - 0.5);",
  "    col *= 0.55;",
  "    col += starLayer(uv, 88.0, 0.11, 0.84) * vec3(0.88, 1.0, 0.92) * 2.0;",
  "    col += starLayer(uv, 46.0, 0.08, 0.88) * vec3(0.78, 0.96, 0.84) * 1.5;",
  "    return col;",
  "  }",
  "  vec3 col = vec3(1.0, 1.0, 1.0);",
  "  col -= vec3(0.42, 0.08, 0.30) * dens * 1.25;",
  "  col -= vec3(0.20, 0.12, 0.34) * pow(warp, 2.6) * 0.30;",
  "  col -= vec3(0.58, 0.06, 0.44) * fil * 0.95;",
  "  col += vec3(0.06, 0.10, 0.07) * core * 0.40;",
  "  col *= 1.0 - 0.06 * length(uv - 0.5);",
  "  col -= starLayer(uv, 88.0, 0.11, 0.84) * vec3(0.30, 0.12, 0.24) * 1.2;",
  "  col -= starLayer(uv, 46.0, 0.08, 0.88) * vec3(0.26, 0.10, 0.21) * 0.9;",
  "  return clamp(col, 0.0, 1.0);",
  "}",

  "void main(){",
  "  vec2 uv = gl_FragCoord.xy / u_res;",
  "  float asp = u_res.x / u_res.y;",
  "  vec3 col = render(uv, asp, u_dark);",
  "  float dither = (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;",
  "  col += dither;",
  "  gl_FragColor = vec4(max(col, 0.0), 1.0);",
  "}",
].join("\n");

class VMNebula {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private rafId: number | null = null;
  private startTime = 0;
  private uRes: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uDark: WebGLUniformLocation | null = null;
  private dark = 1.0;
  private mounted = false;
  private onResize: (() => void) | null = null;

  mount(): void {
    if (this.mounted) return;
    if (typeof document === "undefined") return;
    this.mounted = true;

    const c = document.createElement("canvas");
    c.id = "vm-nebula-canvas";
    c.style.cssText = [
      "position:fixed;inset:0;width:100%;height:100%;",
      "z-index:0;pointer-events:none;",
      "opacity:0;transition:opacity 0.7s ease;",
    ].join("");
    document.body.insertBefore(c, document.body.firstChild);
    this.canvas = c;

    const gl = c.getContext("webgl", {
      antialias: false,
      powerPreference: "low-power",
      alpha: false,
    });
    if (!gl) {
      this.unmount();
      return;
    }
    this.gl = gl;

    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog || !vs || !fs) {
      this.unmount();
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[VMNebula] link error:", gl.getProgramInfoLog(prog));
      this.unmount();
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uRes = gl.getUniformLocation(prog, "u_res");
    this.uTime = gl.getUniformLocation(prog, "u_time");
    this.uDark = gl.getUniformLocation(prog, "u_dark");

    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);

    this.startTime = performance.now();
    this.loop();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.canvas) this.canvas.style.opacity = "1";
      });
    });
  }

  unmount(): void {
    this.mounted = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.onResize) {
      window.removeEventListener("resize", this.onResize);
      this.onResize = null;
    }
    const c = this.canvas;
    if (c) {
      c.style.transition = "opacity 0.45s ease";
      c.style.opacity = "0";
      setTimeout(() => {
        if (c.parentNode) c.parentNode.removeChild(c);
      }, 500);
    }
    this.canvas = null;
    this.gl = null;
    this.prog = null;
  }

  setDark(dark: boolean): void {
    this.dark = dark ? 1.0 : 0.0;
  }

  private loop(): void {
    if (!this.mounted) return;
    this.rafId = requestAnimationFrame((now) => {
      this.renderFrame((now - this.startTime) / 1000);
      this.loop();
    });
  }

  private renderFrame(t: number): void {
    const gl = this.gl;
    if (!gl || !this.prog || !this.canvas) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, t);
    gl.uniform1f(this.uDark, this.dark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private resize(): void {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.gl) this.gl.viewport(0, 0, w, h);
  }

  private compile(type: number, src: string): WebGLShader | null {
    const gl = this.gl;
    if (!gl) return null;
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[VMNebula] compile error:", gl.getShaderInfoLog(sh));
    }
    return sh;
  }
}

/** Singleton — mirrors the original `window.VMNebula`. */
export const nebula = new VMNebula();
