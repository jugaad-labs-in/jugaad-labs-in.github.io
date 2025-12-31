(function(){
  const canvas = document.getElementById('kaleidoscope');
  if (!canvas) return;
  if (canvas.dataset.kaleidoscopeInit) return; // already initialized
  canvas.dataset.kaleidoscopeInit = '1';

  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: false });
  } catch(e) { gl = null; }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = Math.max(1, Math.floor(window.innerWidth * DPR));
    const h = Math.max(1, Math.floor(window.innerHeight * DPR));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      if (gl) gl.viewport(0, 0, w, h);
    }
  }

  if (!gl) {
    // Fallback: gentle animated radial cloud-like gradients for non-WebGL environments
    let t = 0;
    function fallbackFrame() {
      t += 0.01;
      const x = 50 + Math.sin(t * 0.6) * 20;
      const y = 50 + Math.cos(t * 0.9) * 18;
      const g1 = `radial-gradient(circle at ${x}% ${y}%, rgba(200,220,240,0.10), rgba(140,170,200,0.06) 30%, transparent 55%)`;
      const g2 = `radial-gradient(circle at ${100-x}% ${100-y}%, rgba(180,200,220,0.06), transparent 35%)`;
      canvas.style.background = `${g1}, ${g2}, var(--bg)`;
      if (!document.hidden) requestAnimationFrame(fallbackFrame);
    }
    resize();
    window.addEventListener('resize', resize);
    if (!document.hidden) requestAnimationFrame(fallbackFrame);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) requestAnimationFrame(fallbackFrame); });
    return;
  }

  // Vertex shader: full-screen quad
  const vsSource = 'attribute vec2 position; varying vec2 vUv; void main(){ vUv = (position+1.0)*0.5; gl_Position = vec4(position,0.0,1.0); }';

  // Fragment shader: procedural "Siri-orb" style metaballs + glow
  const fsSourceHeader = `
    precision mediump float;
    `;

  const fsSourceColorPalletteNight = `
    // color palette tuned to night-sky clouds (deep navy -> slate blue -> pale cloud)
    vec3 palette(float t){
      vec3 c1 = vec3(0.02, 0.06, 0.18); // deep navy (near-black)
      vec3 c2 = vec3(0.14, 0.28, 0.45); // slate/indigo midtones
      vec3 c3 = vec3(0.78, 0.84, 0.9);  // pale cloud (soft desaturated white-blue)
      float m = smoothstep(0.15, 0.85, t);
      return mix(mix(c1, c2, t), c3, m);
    }
    `;

  const fsSourceColorPalletteDay = `
    // color palette tuned to night-sky clouds (deep navy -> slate blue -> pale cloud)
    vec3 palette(float t){
      vec3 c1 = vec3(0.02, 0.06, 0.18); // deep navy (near-black)
      vec3 c2 = vec3(0.14, 0.28, 0.45); // slate/indigo midtones
      vec3 c3 = vec3(0.78, 0.84, 0.9);  // pale cloud (soft desaturated white-blue)
      float m = smoothstep(0.15, 0.85, t);
      return mix(mix(c1, c2, t), c3, m);
    }
    `;

  const fsSourceBase = `
    uniform vec2 resolution;
    uniform float time;
    varying vec2 vUv;

    // lightweight hash / noise
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0,0.0));
      float c = hash(i + vec2(0.0,1.0));
      float d = hash(i + vec2(1.0,1.0));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
    }
    float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }

    // rotate a vec2 by angle
    mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

    // polite epsilon for derivative sampling
    float eps = 0.001;

    void main(){
      vec2 uv = vUv - 0.5;
      uv.x *= resolution.x / resolution.y;
      float t = time * 0.7;

      // sphere in screen space
      float radius = 0.45;
      float r = length(uv);
      if (r > radius + 0.02) {
        // background (keep very dark)
        gl_FragColor = vec4(vec3(0.0), 1.0);
        return;
      }

      // normalized surface position on sphere (x,y,z) where z is positive
      vec2 surf = uv / radius; // in -1..1 range across sphere
      float zsqr = 1.0 - clamp(dot(surf,surf), 0.0, 1.0);
      float z = sqrt(max(0.0, zsqr));
      vec3 pos = vec3(surf * 0.9, z);

      // surface normal perturbation via fbm-based bump (small amplitude)
      vec2 ncoord = surf * 2.2; // scale for noise
      float bump = fbm(ncoord * 2.0 + vec2(t*0.18, -t*0.12)) * 0.18;
      // compute approximate normal by sampling nearby bump heights
      float b = bump;
      float bx = fbm((ncoord + vec2(eps,0.0)) * 2.0 + vec2(t*0.18, -t*0.12)) * 0.18;
      float by = fbm((ncoord + vec2(0.0,eps)) * 2.0 + vec2(t*0.18, -t*0.12)) * 0.18;
      // surface with bump displacement along normal
      vec3 displaced = normalize(vec3(surf + vec2(bx - b, by - b)*0.9, z + b*0.25));

      // lighting: environment-ish directional + rim (fresnel)
      vec3 lightDir = normalize(vec3(-0.4, 0.6, 0.8));
      float diff = clamp(dot(displaced, lightDir), 0.0, 1.0);
      float spec = pow(max(0.0, dot(reflect(-lightDir, displaced), vec3(0.0,0.0,1.0))), 32.0);
      float fres = pow(1.0 - max(0.0, dot(displaced, vec3(0.0,0.0,1.0))), 2.0);

      // internal flow: sample layered fbm along slightly offset coords for volumetric look
      vec2 p = ncoord * 1.6;
      float v1 = fbm(p + vec2(t*0.25, -t*0.15));
      float v2 = fbm(p*2.2 + vec2(-t*0.18, t*0.12));
      float v3 = fbm(p*3.8 + vec2(t*0.32, t*0.2));
      float internal = smoothstep(0.2, 0.9, 0.4*v1 + 0.35*v2 + 0.25*v3 + sin((p.x+p.y)*3.0 + t*1.6)*0.12);

      // color mapping from internal dynamics
      vec3 col = palette(clamp(internal*1.05, 0.0, 1.0));

      // subtle chromatic dispersion on specular
      vec3 specCol = vec3(1.0,0.95,0.85) * spec * 1.6;

      // combine: base internal color + rim/fresnel + specular and diffuse
      vec3 base = col * (0.18 + internal * 1.6);
      vec3 rim = palette(0.9) * fres * 1.2; // bright rim tint
      vec3 final = base + rim + specCol * 1.0 + diff * 0.08;

      // darken toward edges for contrast
      final *= smoothstep(radius, 0.0, r*1.05);

      // tonemap / bloom-like softening
      final = 1.0 - exp(-final);

      gl_FragColor = vec4(final, 1.0);
    }`;

  function createShader(type, source){
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error('Shader compile error', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function createProgram(vs, fs){
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.error('Program link error', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return null;
    }
    return p;
  }

  const vs = createShader(gl.VERTEX_SHADER, vsSource);

  // get current time and use different fsSource if time of day is day or night
  const now = new Date();
  var fsSource = null;
  if (now.getHours() >= 6 && now.getHours() < 18) {
    fsSource = fsSourceHeader + fsSourceColorPalletteDay + fsSourceBase;
  } else {
    fsSource = fsSourceHeader + fsSourceColorPalletteNight + fsSourceBase;
  }

  var fs = createShader(gl.FRAGMENT_SHADER, fsSource);
  const program = createProgram(vs, fs);
  if (!program) return;
  gl.useProgram(program);

  const positionLoc = gl.getAttribLocation(program, 'position');
  const resLoc = gl.getUniformLocation(program, 'resolution');
  const timeLoc = gl.getUniformLocation(program, 'time');

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const vertices = new Float32Array([ -1, -1, 1, -1, -1, 1, 1, 1 ]);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  gl.clearColor(0.0,0.0,0.0,0.0);

  let start = performance.now();
  let rafId = null;

  function frame(){
    if (document.hidden) { rafId = requestAnimationFrame(frame); return; }
    const now = performance.now();
    const t = (now - start) / 1000;
    resize();
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function(){
    if (!document.hidden && !rafId) {
      start = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  });

  resize();
  rafId = requestAnimationFrame(frame);
})();
