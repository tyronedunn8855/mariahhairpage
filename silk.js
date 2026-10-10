/* Mar Latrice Styles: "The Silk Press" strand ribbon.
   A lock of a few hundred procedural hair strands drawn as thin camera-facing
   ribbons. The vertex shader bends every strand from coiled, frizzy texture
   (press = 0) to a sleek, aligned fall (press = 1) as the section scrolls, and
   the fragment shader uses a Kajiya-Kay style anisotropic highlight so the
   shine runs along the hair. The lock turns gently toward the pointer.
   Content never depends on this: the poster image stays until a frame draws. */

const section = document.getElementById("silk");
const stage = section && section.querySelector(".silk-canvas");
const root = document.documentElement;

if (section && stage) boot();

function boot() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = Array.prototype.slice.call(section.querySelectorAll(".silk-steps li"));
  const bar = section.querySelector(".silk-bar i");

  // progress through the tall (sticky) section, 0..1
  function scrollProgress() {
    if (!root.classList.contains("silk-scrub")) return 1;
    const r = section.getBoundingClientRect();
    const run = r.height - window.innerHeight;
    if (run <= 0) return 1;
    return Math.min(1, Math.max(0, -r.top / run));
  }
  // hold the texture a moment, press through the middle, hold the finish
  const pressFrom = (s) => {
    const x = Math.min(1, Math.max(0, (s - 0.12) / 0.7));
    return x * x * (3 - 2 * x);
  };

  function paintSteps(p) {
    const i = p < 0.3 ? 0 : p < 0.72 ? 1 : 2;
    steps.forEach((li, k) => li.classList.toggle("is-on", k === i));
    if (bar) bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
  }
  paintSteps(pressFrom(scrollProgress()));
  if (!reduce) window.addEventListener("scroll", () => paintSteps(pressFrom(scrollProgress())), { passive: true });

  // no WebGL: keep the poster and never download three.js
  if (!hasWebGL()) { fail(); return; }

  let started = false;
  const near = new IntersectionObserver((es) => {
    if (started || !es.some((e) => e.isIntersecting)) return;
    started = true; near.disconnect();
    import("three").then((THREE) => start(THREE, reduce, scrollProgress, pressFrom)).catch(fail);
  }, { rootMargin: "100% 0px 100% 0px" });
  near.observe(section);
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") || c.getContext("webgl");
    if (!g) return false;
    const x = g.getExtension("WEBGL_lose_context");
    if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}

function fail(err) {
  if (err && window.console) console.warn("Silk press 3D skipped:", err.message || err);
  section.classList.remove("silk-on");
  // keep the tall scroll only if it is already in view, so nothing jumps
  const r = section.getBoundingClientRect();
  if (r.top > window.innerHeight || r.bottom < 0) root.classList.remove("silk-scrub");
}

const VERT = /* glsl */ `
  attribute vec4 aStrand;   // u (across), v (depth), r1, r2
  attribute vec2 aRange;    // start / end of this strand along the lock
  attribute float aT;       // 0..1 along the strand
  attribute float aSide;    // -1 / 1 across the ribbon

  uniform float uTime, uPress, uLen, uScale, uPx, uWidth;
  uniform vec2 uPointer;

  varying vec3 vT;
  varying vec3 vView;
  varying vec3 vN;
  varying float vSide, vShade, vTip, vR;

  vec3 lockPos(float t) {
    float press = uPress;
    float frizz = pow(1.0 - press, 1.4);
    float x = (t - 0.5) * uLen;

    // centerline: a soft S that settles as it is pressed
    float sway = sin(uTime * 0.35 + x * 0.6) * 0.05;
    float y = sin(x * 0.42 + 0.9) * mix(0.42, 0.3, press) * uScale + sway * uScale;
    y += uPointer.y * 0.35 * uScale * exp(-pow(x / uLen * 2.0 - uPointer.x, 2.0) * 2.5);
    float z = cos(x * 0.36) * 0.55;

    // the lock is gathered at the root (left) and opens toward the ends
    float open = mix(0.42, 1.0, smoothstep(0.0, 0.55, t));
    float W = mix(0.74, 0.44, press) * uScale * open;
    float D = mix(0.40, 0.13, press) * uScale * open;
    float a = sin(x * 0.3 + 1.2) * 0.75;
    float ca = cos(a), sa = sin(a);
    float u = aStrand.x, v = aStrand.y;
    float oy = u * W * ca - v * D * sa;
    float oz = u * W * sa + v * D * ca;

    // natural texture: each strand coils at its own rate, more toward the ends
    float r1 = aStrand.z, r2 = aStrand.w;
    float coil = 0.07 * uScale * (0.55 + 0.6 * r1) * (0.35 + 0.65 * t) * frizz;
    float th = x * (4.2 + 3.0 * r2) + r1 * 6.2831 + uTime * 0.25;
    oy += coil * cos(th);
    oz += coil * sin(th);
    // a breath of individual movement even when pressed, so strands never sit in perfect rows
    oy += 0.006 * uScale * sin(x * (1.3 + r2) + r1 * 20.0 + uTime * 0.4);
    // fine frizz
    oy += 0.016 * uScale * sin(x * (7.0 + 4.0 * r1) + r2 * 40.0) * frizz * t;
    // flyaways: a few strands lift away from the lock until pressed
    float fly = step(0.9, r2) * (r1 - 0.5) * 2.0;
    oy += fly * t * t * 0.9 * uScale * frizz;
    oz += fly * t * 0.4 * uScale * frizz;

    return vec3(x, y + oy, z + oz);
  }

  void main() {
    float t = mix(aRange.x, aRange.y, aT);
    vec3 p0 = lockPos(t);
    vec3 p1 = lockPos(t + 0.002);
    vec4 mv0 = modelViewMatrix * vec4(p0, 1.0);
    vec4 mv1 = modelViewMatrix * vec4(p1, 1.0);
    vec3 T = normalize(mv1.xyz - mv0.xyz);
    vec3 V = normalize(-mv0.xyz);
    vec3 S = normalize(cross(T, V));

    // never thinner than ~1.3 device px, so strands stay crisp, not aliased
    float taper = 1.0 - 0.75 * smoothstep(0.82, 1.0, aT);
    float w = max(uWidth * taper, uPx * -mv0.z);
    mv0.xyz += S * aSide * w;

    vT = T;
    vN = normalize(cross(S, T));
    vView = V;
    vSide = aSide;
    vTip = aT;
    vR = aStrand.z;
    // strands at the back of the lock sit in shadow
    vShade = mix(0.45, 1.0, smoothstep(-1.0, 1.0, aStrand.y * (1.0 - 0.5 * uPress) + aStrand.x * 0.25));
    gl_Position = projectionMatrix * mv0;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uPress;
  uniform vec3 uKey, uFill;
  varying vec3 vT;
  varying vec3 vView;
  varying vec3 vN;
  varying float vSide, vShade, vTip, vR;

  // Kajiya-Kay strand highlight with a shifted tangent (Scheuermann style)
  float kk(vec3 T, vec3 N, float shift, vec3 H, float e) {
    vec3 Ts = normalize(T + N * shift);
    float th = dot(Ts, H);
    return pow(sqrt(max(0.0, 1.0 - th * th)), e);
  }

  void main() {
    vec3 T = normalize(vT);
    vec3 N = normalize(vN);
    vec3 V = normalize(vView);
    vec3 L = normalize(uKey);
    vec3 F = normalize(uFill);

    // espresso base with strand-to-strand variation
    vec3 base = vec3(0.070, 0.046, 0.036) * (0.7 + 0.6 * vR);
    float diff = 0.4 + 0.6 * sqrt(max(0.0, 1.0 - pow(dot(T, L), 2.0)));

    float gloss = mix(0.35, 1.0, uPress);
    float jitter = (vR - 0.5) * 0.06;
    vec3 H = normalize(L + V);
    vec3 H2 = normalize(F + V);
    // primary: near white and tight; secondary: warm, broader, shifted toward the root
    float s1 = kk(T, N, -0.06 + jitter, H, mix(50.0, 150.0, uPress)) * 0.9 * gloss;
    float s2 = kk(T, N, 0.14 + jitter, H, mix(12.0, 34.0, uPress)) * mix(0.22, 0.42, uPress);
    float s3 = kk(T, N, 0.0, H2, 24.0) * mix(0.04, 0.10, uPress);

    vec3 col = base * diff;
    col += vec3(1.0, 0.92, 0.80) * s1;
    col += vec3(0.72, 0.45, 0.25) * s2;
    col += vec3(0.95, 0.86, 0.74) * s3;
    col *= vShade;

    float edge = 1.0 - smoothstep(0.25, 1.0, abs(vSide));
    float tip = 1.0 - smoothstep(0.88, 1.0, vTip);
    gl_FragColor = vec4(col, edge * tip);
  }
`;

function start(THREE, reduce, scrollProgress, pressFrom) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
  } catch (e) { fail(e); return; }

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "silk-gl";
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 9);

  // ---- geometry: N strands x SEG segments, two vertices per step ----
  const N = mobile ? 260 : 440;
  const SEG = mobile ? 150 : 210;
  const vPer = (SEG + 1) * 2;
  const aStrand = new Float32Array(N * vPer * 4);
  const aRange = new Float32Array(N * vPer * 2);
  const aT = new Float32Array(N * vPer);
  const aSide = new Float32Array(N * vPer);
  const pos = new Float32Array(N * vPer * 3);
  const idx = new Uint32Array(N * SEG * 6);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let k = 0, ii = 0;
  for (let s = 0; s < N; s++) {
    // even-ish spread over an ellipse
    const ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd());
    const u = Math.cos(ang) * rad, v = Math.sin(ang) * rad;
    const r1 = rnd(), r2 = rnd();
    const t0 = rnd() * 0.04, t1 = 0.84 + rnd() * 0.16;
    for (let j = 0; j <= SEG; j++) {
      for (let side = -1; side <= 1; side += 2) {
        aStrand.set([u, v, r1, r2], k * 4);
        aRange.set([t0, t1], k * 2);
        aT[k] = j / SEG;
        aSide[k] = side;
        k++;
      }
      if (j < SEG) {
        const b = s * vPer + j * 2;
        idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], ii);
        ii += 6;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aStrand", new THREE.BufferAttribute(aStrand, 4));
  geo.setAttribute("aRange", new THREE.BufferAttribute(aRange, 2));
  geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
  geo.setAttribute("aSide", new THREE.BufferAttribute(aSide, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

  const uniforms = {
    uTime: { value: 0 },
    uPress: { value: reduce ? 1 : pressFrom(scrollProgress()) },
    uLen: { value: 12 },
    uScale: { value: 1 },
    uPx: { value: 0.001 },
    uWidth: { value: 0.0045 },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uKey: { value: new THREE.Vector3(0.35, 0.85, 0.6) },
    uFill: { value: new THREE.Vector3(-0.7, -0.3, 0.5) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
  });
  const lock = new THREE.Mesh(geo, mat);
  lock.frustumCulled = false;
  const pivot = new THREE.Group();
  pivot.add(lock);
  scene.add(pivot);

  let first = true;
  let running = false, visible = false, raf = 0, last = performance.now();

  // ---- sizing ----
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow frames: bring the camera in and tilt the lock so it still reads as a moment
    camera.position.z = 9 * Math.min(1, Math.max(0.58, camera.aspect / 2.2));
    lock.rotation.z = camera.aspect < 1.7 ? 0.2 : 0;
    camera.updateProjectionMatrix();
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visW = visH * camera.aspect;
    // the root starts past the left edge, the tips finish inside the frame
    uniforms.uLen.value = visW * 1.0;
    lock.position.x = -visW * (camera.aspect < 1.7 ? 0.0 : 0.04);
    uniforms.uScale.value = Math.min(1.15, Math.max(0.55, visW / 13, visH / 5.2));
    uniforms.uPx.value = (visH / camera.position.z) / (h * renderer.getPixelRatio()) * 1.0;
    if (reduce) draw();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- pointer (look-at) ----
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  if (!reduce) {
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const r = stage.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, -(((e.clientY - r.top) / r.height) * 2 - 1)));
    }, { passive: true });
  }

  function draw() {
    renderer.render(scene, camera);
    if (first) { first = false; section.classList.add("silk-on"); }
  }

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); running = false; section.classList.remove("silk-on"); }, false);

  if (reduce) { uniforms.uPress.value = 1; draw(); return; }

  // ---- loop: only while on screen and the tab is visible ----
  let press = uniforms.uPress.value;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    uniforms.uTime.value += dt;
    const goal = pressFrom(scrollProgress());
    press += (goal - press) * Math.min(1, dt * 6);
    uniforms.uPress.value = press;
    const ease = Math.min(1, dt * 3);
    cur.x += (target.x - cur.x) * ease;
    cur.y += (target.y - cur.y) * ease;
    uniforms.uPointer.value.set(cur.x, cur.y);
    pivot.rotation.y = cur.x * 0.32 + Math.sin(uniforms.uTime.value * 0.2) * 0.04;
    pivot.rotation.x = -cur.y * 0.16;
    pivot.rotation.z = cur.y * 0.03;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function setRun() {
    const want = visible && !document.hidden;
    if (want && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; cancelAnimationFrame(raf); }
  }
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; setRun(); }, { rootMargin: "80px 0px" }).observe(stage);
  document.addEventListener("visibilitychange", setRun);
  draw();
}
