// VibeMail Glass — WebGL nebula background
// Mounted when animatedBg = true; unmounted when false.
// "Nebula Drift" — domain-warped cosmic clouds (ported from the Aether shader
// wallpapers), with all mouse / ripple interaction stripped out. Idle drift only.

(function () {
  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){gl_Position=vec4(a_pos,0.0,1.0);}',
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  u_res;',
    'uniform float u_time;',
    'uniform float u_dark;',
    'const float u_intensity = 0.7;', // fixed idle liveliness (was driven by mouse activity)

    // ── noise ─────────────────────────────────────────────
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'vec2 hash22(vec2 p){ return vec2(hash21(p), hash21(p + vec2(19.3, 7.1))); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash21(i);',
    '  float b = hash21(i + vec2(1.0, 0.0));',
    '  float c = hash21(i + vec2(0.0, 1.0));',
    '  float d = hash21(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
    '  for(int i = 0; i < 6; i++){',
    '    v += a * vnoise(p);',
    '    p = m * p;',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    // twinkling star layer
    'vec3 starLayer(vec2 uv, float density, float sz, float thresh){',
    '  vec2 g = uv * density;',
    '  vec2 id = floor(g);',
    '  vec2 f = fract(g) - 0.5;',
    '  float h = hash21(id);',
    '  vec2 off = (hash22(id + 3.0) - 0.5) * 0.7;',
    '  float star = smoothstep(sz, 0.0, length(f - off));',
    '  float tw = 0.55 + 0.45 * sin(u_time * (1.4 + u_intensity * 1.6) + h * 40.0);',
    '  return vec3(star * step(thresh, h) * tw);',
    '}',

    // ── Nebula Drift render (no mouse, no ripples) ────────
    'vec3 render(vec2 uv, float u_aspect, float dark){',
    '  vec2 p = (uv - 0.5) * vec2(u_aspect, 1.0) * 3.0;',
    '  float t = u_time * 0.045 * (0.4 + u_intensity);',
    '  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3)));',
    '  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.15 * t),',
    '                fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.12 * t));',
    '  float f = fbm(p + 4.0 * r);',
    '  float dens = pow(clamp(f, 0.0, 1.0), 3.3);',                  // sharper → mostly void
    '  float warp = clamp(length(r), 0.0, 1.0);',
    '  float fil  = pow(clamp(r.x, 0.0, 1.0), 3.6);',
    '  float core = pow(dens, 4.2);',
    '  if(dark > 0.5){',
    // ── DARK MODE (unchanged) ──
    '    vec3 col = vec3(0.003, 0.010, 0.007);',                       // deep void (green-black)
    '    col += vec3(0.04, 0.30, 0.13) * dens * 1.15;',               // green body
    '    col += vec3(0.10, 0.18, 0.50) * pow(warp, 2.6) * 0.35;',     // faint blue veins for depth
    '    col += vec3(0.26, 0.95, 0.50) * fil * 1.0;',                 // bright lime filaments
    '    col += vec3(0.85, 1.0, 0.90)  * core * 0.55;',               // bright cores
    '    col *= 1.0 - 0.55 * length(uv - 0.5);',                      // vignette
    '    col *= 0.55;',                                               // overall dim -> more void
    '    col += starLayer(uv, 88.0, 0.11, 0.84) * vec3(0.88, 1.0, 0.92) * 2.0;',
    '    col += starLayer(uv, 46.0, 0.08, 0.88) * vec3(0.78, 0.96, 0.84) * 1.5;',
    '    return col;',
    '  }',
    // ── LIGHT MODE: white void, green nebula painted as ink on top ──
    '  vec3 col = vec3(1.0, 1.0, 1.0);',                              // white void
    '  col -= vec3(0.42, 0.08, 0.30) * dens * 1.25;',                 // green body (remove R+B)
    '  col -= vec3(0.20, 0.12, 0.34) * pow(warp, 2.6) * 0.30;',       // faint teal veins
    '  col -= vec3(0.58, 0.06, 0.44) * fil * 0.95;',                  // bright lime filaments
    '  col += vec3(0.06, 0.10, 0.07) * core * 0.40;',                 // cores lift back toward white-green
    '  col *= 1.0 - 0.06 * length(uv - 0.5);',                        // very subtle vignette
    '  col -= starLayer(uv, 88.0, 0.11, 0.84) * vec3(0.30, 0.12, 0.24) * 1.2;',
    '  col -= starLayer(uv, 46.0, 0.08, 0.88) * vec3(0.26, 0.10, 0.21) * 0.9;',
    '  return clamp(col, 0.0, 1.0);',
    '}',

    // ── main ──────────────────────────────────────────────
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  float asp = u_res.x / u_res.y;',
    '  vec3 col = render(uv, asp, u_dark);',
    // same nebula in both themes; light mode is handled purely by the #vm-light-overlay white veil
    // ordered-ish dither to kill banding in the dark gradients
    '  float dither = (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;',
    '  col += dither;',
    '  gl_FragColor = vec4(max(col, 0.0), 1.0);',
    '}',
  ].join('\n');

  // ── renderer ────────────────────────────────────────────────────────────────
  function VMNebula() {
    this.canvas     = null;
    this.gl         = null;
    this.prog       = null;
    this.rafId      = null;
    this.startTime  = 0;
    this.uRes       = null;
    this.uTime      = null;
    this.uDark      = null;
    this._dark      = 1.0;
    this._mounted   = false;
    this._onResize  = null;
  }

  VMNebula.prototype.mount = function () {
    if (this._mounted) return;
    this._mounted = true;

    var c = document.createElement('canvas');
    c.id = 'vm-nebula-canvas';
    c.style.cssText = [
      'position:fixed;inset:0;width:100%;height:100%;',
      'z-index:0;pointer-events:none;',
      'opacity:0;transition:opacity 0.7s ease;',
    ].join('');
    document.body.insertBefore(c, document.body.firstChild);
    this.canvas = c;

    var gl = c.getContext('webgl', { antialias: false, powerPreference: 'low-power', alpha: false });
    if (!gl) { this.unmount(); return; }
    this.gl = gl;

    // compile + link
    var vs   = this._sh(gl.VERTEX_SHADER,   VERT);
    var fs   = this._sh(gl.FRAGMENT_SHADER, FRAG);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[VMNebula] link error:', gl.getProgramInfoLog(prog));
      this.unmount(); return;
    }
    this.prog = prog;
    gl.useProgram(prog);

    // full-screen triangle
    var buf  = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uRes  = gl.getUniformLocation(prog, 'u_res');
    this.uTime = gl.getUniformLocation(prog, 'u_time');
    this.uDark = gl.getUniformLocation(prog, 'u_dark');

    this._resize();
    var self = this;
    this._onResize = function () { self._resize(); };
    window.addEventListener('resize', this._onResize);

    this.startTime = performance.now();
    this._loop();

    // fade in after first frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { if (self.canvas) self.canvas.style.opacity = '1'; });
    });
  };

  VMNebula.prototype.unmount = function () {
    this._mounted = false;
    if (this.rafId)     { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    var c = this.canvas;
    if (c) {
      c.style.transition = 'opacity 0.45s ease';
      c.style.opacity    = '0';
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 500);
    }
    this.canvas = null;
    this.gl     = null;
    this.prog   = null;
  };

  VMNebula.prototype.setDark = function (dark) {
    this._dark = dark ? 1.0 : 0.0;
  };

  VMNebula.prototype._loop = function () {
    var self = this;
    if (!this._mounted) return;
    this.rafId = requestAnimationFrame(function (now) {
      self._render((now - self.startTime) / 1000);
      self._loop();
    });
  };

  VMNebula.prototype._render = function (t) {
    var gl = this.gl;
    if (!gl || !this.prog) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTime, t);
    gl.uniform1f(this.uDark, this._dark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  VMNebula.prototype._resize = function () {
    // render at full native res so the filaments / dark voids stay crisp (matches
    // the original wallpaper); a 0.65 downscale washed out the contrast.
    var dpr   = Math.min(window.devicePixelRatio || 1, 1.5);
    var scale = 1.0;
    var w     = Math.floor(window.innerWidth  * dpr * scale);
    var h     = Math.floor(window.innerHeight * dpr * scale);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this.gl) this.gl.viewport(0, 0, w, h);
  };

  VMNebula.prototype._sh = function (type, src) {
    var gl = this.gl;
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[VMNebula] compile error:', gl.getShaderInfoLog(sh));
    }
    return sh;
  };

  window.VMNebula = new VMNebula();
})();
