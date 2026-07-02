const APP_VERSION = '20260702-white-balance-glass-v20'
const DMS_ROOT = 'assets/dms/'
const INTERACTION_LIFETIME = 2.7
const MAX_ACTIVE_INTERACTIONS = 3
const XR_STRETCH_X = 0.64
const XR_STRETCH_Y = 1.72
const DEFAULT_PHYSICAL_HEIGHT = 1.86
const DEFAULT_PANEL_SPACING = 0.48
const DEFAULT_PANEL_LIMIT = 1
const DEFAULT_ENABLE_GPU_MOTION = true
const DEFAULT_LAYOUT_SCALE = 1
const STRESS_DECAY_PER_SECOND = 0.06
const BREAK_THRESHOLD = 3.35
const BREAK_DELAY_SECONDS = 0.38
const BREAK_FALL_SECONDS = 1.9
const BREAK_HOLD_SECONDS = 1.1
const BREAK_RECOVER_SECONDS = 1.65
const BREAK_TOTAL_SECONDS = BREAK_FALL_SECONDS + BREAK_HOLD_SECONDS + BREAK_RECOVER_SECONDS
const BUTTON_RANDOM_MIN = 1.16
const BUTTON_RANDOM_MAX = 1.46
const STRONG_BUTTON_RANDOM_MIN = 1.55
const STRONG_BUTTON_RANDOM_MAX = 1.84
const CHOICE_POLARITY_MEMORY = 0.9
const CHOICE_POLARITY_STEP = 0.1
const CHOICE_POINTER_BIAS = 0.025
const CHOICE_FINAL_STEP = 0.018
const CHOICE_BUTTON_COOLDOWN_MS = 2000
const AUTO_PLACEMENT_FALLBACK_MS = 2600
const ROOM_ANCHOR_REFINE_UPDATES = 8

const QUALITY_PROFILES = {
  high: {
    name: 'high',
    fbmSteps: 6,
    cellCount: 16,
    liquidTargetHeight: 1280,
    liquidFps: 60,
    colorBoost: 0.18,
    alphaBoost: 1.06,
  },
  balanced: {
    name: 'balanced',
    fbmSteps: 4,
    cellCount: 12,
    liquidTargetHeight: 1024,
    liquidFps: 45,
    colorBoost: 0.35,
    alphaBoost: 1.18,
  },
  low: {
    name: 'low',
    fbmSteps: 3,
    cellCount: 8,
    liquidTargetHeight: 768,
    liquidFps: 30,
    colorBoost: 0.35,
    alphaBoost: 1.18,
  },
}

const DMS_GPU_MOTION_GLSL = `
  attribute vec2 dmsCenter;
  attribute float dmsSeed;
  attribute float dmsPanel;

  uniform float uDmsMotionEnabled;
  uniform float uDmsTime;
  uniform vec4 uDmsHit0;
  uniform vec4 uDmsHit1;
  uniform vec4 uDmsHit2;
  uniform vec4 uDmsHitPanels;
  uniform vec4 uDmsShapeBounds;
  uniform float uDmsShapePolarity;
  uniform float uDmsShapeFinal;
  uniform float uDmsMotionMix;
  uniform float uDmsIdleRotationEnabled;
  uniform float uDmsIdleRotationStrength;
  uniform float uDmsShockAfterglow;

  float dmsPanelMask(float hitPanel) {
    return 1.0 - step(0.5, abs(hitPanel - dmsPanel));
  }

  void dmsAccumulateHit(
    vec4 hit,
    float hitPanel,
    float phase,
    inout float globalWave,
    inout float localKick,
    inout float localSlide,
    inout float localSpin,
    inout vec2 planarImpulse
  ) {
    float age = hit.w;
    float dmsHitActive = uDmsMotionEnabled *
      step(0.0, age) *
      step(age, 2.7) *
      step(0.001, hit.z) *
      dmsPanelMask(hitPanel);
    if (dmsHitActive <= 0.0) return;

    vec2 delta = dmsCenter - hit.xy;
    float distSq = dot(delta, delta);
    float dist = sqrt(distSq);
    vec2 impactDir = dist > 0.001 ? delta / dist : vec2(cos(phase), sin(phase));
    float spatialFalloff = 1.0 / (1.0 + dist * 2.3 + distSq * 1.35);

    float waveAge = age - dist * 0.040;
    if (waveAge > 0.0) {
      float timeFalloff = max(0.0, 1.0 - waveAge * 0.52);
      globalWave += sin(waveAge * 10.8 - dist * 4.4) *
        timeFalloff * timeFalloff *
        spatialFalloff *
        hit.z *
        dmsHitActive;
      planarImpulse += impactDir *
        sin(waveAge * 12.6 - dist * 5.8) *
        timeFalloff * timeFalloff *
        spatialFalloff *
        hit.z *
        dmsHitActive;
    }

    float afterAge = age - dist * 0.052;
    if (afterAge > 0.0) {
      float afterFalloff = exp(-afterAge * 1.34) * (1.0 - smoothstep(0.12, 2.45, afterAge));
      float afterWave = sin(afterAge * 5.4 + phase * 0.38 - dist * 2.2) *
        afterFalloff *
        spatialFalloff *
        hit.z *
        dmsHitActive *
        uDmsShockAfterglow;
      globalWave += afterWave * 0.38;
      localKick += afterWave * 0.26;
      localSpin += afterWave * 0.20;
      planarImpulse += impactDir * afterWave * 0.30;
    }

    float localAge = age - dist * 0.030;
    if (localAge > 0.0) {
      float localTime = max(0.0, 1.0 - localAge * 1.05);
      float falloff = localTime * localTime * spatialFalloff * hit.z * dmsHitActive;
      localKick += sin(localAge * 18.0 + phase) * falloff;
      localSlide += sin(localAge * 15.5 + phase * 0.73) * falloff;
      localSpin += cos(localAge * 16.5 + phase * 1.31) * falloff;
      planarImpulse += impactDir * sin(localAge * 20.0 + phase * 0.6) * falloff * 0.78;

      float instant = cos(age * 34.0 + dmsSeed * 7.0) *
        max(0.0, 1.0 - age * 0.90) *
        max(0.0, 1.0 - age * 0.90) *
        hit.z *
        spatialFalloff *
        dmsHitActive;
      globalWave += instant * 0.62;
      localKick += instant * 0.52;
      localSpin += instant * 0.34;
      planarImpulse += impactDir * instant * 0.54;
    }
  }

  vec2 dmsRotate2(vec2 value, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(value.x * c - value.y * s, value.x * s + value.y * c);
  }

  vec3 dmsApplyMotion(vec3 basePosition) {
    if (uDmsMotionEnabled <= 0.0) return basePosition;

    float phase = dmsSeed * 6.28318530718;
    float globalWave = 0.0;
    float localKick = 0.0;
    float localSlide = 0.0;
    float localSpin = 0.0;
    vec2 planarImpulse = vec2(0.0);
    dmsAccumulateHit(uDmsHit0, uDmsHitPanels.x, phase, globalWave, localKick, localSlide, localSpin, planarImpulse);
    dmsAccumulateHit(uDmsHit1, uDmsHitPanels.y, phase, globalWave, localKick, localSlide, localSpin, planarImpulse);
    dmsAccumulateHit(uDmsHit2, uDmsHitPanels.z, phase, globalWave, localKick, localSlide, localSpin, planarImpulse);

    float coherentBreath = sin(uDmsTime * 0.46) * 0.006 + sin(uDmsTime * 0.18 + 1.8) * 0.003;
    float idle = sin(uDmsTime * 0.88 + dmsSeed * 24.0) * 0.003 +
      sin(uDmsTime * 1.37 + dmsSeed * 11.0) * 0.0014;
    float normalOffset = globalWave * 0.088 + localKick * 0.052 + coherentBreath + idle;
    vec2 tangent = vec2(cos(phase), sin(phase));
    vec2 boundsSize = max(uDmsShapeBounds.xy, vec2(0.001));
    vec2 boundsCenter = uDmsShapeBounds.zw;
    vec2 shapeFromCenter = dmsCenter - boundsCenter;
    vec2 normalizedCenter = vec2(
      shapeFromCenter.x / max(boundsSize.x * 0.5, 0.001),
      shapeFromCenter.y / max(boundsSize.y * 0.5, 0.001)
    );
    float radial = clamp(length(normalizedCenter), 0.0, 1.35);
    vec2 outward = radial > 0.001 ? normalize(shapeFromCenter) : tangent;
    float shapePolarity = clamp(uDmsShapePolarity, -1.0, 1.0);
    float shapeFinal = clamp(uDmsShapeFinal, 0.0, 1.0);
    float blueShape = smoothstep(0.14, 0.86, shapePolarity);
    float orangeShape = smoothstep(0.14, 0.86, -shapePolarity);
    float neutralShape = 1.0 - max(blueShape, orangeShape);
    float outerBand = smoothstep(0.34, 0.92, radial);
    float centralBand = 1.0 - smoothstep(0.16, 0.46, radial);
    vec2 ambientDrift = (
      tangent * sin(uDmsTime * 0.72 + phase * 1.30) +
      outward * cos(uDmsTime * 0.48 + phase * 0.92)
    ) * (0.014 + 0.004 * sin(phase * 2.1));
    vec2 neutralScatter = (outward * (0.72 + 0.42 * sin(phase * 1.7)) + tangent * (0.58 + 0.34 * cos(phase))) *
      neutralShape *
      (0.006 + 0.004 * (1.0 - shapeFinal));
    vec2 blueGatherRaw = -shapeFromCenter * blueShape * (0.020 + 0.025 * shapeFinal);
    float blueGatherLimit = 0.068 + 0.022 * shapeFinal;
    vec2 blueGather = blueGatherRaw * min(1.0, blueGatherLimit / max(length(blueGatherRaw), 0.001));
    vec2 orangeField = (
      outward * (0.110 + 0.155 * shapeFinal) * outerBand -
      shapeFromCenter * (0.030 + 0.044 * shapeFinal) * centralBand +
      tangent * 0.044 * orangeShape * outerBand * (0.4 + 0.6 * shapeFinal)
    ) * orangeShape;
    float orderedPhase = normalizedCenter.x * 1.32 + normalizedCenter.y * 0.86 + dmsPanel * 0.47;
    float orderedWave = sin(uDmsTime * 0.58 + orderedPhase) +
      sin(uDmsTime * 0.31 + orderedPhase * 1.7 + 1.1) * 0.42;
    float orderedBreath = uDmsIdleRotationEnabled *
      clamp(uDmsIdleRotationStrength, 0.0, 2.0) *
      orderedWave;
    float softSeed = sin(dmsSeed * 19.0) * 0.18;

    vec3 moved = basePosition;
    float rx = globalWave * 0.060 + localSpin * 0.155 + coherentBreath * 0.18 +
      orderedBreath * (0.006 + softSeed * 0.0018);
    float ry = globalWave * 0.034 + localSpin * 0.075 +
      orderedBreath * (0.0048 - softSeed * 0.0015);
    float rz = localSpin * 0.040 +
      orderedBreath * 0.0032;

    moved.yz = dmsRotate2(moved.yz, rx);
    moved.xz = dmsRotate2(moved.xz, ry);
    moved.xy = dmsRotate2(moved.xy, rz);
    moved.xy += ambientDrift + neutralScatter + blueGather + orangeField;
    moved.xy += tangent * localSlide * 0.032 + planarImpulse * 0.040;
    moved.z += normalOffset;
    return mix(basePosition, moved, clamp(uDmsMotionMix, 0.0, 1.0));
  }
`

const DMS_LIQUID_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DMS_LIQUID_GPU_VERTEX_SHADER = `
  varying vec2 vUv;
  ${DMS_GPU_MOTION_GLSL}

  void main() {
    vUv = uv;
    vec3 transformed = dmsApplyMotion(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`

const DMS_LIQUID_TEXTURE_GPU_VERTEX_SHADER = `
  varying vec2 vUv;
  ${DMS_GPU_MOTION_GLSL}

  void main() {
    vUv = uv;
    vec3 localPosition = vec3(position.xy - dmsCenter, position.z);
    vec3 transformed = dmsApplyMotion(localPosition);
    transformed.xy += dmsCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`

const DMS_LIQUID_TEXTURE_FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D uLiquidTexture;
  uniform float uTextureOpacity;
  uniform float uTextureExposure;
  uniform float uTextureHighlightLimit;

  void main() {
    vec4 texel = texture2D(uLiquidTexture, vUv);
    vec3 color = clamp(texel.rgb * uTextureExposure, 0.0, 1.0);
    color = mix(color, sqrt(max(color, vec3(0.0))), 0.08);
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    float highlight = smoothstep(uTextureHighlightLimit * 0.82, 1.0, luma);
    float compressedLuma = mix(
      luma,
      uTextureHighlightLimit + max(luma - uTextureHighlightLimit, 0.0) * 0.14,
      highlight
    );
    color *= compressedLuma / max(luma, 0.001);
    float chroma = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
    float whiteFilm = smoothstep(0.76, 0.96, luma) * (1.0 - smoothstep(0.045, 0.20, chroma));
    float alpha = texel.a * uTextureOpacity * mix(1.0, 0.58, whiteFilm);
    gl_FragColor = vec4(color, alpha);
  }
`

const DMS_SOLID_GPU_VERTEX_SHADER = `
  ${DMS_GPU_MOTION_GLSL}

  void main() {
    vec3 localPosition = vec3(position.xy - dmsCenter, position.z);
    vec3 transformed = dmsApplyMotion(localPosition);
    transformed.xy += dmsCenter;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`

const DMS_SOLID_VERTEX_SHADER = `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DMS_SOLID_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`

const DMS_LIQUID_FRAGMENT_SHADER = `
  precision highp float;

  #ifndef DMS_FBM_STEPS
  #define DMS_FBM_STEPS 6
  #endif

  #ifndef DMS_CELL_COUNT
  #define DMS_CELL_COUNT 16
  #endif

  varying vec2 vUv;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uFinal;
  uniform float uPolarity;
  uniform float uPulse;
  uniform float uRipple;
  uniform vec2 uPointer;
  uniform float uTargetReady;
  uniform float uAuthorityTargetReady;
  uniform float uMaterialOpacity;
  uniform float uColorBoost;
  uniform float uAlphaBoost;
  uniform sampler2D uTarget;
  uniform sampler2D uAuthorityTarget;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    mat2 m = mat2(1.62, 1.18, -1.18, 1.62);
    for (int i = 0; i < DMS_FBM_STEPS; i++) {
      value += amp * noise(p);
      p = m * p + 0.17;
      amp *= 0.52;
    }
    return value;
  }

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  vec2 swirl(vec2 p, vec2 center, float strength, float radius) {
    vec2 d = p - center;
    float falloff = exp(-dot(d, d) / radius);
    return center + rot(strength * falloff) * d;
  }

  vec3 palette(float x) {
    vec3 paper = vec3(0.955, 0.985, 1.0);
    vec3 ice = vec3(0.70, 0.90, 1.0);
    vec3 cyan = vec3(0.00, 0.58, 1.0);
    vec3 cobalt = vec3(0.00, 0.21, 1.0);
    vec3 ultramarine = vec3(0.00, 0.06, 0.66);
    vec3 col = mix(paper, ice, smoothstep(0.08, 0.34, x));
    col = mix(col, cyan, smoothstep(0.24, 0.50, x) * 0.82);
    col = mix(col, cobalt, smoothstep(0.45, 0.78, x));
    col = mix(col, ultramarine, smoothstep(0.72, 0.96, x) * 0.78);
    return col;
  }

  vec3 orangePalette(float x) {
    vec3 paper = vec3(1.0, 0.982, 0.94);
    vec3 amber = vec3(1.0, 0.68, 0.10);
    vec3 orange = vec3(1.0, 0.28, 0.00);
    vec3 vermilion = vec3(0.92, 0.06, 0.00);
    vec3 umber = vec3(0.50, 0.04, 0.00);
    vec3 col = mix(paper, amber, smoothstep(0.06, 0.32, x));
    col = mix(col, orange, smoothstep(0.24, 0.56, x) * 0.92);
    col = mix(col, vermilion, smoothstep(0.48, 0.82, x));
    col = mix(col, umber, smoothstep(0.74, 0.98, x) * 0.64);
    return col;
  }

  vec3 pigmentBoost(vec3 value, float saturation, float contrast) {
    float luma = dot(value, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luma), value, saturation);
    return clamp((saturated - 0.5) * contrast + 0.5, 0.0, 1.0);
  }

  float boxMask(vec2 uv, vec2 center, vec2 halfSize, float feather) {
    vec2 d = abs(uv - center) - halfSize;
    float outside = max(d.x, d.y);
    return smoothstep(feather, -feather, outside);
  }

  float ellipseMask(vec2 uv, vec2 center, vec2 radius, float feather) {
    vec2 d = (uv - center) / max(radius, vec2(0.001));
    float edge = dot(d, d);
    return smoothstep(1.0 + feather, 1.0 - feather, edge);
  }

  float lineMask(vec2 uv, vec2 a, vec2 b, float width, float feather) {
    vec2 pa = uv - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    float d = length(pa - ba * h);
    return smoothstep(width + feather, width - feather, d);
  }

  float authorityTarget(vec2 uv) {
    vec2 p = uv;
    float spine = boxMask(p, vec2(0.50, 0.57), vec2(0.040, 0.365), 0.010);
    float core = boxMask(p, vec2(0.50, 0.52), vec2(0.105, 0.290), 0.016);
    float outerLeft = lineMask(p, vec2(0.31, 0.23), vec2(0.43, 0.86), 0.018, 0.010);
    float outerRight = lineMask(p, vec2(0.69, 0.23), vec2(0.57, 0.86), 0.018, 0.010);
    float upperClamp = boxMask(p, vec2(0.50, 0.82), vec2(0.210, 0.034), 0.012);
    float lowerClamp = boxMask(p, vec2(0.50, 0.25), vec2(0.275, 0.042), 0.014);
    float seal = ellipseMask(p, vec2(0.50, 0.62), vec2(0.155, 0.082), 0.12);
    float eye = ellipseMask(p, vec2(0.50, 0.68), vec2(0.090, 0.026), 0.18);
    float gate = boxMask(p, vec2(0.50, 0.42), vec2(0.175, 0.152), 0.016);
    float columns = 0.0;
    for (int i = 0; i < 6; i++) {
      float x = 0.28 + float(i) * 0.088;
      columns = max(columns, boxMask(p, vec2(x, 0.43), vec2(0.014, 0.205), 0.008));
    }
    float steps = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float y = 0.120 + fi * 0.034;
      float w = 0.100 + fi * 0.037;
      steps = max(steps, boxMask(p, vec2(0.50, y), vec2(w, 0.007), 0.005));
    }
    float ranks = 0.0;
    for (int i = 0; i < 5; i++) {
      float y = 0.18 + float(i) * 0.053;
      ranks = max(ranks, boxMask(p, vec2(0.18, y), vec2(0.040, 0.010), 0.006));
      ranks = max(ranks, boxMask(p, vec2(0.82, y), vec2(0.040, 0.010), 0.006));
    }
    float rays = 0.0;
    for (int i = 0; i < 5; i++) {
      float a = -0.42 + float(i) * 0.21;
      rays = max(rays, lineMask(p, vec2(0.50, 0.79), vec2(0.50 + a, 0.25), 0.006, 0.006));
    }
    float axis = smoothstep(0.032, 0.0, abs(p.x - 0.5)) * smoothstep(0.10, 0.88, p.y);
    float rigid = clamp(
      spine * 0.94 +
      core * 0.42 +
      (outerLeft + outerRight) * 0.82 +
      upperClamp * 0.90 +
      lowerClamp * 0.84 +
      gate * 0.38 +
      columns * 0.72 +
      steps * 0.78 +
      ranks * 0.56 +
      rays * 0.34 +
      axis * 0.42 +
      seal * 0.30 -
      eye * 0.16,
      0.0,
      1.0
    );
    return rigid;
  }

  float authorityImageTarget(vec2 uv) {
    vec3 ref = texture2D(uAuthorityTarget, clamp(uv, 0.0, 1.0)).rgb;
    float luma = dot(ref, vec3(0.299, 0.587, 0.114));
    float warm = max(0.0, ref.r - max(ref.g * 0.72, ref.b * 1.45));
    float orangeInk = smoothstep(0.03, 0.50, warm);
    float paperContrast = smoothstep(0.10, 0.76, 1.0 - luma);
    float density = smoothstep(0.10, 0.84, paperContrast * 0.50 + orangeInk * 0.82);
    return density * uAuthorityTargetReady;
  }

  float authoritySource(vec2 uv) {
    return mix(authorityTarget(uv), authorityImageTarget(uv), uAuthorityTargetReady);
  }

  float cellRing(vec2 uv, vec2 c, float r, float aspect) {
    vec2 d = uv - c;
    d.x *= aspect;
    float dist = length(d);
    float outer = smoothstep(r + 0.012, r - 0.006, dist);
    float inner = smoothstep(r * 0.72, r * 0.48, dist);
    return clamp(outer - inner, 0.0, 1.0);
  }

  float cellFill(vec2 uv, vec2 c, float r, float aspect) {
    vec2 d = uv - c;
    d.x *= aspect;
    float dist = length(d);
    return smoothstep(r * 0.7, 0.0, dist);
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    float t = uTime * 0.115;
    float finalAmount = smoothstep(0.08, 1.0, uFinal);
    float polarity = clamp(uPolarity, -1.0, 1.0);
    float blueControl = smoothstep(-1.0, 1.0, polarity);
    float orangeControl = 1.0 - blueControl;
    float blueDominance = smoothstep(0.28, 0.95, polarity);
    float orangeDominance = smoothstep(0.28, 0.95, -polarity);
    float blueFinal = finalAmount * blueDominance * uTargetReady;
    float orangeFinal = finalAmount * orangeDominance;
    float blueWeight = 0.26 + 0.74 * blueControl;
    float orangeWeight = 0.26 + 0.74 * orangeControl;
    vec2 texel = 1.0 / max(uResolution, vec2(1.0));
    vec2 targetDrift = blueFinal * 0.018 * vec2(
      fbm(uv * 3.2 + vec2(t * 1.7, -t * 1.1)),
      fbm(uv * 3.0 + vec2(-t * 1.2, t * 1.6) + 5.0)
    );
    vec2 refUv = clamp(uv + targetDrift - blueFinal * 0.009, 0.0, 1.0);
    vec2 authorityDrift = orangeFinal * 0.014 * vec2(
      fbm(uv * 2.8 + vec2(-t * 1.4, t * 1.2) + 9.0),
      fbm(uv * 2.6 + vec2(t * 1.1, -t * 1.5) + 13.0)
    );
    vec2 authorityUv = clamp(uv + authorityDrift - orangeFinal * 0.006, 0.0, 1.0);
    vec3 ref = texture2D(uTarget, refUv).rgb;
    float refLuma = dot(ref, vec3(0.299, 0.587, 0.114));
    float refInk = (1.0 - refLuma) * uTargetReady;
    vec2 softStep = texel * vec2(24.0, 24.0);
    vec3 refSoft = (
      ref
      + texture2D(uTarget, clamp(refUv + vec2(softStep.x, 0.0), 0.0, 1.0)).rgb
      + texture2D(uTarget, clamp(refUv - vec2(softStep.x, 0.0), 0.0, 1.0)).rgb
      + texture2D(uTarget, clamp(refUv + vec2(0.0, softStep.y), 0.0, 1.0)).rgb
      + texture2D(uTarget, clamp(refUv - vec2(0.0, softStep.y), 0.0, 1.0)).rgb
    ) * 0.2;
    float softInk = (1.0 - dot(refSoft, vec3(0.299, 0.587, 0.114))) * uTargetReady;
    float detailInk = refInk;
    float refL = dot(texture2D(uTarget, clamp(refUv - vec2(texel.x * 2.6, 0.0), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    float refR = dot(texture2D(uTarget, clamp(refUv + vec2(texel.x * 2.6, 0.0), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    float refD = dot(texture2D(uTarget, clamp(refUv - vec2(0.0, texel.y * 2.6), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    float refU = dot(texture2D(uTarget, clamp(refUv + vec2(0.0, texel.y * 2.6), 0.0, 1.0)).rgb, vec3(0.299, 0.587, 0.114));
    vec2 refGradient = vec2(refL - refR, refD - refU) * uTargetReady;
    float refEdge = smoothstep(0.024, 0.16, length(refGradient));
    float authorityInk = authoritySource(authorityUv);
    float authoritySoft = (
      authorityInk
      + authoritySource(clamp(authorityUv + vec2(texel.x * 18.0, 0.0), 0.0, 1.0))
      + authoritySource(clamp(authorityUv - vec2(texel.x * 18.0, 0.0), 0.0, 1.0))
      + authoritySource(clamp(authorityUv + vec2(0.0, texel.y * 18.0), 0.0, 1.0))
      + authoritySource(clamp(authorityUv - vec2(0.0, texel.y * 18.0), 0.0, 1.0))
    ) * 0.2;
    float authorityL = authoritySource(clamp(authorityUv - vec2(texel.x * 2.6, 0.0), 0.0, 1.0));
    float authorityR = authoritySource(clamp(authorityUv + vec2(texel.x * 2.6, 0.0), 0.0, 1.0));
    float authorityD = authoritySource(clamp(authorityUv - vec2(0.0, texel.y * 2.6), 0.0, 1.0));
    float authorityU = authoritySource(clamp(authorityUv + vec2(0.0, texel.y * 2.6), 0.0, 1.0));
    vec2 authorityGradient = vec2(authorityL - authorityR, authorityD - authorityU);
    float authorityEdge = smoothstep(0.024, 0.16, length(authorityGradient));

    vec2 p = uv - 0.5;
    p.x *= aspect;
    float choice = (blueDominance - orangeDominance) * 0.28;
    float attraction = smoothstep(0.02, 0.92, uFinal);
    float blueAttraction = attraction * blueDominance * uTargetReady;
    float orangeAttraction = attraction * orangeDominance;
    vec2 pull = vec2(refGradient.x * 0.82, refGradient.y * 0.56);
    p += blueAttraction * pull;
    p += orangeAttraction * vec2(authorityGradient.x * 0.66, authorityGradient.y * 0.58);
    p += (blueAttraction * (softInk - 0.24) - orangeAttraction * (authoritySoft - 0.32)) * vec2(0.045 * sin(t * 2.2), 0.035 * cos(t * 1.8));

    vec2 pointerP = uPointer - 0.5;
    pointerP.x *= aspect;
    vec2 pointerDelta = p - pointerP;
    float pointerDist = length(pointerDelta);
    vec2 pointerDir = pointerDist > 0.001 ? pointerDelta / pointerDist : vec2(0.0, 1.0);
    float pointerFalloff = exp(-dot(pointerDelta, pointerDelta) / 0.052);
    float liquidShock = sin(pointerDist * 34.0 - uTime * 8.2 + uPulse * 1.6) *
      exp(-pointerDist * 5.6) *
      uRipple;
    p = swirl(p, pointerP, uRipple * (1.65 + uFinal * 0.55), 0.082);
    p += pointerDir * liquidShock * 0.034;
    p += uRipple * pointerFalloff * 0.048 * vec2(
      sin(t * 18.0 + p.y * 22.0),
      cos(t * 16.0 + p.x * 20.0)
    );

    p = swirl(p, vec2(-0.18 + choice, 0.08), 2.2 * blueWeight - 1.55 * orangeWeight + uPulse * 0.34, 0.18);
    p = swirl(p, vec2(0.24 - choice * 0.4, -0.24), -1.75 * blueWeight + 1.92 * orangeWeight - uPulse * 0.20, 0.13);

    vec2 slow = vec2(t * 0.38, -t * 0.24);
    vec2 q = p;
    q += 0.23 * vec2(
      fbm(p * 2.1 + slow + vec2(2.4, 0.1)),
      fbm(p * 2.0 - slow + vec2(5.7, 8.2))
    );
    q += blueAttraction * vec2(refGradient.x * 0.44, refGradient.y * 0.38) * (0.4 + 0.6 * fbm(p * 2.8 + t));
    q += orangeAttraction * vec2(authorityGradient.x * 0.34, authorityGradient.y * 0.32) * (0.4 + 0.6 * fbm(p * 3.2 - t + 8.0));
    q += liquidShock * 0.030 * vec2(
      sin(pointerDist * 18.0 + t * 22.0),
      cos(pointerDist * 16.0 - t * 20.0)
    );
    q += 0.11 * vec2(
      sin((p.y + fbm(p * 3.0)) * 6.0 + t * 3.0),
      cos((p.x - fbm(p * 2.4)) * 5.4 - t * 2.0)
    );

    vec2 r = q;
    r += 0.30 * vec2(fbm(q * 3.0 + t), fbm(q * 3.2 - t * 0.8 + 4.0));
    r += blueAttraction * vec2(refGradient.x * 0.34, refGradient.y * 0.28) * (0.35 + 0.65 * softInk);
    r += orangeAttraction * vec2(authorityGradient.x * 0.28, authorityGradient.y * 0.24) * (0.35 + 0.65 * authoritySoft);

    float pourA = 0.5 + 0.5 * sin((r.x * 9.8 + r.y * 4.2) + fbm(r * 4.0 + t) * 7.2 + t * 3.2);
    float pourB = 0.5 + 0.5 * sin((r.x * -5.6 + r.y * 10.8) + fbm(r * 6.4 - t) * 5.4 - t * 2.5);
    float marble = mix(pourA, pourB, 0.36 + 0.22 * sin(t * 1.3));
    float body = smoothstep(0.30, 0.86, marble);

    float veinBase = abs(sin((q.x * 18.0 + q.y * 9.0) + fbm(q * 7.0 + 2.0) * 8.0 + t * 2.4));
    float darkVein = smoothstep(0.018, 0.0, veinBase) * (0.45 + 0.55 * fbm(q * 11.0));
    float whiteVein = smoothstep(0.075, 0.0, abs(sin((q.x * 12.0 - q.y * 7.0) + fbm(q * 5.0) * 6.0 - t * 1.5)));
    float wash = fbm(q * 1.4 + vec2(-t * 0.8, t * 0.52));
    float paperPool = smoothstep(0.36, 0.72, wash);

    float cells = 0.0;
    float fills = 0.0;
    for (int i = 0; i < DMS_CELL_COUNT; i++) {
      float fi = float(i);
      float seedA = hash(vec2(fi * 2.11, 4.7));
      float seedB = hash(vec2(9.1, fi * 3.03));
      float seedC = hash(vec2(fi * 5.2, 1.6));
      float cycle = fract(uTime * (0.030 + seedC * 0.020) + hash(vec2(fi * 1.37, 7.7)));
      float birth = smoothstep(0.02, 0.18, cycle);
      float fade = 1.0 - smoothstep(0.70, 0.98, cycle);
      float cellLife = birth * fade;
      float breath = 0.5 + 0.5 * sin(uTime * (0.62 + seedA * 0.58) + fi * 2.41);
      float breathSize = 0.72 + 0.50 * breath + 0.20 * cellLife;
      vec2 c = vec2(
        0.10 + 0.80 * seedA,
        0.08 + 0.84 * seedB
      );
      c += vec2(
        sin(uTime * (0.18 + seedA * 0.10) + fi * 1.8),
        cos(uTime * (0.16 + seedB * 0.11) + fi * 1.3)
      ) * (0.046 + 0.020 * breath);
      c += vec2(
        fbm(vec2(fi * 0.31, uTime * 0.13 + seedA * 4.0)) - 0.5,
        fbm(vec2(uTime * 0.12 + seedB * 5.0, fi * 0.27)) - 0.5
      ) * 0.034;
      float rr = (0.022 + 0.058 * seedC) * breathSize;
      float local = (0.42 + 0.58 * smoothstep(0.1, 0.95, fbm((uv - c) * 5.0 + fi))) *
        (0.18 + 0.82 * cellLife);
      float halo = smoothstep(rr * 2.25, rr * 0.74, length((uv - c) * vec2(aspect, 1.0))) *
        (1.0 - smoothstep(rr * 0.72, rr * 0.20, length((uv - c) * vec2(aspect, 1.0))));
      cells += (cellRing(uv, c, rr, aspect) + halo * 0.22) * local;
      fills += cellFill(uv, c, rr * (0.66 + 0.26 * breath), aspect) *
        (0.28 + 0.58 * hash(vec2(fi, 8.0))) *
        cellLife *
        (0.70 + 0.30 * breath);
    }

    cells = clamp(cells, 0.0, 1.0);
    fills = clamp(fills, 0.0, 1.0);
    float foam = smoothstep(0.83, 0.99, fbm(uv * vec2(58.0, 78.0) + t * 8.0));
    float grain = hash(uv * uResolution.xy + floor(uTime * 24.0));
    float vignette = smoothstep(0.88, 0.18, length((uv - 0.5) * vec2(0.86, 1.0)));
    float broadShape = smoothstep(0.05, 0.64, softInk);
    float detailShape = smoothstep(0.16, 0.72, detailInk);
    float flowingEdge = refEdge * (0.48 + 0.52 * smoothstep(0.22, 0.92, body + darkVein));
    float structure = clamp(broadShape * 0.82 + detailShape * 0.34 + flowingEdge * 0.42, 0.0, 1.0);
    float liquidMemory = clamp(body * 0.72 + darkVein * 0.42 + cells * 0.18 - paperPool * 0.14, 0.0, 1.0);
    float organicReveal = smoothstep(0.10, 0.92, uFinal + fbm(uv * 2.2 + t) * 0.16 - length(uv - vec2(0.48, 0.52)) * 0.08);
    float morph = blueFinal * organicReveal;
    float visibleBroad = broadShape * morph;
    float visibleDetail = detailShape * morph;
    float visibleEdge = flowingEdge * morph;
    float orangeVein = smoothstep(0.026, 0.0, abs(sin((q.x * -16.0 + q.y * 13.0) + fbm(q * 8.0 + 17.0) * 7.0 - t * 3.0))) *
      (0.45 + 0.55 * fbm(q * 10.0 + 4.0));
    float authorityBroad = smoothstep(0.05, 0.68, authoritySoft);
    float authorityDetail = smoothstep(0.20, 0.76, authorityInk);
    float authorityFlowingEdge = authorityEdge * (0.50 + 0.50 * smoothstep(0.18, 0.86, body + orangeVein));
    float authorityStructure = clamp(authorityBroad * 0.88 + authorityDetail * 0.36 + authorityFlowingEdge * 0.46, 0.0, 1.0);
    float authorityMemory = clamp(body * 0.62 + orangeVein * 0.48 + cells * 0.14 - paperPool * 0.10, 0.0, 1.0);
    float authorityMorph = orangeFinal * organicReveal;
    float authorityStructureGate = smoothstep(0.04, 0.72, authorityMorph);
    float authorityDensity = clamp(
      mix(authorityMemory, authorityStructure * (0.84 + authorityMemory * 0.16) + authorityMemory * 0.24, authorityMorph)
      + orangeVein * (0.18 + 0.12 * authorityMorph)
      + authorityFlowingEdge * 0.18 * authorityStructureGate,
      0.0,
      1.0
    );
    float shapeDensity = clamp(
      structure * (0.72 + liquidMemory * 0.22)
      + liquidMemory * 0.34
      + darkVein * (0.12 + broadShape * 0.14)
      - paperPool * 0.12,
      0.0,
      1.0
    );
    float unifiedDensity = clamp(
      mix(liquidMemory, shapeDensity, morph)
      + darkVein * (0.18 + 0.12 * morph)
      + cells * (0.10 - 0.04 * morph)
      + whiteVein * 0.06,
      0.0,
      1.0
    );

    vec2 blueFloatUv = uv + vec2(
      -0.060 * orangeDominance + 0.025 * sin(t * 2.8 + uv.y * 8.0),
      0.036 * cos(t * 2.2 + uv.x * 6.0)
    );
    vec2 orangeFloatUv = uv + vec2(
      0.072 * blueDominance + 0.034 * sin(t * 3.0 + uv.y * 9.0 + 1.7),
      -0.030 * cos(t * 2.5 + uv.x * 7.0 + 2.3)
    );
    float blueDrift = smoothstep(0.36, 0.84, fbm(blueFloatUv * vec2(2.0, 2.7) + vec2(-t * 4.0, t * 2.2)));
    float orangeDrift = smoothstep(0.34, 0.82, fbm(orangeFloatUv * vec2(1.75, 2.35) + vec2(t * 4.6, -t * 2.0)));
    float blueRibbon = smoothstep(
      0.052,
      0.0,
      abs(sin(blueFloatUv.x * 7.4 - blueFloatUv.y * 12.2 + fbm(blueFloatUv * 4.4 - t) * 5.2 - t * 2.6))
    ) * blueDrift;
    float orangeRibbon = smoothstep(
      0.050,
      0.0,
      abs(sin(orangeFloatUv.x * -6.8 + orangeFloatUv.y * 11.4 + fbm(orangeFloatUv * 4.0 + t + 3.0) * 5.4 + t * 2.8))
    ) * orangeDrift;
    float blueFootprint = smoothstep(0.24, 0.74, structure * morph + visibleEdge * 0.45);
    float orangeFootprint = smoothstep(
      0.24,
      0.74,
      authorityStructure * authorityMorph + authorityFlowingEdge * 0.45 * authorityStructureGate
    );
    float floatingBlueDensity = clamp(
      liquidMemory * 0.62 +
      darkVein * 0.24 +
      blueDrift * 0.24 +
      blueRibbon * 0.28 +
      cells * 0.08 -
      orangeFootprint * orangeDominance * 0.34,
      0.0,
      1.0
    );
    float floatingOrangeDensity = clamp(
      authorityMemory * 0.60 +
      orangeVein * 0.25 +
      orangeDrift * 0.26 +
      orangeRibbon * 0.32 +
      cells * 0.06 -
      blueFootprint * blueDominance * 0.36,
      0.0,
      1.0
    );
    float blueDensity = mix(floatingBlueDensity, unifiedDensity, blueDominance);
    float orangeDensity = mix(floatingOrangeDensity, authorityDensity, orangeDominance);
    blueDensity *= mix(1.0, 0.78 + blueRibbon * 0.12 + blueDrift * 0.10, orangeDominance);
    orangeDensity *= mix(1.0, 0.78 + orangeRibbon * 0.12 + orangeDrift * 0.10, blueDominance);
    blueDensity *= mix(1.0, 1.0 - orangeFootprint * 0.44, orangeDominance);
    orangeDensity *= mix(1.0, 1.0 - blueFootprint * 0.44, blueDominance);

    float pigmentEdge = clamp(visibleEdge * 0.78 + refEdge * blueFinal * 0.18 + darkVein * 0.28, 0.0, 1.0);
    float pigmentBody = clamp(body * 0.42 + cells * 0.26 + broadShape * 0.22 + visibleBroad * 0.20, 0.0, 1.0);
    float frostMask = clamp(pigmentBody * 0.58 + pigmentEdge * 0.52 + paperPool * 0.18, 0.0, 1.0);
    float powderFine = smoothstep(0.76, 0.995, hash(uv * uResolution.xy * 0.62 + vec2(3.7, 19.1)));
    float powderMid = smoothstep(0.58, 0.92, noise(uv * uResolution.xy * 0.085 + vec2(11.2, 4.7)));
    float powderFlow = smoothstep(0.62, 0.98, fbm(q * vec2(72.0, 96.0) + refGradient * 9.0 * blueDominance));
    float edgePowder = powderFine * (0.35 + 0.65 * powderFlow) * smoothstep(0.08, 0.72, pigmentEdge);
    float palePowder = powderFine * powderMid * smoothstep(0.06, 0.64, frostMask) * (1.0 - smoothstep(0.64, 0.96, unifiedDensity));
    float deepSediment = smoothstep(0.64, 0.98, powderFlow + powderFine * 0.34) *
      smoothstep(0.28, 0.92, darkVein + cells * 0.36 + visibleEdge * 0.42);
    float frostedFilm = smoothstep(0.12, 0.82, frostMask) *
      (0.45 + 0.55 * smoothstep(0.22, 0.88, powderMid + foam * 0.36));

    float mirrorBoundary = clamp(0.58 + vignette * 0.42, 0.0, 1.0);
    float blueResidual = mirrorBoundary *
      (0.075 + 0.065 * orangeControl) *
      (0.46 + 0.54 * clamp(floatingBlueDensity + cells * 0.18 + blueRibbon * 0.24, 0.0, 1.0));
    float orangeResidual = mirrorBoundary *
      (0.075 + 0.065 * blueControl) *
      (0.46 + 0.54 * clamp(floatingOrangeDensity + cells * 0.14 + orangeRibbon * 0.25, 0.0, 1.0));
    float blueMask = clamp(
      max(blueDensity * blueWeight + visibleBroad * 0.12 + visibleEdge * 0.08, blueResidual),
      0.0,
      1.0
    );
    float orangeMask = clamp(max(
      orangeDensity * orangeWeight +
      authorityBroad * authorityMorph * 0.12 +
      authorityFlowingEdge * 0.10 * authorityStructureGate,
      orangeResidual),
      0.0,
      1.0
    );
    blueMask = clamp(blueMask * 1.16 + mirrorBoundary * blueControl * 0.014, 0.0, 1.0);
    orangeMask = clamp(orangeMask * 1.16 + mirrorBoundary * orangeControl * 0.014, 0.0, 1.0);
    float conflict = smoothstep(0.30, 0.78, blueMask) *
      smoothstep(0.30, 0.78, orangeMask) *
      (1.0 - max(blueDominance, orangeDominance) * 0.56);
    float orangeWins = smoothstep(-0.18, 0.18, orangeMask - blueMask + (fbm(uv * 9.0 + t) - 0.5) * 0.14);

    vec3 blueColor = palette(blueDensity);
    vec3 paleAcrylic = mix(vec3(0.965, 0.992, 1.0), vec3(0.58, 0.84, 1.0), visibleBroad * 0.86);
    blueColor = mix(blueColor, paleAcrylic, paperPool * (0.20 + morph * 0.08));
    vec3 cellBlue = mix(vec3(0.66, 0.91, 1.0), vec3(0.02, 0.25, 0.95), blueDensity);
    blueColor = mix(blueColor, cellBlue, cells * (0.62 - morph * 0.24));
    blueColor = mix(blueColor, vec3(0.0, 0.16, 0.80), darkVein * (0.46 + morph * 0.14));
    blueColor = mix(blueColor, vec3(0.0, 0.28, 1.0), visibleEdge * (0.10 + morph * 0.12) + visibleDetail * 0.035);
    blueColor = mix(blueColor, vec3(0.965, 0.992, 1.0), (whiteVein * 0.28 + fills * 0.10 + foam * 0.05) * (0.42 + morph * 0.06));
    float paleBlueLift = (1.0 - smoothstep(0.22, 0.78, blueDensity)) *
      (0.50 + 0.50 * smoothstep(0.02, 0.56, body + cells + visibleBroad));
    blueColor = mix(blueColor, vec3(0.58, 0.86, 1.0), paleBlueLift * 0.10);
    blueColor = mix(blueColor, vec3(0.74, 0.93, 1.0), frostedFilm * 0.07);
    blueColor = mix(blueColor, vec3(0.20, 0.58, 1.0), palePowder * 0.34);
    blueColor = mix(blueColor, vec3(0.00, 0.20, 0.96), edgePowder * 0.54 + deepSediment * 0.38);
    blueColor = mix(blueColor, vec3(0.00, 0.10, 0.72), deepSediment * 0.28);
    blueColor = pigmentBoost(blueColor, 1.22, 1.05);

    vec3 orangeColor = orangePalette(orangeDensity);
    orangeColor = mix(orangeColor, vec3(1.0, 0.92, 0.72), paperPool * (0.10 + authorityMorph * 0.05));
    orangeColor = mix(orangeColor, vec3(1.0, 0.38, 0.03), cells * (0.42 - authorityMorph * 0.12));
    orangeColor = mix(orangeColor, vec3(0.78, 0.05, 0.00), orangeVein * (0.50 + authorityMorph * 0.14));
    orangeColor = mix(
      orangeColor,
      vec3(1.0, 0.67, 0.05),
      (authorityFlowingEdge * (0.16 + authorityMorph * 0.16) + authorityDetail * 0.045) * authorityStructureGate
    );
    orangeColor = mix(orangeColor, vec3(1.0, 0.96, 0.86), (whiteVein * 0.28 + fills * 0.08 + foam * 0.04) * (0.28 + authorityMorph * 0.05));
    orangeColor = mix(orangeColor, vec3(1.0, 0.58, 0.16), palePowder * 0.20 + edgePowder * 0.18);
    orangeColor = pigmentBoost(orangeColor, 1.20, 1.05);

    float sharedBlue = max(blueMask, 0.055 * mirrorBoundary);
    float sharedOrange = max(orangeMask, 0.055 * mirrorBoundary);
    vec3 sharedPigment = (blueColor * sharedBlue + orangeColor * sharedOrange) /
      max(sharedBlue + sharedOrange, 0.001);
    vec3 color = mix(sharedPigment, mix(blueColor, orangeColor, orangeWins), 0.58);
    color = mix(color, vec3(0.04, 0.06, 0.10), conflict * 0.18 * smoothstep(0.35, 0.90, abs(blueMask - orangeMask) + fbm(uv * 18.0)));
    color = mix(color, vec3(1.0, 0.96, 0.88), conflict * 0.30 * (1.0 - smoothstep(0.05, 0.32, abs(blueMask - orangeMask))));
    color = mix(color, vec3(0.0, 0.24, 1.0), blueMask * (0.08 + 0.06 * orangeControl));
    color = mix(color, vec3(1.0, 0.30, 0.02), orangeMask * (0.08 + 0.06 * blueControl));
    color += (grain - 0.5) * (0.020 + frostMask * 0.030 + orangeDensity * 0.018);
    color = pigmentBoost(color, 1.14, 1.04);
    color = mix(vec3(0.905, 0.952, 0.992), color, clamp(0.92 + vignette * 0.08, 0.0, 1.0));

    float bluePresence = clamp(
      blueMask * 0.52 +
      visibleBroad * 0.22 +
      visibleDetail * 0.12 +
      cells * 0.08 +
      darkVein * 0.10 +
      edgePowder * 0.10 +
      palePowder * 0.05,
      0.0,
      1.0
    );
    float orangePresence = clamp(
      orangeMask * 0.54 +
      authorityBroad * 0.20 * authorityStructureGate +
      authorityDetail * 0.12 * authorityStructureGate +
      orangeVein * 0.12 +
      authorityFlowingEdge * 0.14 * authorityStructureGate,
      0.0,
      1.0
    );
    float pigmentPresence = smoothstep(0.04, 0.76, max(bluePresence, orangePresence) + conflict * 0.10);
    float densityBoost = clamp(uColorBoost, 0.0, 0.80);
    vec3 denserColor = pigmentBoost(color, 1.0 + densityBoost * 0.82, 1.0 + densityBoost * 0.24);
    denserColor *= 1.0 + densityBoost * 0.16 * pigmentPresence;
    color = mix(color, clamp(denserColor, 0.0, 1.0), pigmentPresence);

    float paintAlpha = mix(0.46, 0.96, smoothstep(0.08, 0.72, max(bluePresence, orangePresence) + conflict * 0.12));
    paintAlpha = clamp(paintAlpha * max(uAlphaBoost, 0.25), 0.0, 0.985);
    gl_FragColor = vec4(color, paintAlpha * uMaterialOpacity);
  }
`

const arStatus = {
  version: APP_VERSION,
  xrLoaded: false,
  imageTargetsConfigured: false,
  targetName: '',
  targetState: 'waiting',
  anchorState: 'waiting',
  dmsLoaded: false,
  dmsShardCount: 0,
  dmsPanelCount: 0,
  dmsPhysicalHeight: 0,
  dmsTotalWidth: 0,
  dmsDisplayScale: 1,
  dmsEffectiveHeight: 0,
  dmsEffectiveWidth: 0,
  dmsQuality: 'auto',
  dmsDrawCalls: 0,
  dmsTriangles: 0,
  dmsTextures: 0,
  dmsFps: 0,
  dmsLiquidTarget: 'n/a',
  imageEventCount: 0,
  targetScale: 1,
  anchorScale: 1,
  anchorPosition: 'n/a',
  anchorWorldPosition: 'n/a',
  anchorWorldDrift: 0,
  anchorCameraDistance: 0,
  anchorScreenPosition: 'n/a',
  anchorScreenDelta: 0,
  anchorFollowSignal: 'n/a',
  worldRefPosition: 'n/a',
  worldRefCameraDistance: 0,
  worldRefScreenPosition: 'n/a',
  worldRefScreenDelta: 0,
  worldRefFollowSignal: 'n/a',
  cameraPosition: 'n/a',
  cameraTravel: 0,
  xrPoseSource: 'none',
  xrPosePosition: 'n/a',
  xrPoseTravel: 0,
  xrPoseSamples: 0,
  xrPoseAgeMs: 0,
  placementCandidate: 'n/a',
  placementStability: '0/0',
  trackingStatus: 'unknown',
  trackingReason: '',
  message: 'Starting AR world tracking...',
  hideStatus: false,
}

function isArDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.has('debug') || params.has('qa')
  } catch {
    return false
  }
}

function renderArStatus() {
  window.__dmsArStatus = { ...arStatus }
  if (document.body) {
    document.body.dataset.dmsArVersion = APP_VERSION
    document.body.dataset.dmsXrLoaded = String(arStatus.xrLoaded)
    document.body.dataset.dmsTargetState = arStatus.targetState
    document.body.dataset.dmsAnchorState = arStatus.anchorState
  }

  const status = document.getElementById('targetStatus')
  if (!status) return

  const debug = isArDebugEnabled()
  status.classList.toggle('is-debug', debug)
  if (debug) {
    const trackingMode = arStatus.imageTargetsConfigured
      ? `marker${arStatus.targetName ? `: ${arStatus.targetName}` : ''}`
      : 'room-space'
    status.hidden = false
    status.textContent = [
      `DMS AR ${APP_VERSION}`,
      `XR: ${arStatus.xrLoaded ? 'loaded' : 'waiting'} / tracking: ${trackingMode}`,
      `Mode: ${arStatus.targetName || 'world'} / ${arStatus.targetState}`,
      `Anchor: ${arStatus.anchorState}`,
      `Tracking: ${arStatus.trackingStatus}${arStatus.trackingReason ? ` (${arStatus.trackingReason})` : ''}`,
      `DMS: ${arStatus.dmsLoaded ? `${arStatus.dmsPanelCount} panels, ${arStatus.dmsShardCount} shards` : 'loading'}`,
      `Size: ${arStatus.dmsEffectiveHeight.toFixed(2)}h x ${arStatus.dmsEffectiveWidth.toFixed(2)}w @ display ${arStatus.dmsDisplayScale.toFixed(2)}`,
      `Perf: ${arStatus.dmsQuality} / ${arStatus.dmsFps.toFixed(1)}fps / ${arStatus.dmsDrawCalls} calls / ${arStatus.dmsTextures} textures / liquid ${arStatus.dmsLiquidTarget}`,
      `Anchor pos: ${arStatus.anchorPosition}`,
      `Anchor lock: ${arStatus.anchorWorldPosition} / drift ${arStatus.anchorWorldDrift.toFixed(3)}m / cam ${arStatus.anchorCameraDistance.toFixed(2)}m`,
      `Anchor view: ${arStatus.anchorScreenPosition} / screen delta ${arStatus.anchorScreenDelta.toFixed(3)} / ${arStatus.anchorFollowSignal}`,
      `World ref: ${arStatus.worldRefPosition} / cam ${arStatus.worldRefCameraDistance.toFixed(2)}m / screen ${arStatus.worldRefScreenDelta.toFixed(3)} / ${arStatus.worldRefFollowSignal}`,
      `Camera pos: ${arStatus.cameraPosition} / travel ${arStatus.cameraTravel.toFixed(2)}m`,
      `XR pose: ${arStatus.xrPoseSource} ${arStatus.xrPosePosition} / travel ${arStatus.xrPoseTravel.toFixed(2)}m / samples ${arStatus.xrPoseSamples}`,
      `Placement: ${arStatus.placementCandidate} / stable ${arStatus.placementStability}`,
      `Runtime: events ${arStatus.imageEventCount} / anchor scale ${arStatus.anchorScale.toFixed(3)}`,
    ].join('\n')
    return
  }

  status.textContent = arStatus.message
  status.hidden = Boolean(arStatus.hideStatus)
}

function setArStatus(patch = {}) {
  Object.assign(arStatus, patch)
  renderArStatus()
}

function queryNumber(name, fallback) {
  try {
    const rawValue = new URLSearchParams(window.location.search).get(name)
    if (rawValue === null || rawValue === '') return fallback
    const value = Number(rawValue)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

function queryString(name, fallback = '') {
  try {
    const value = new URLSearchParams(window.location.search).get(name)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

const SHARD_VARIANT_URLS = {
  impact_star: `${DMS_ROOT}assets/shards-impact-star.json`,
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isProbablyMobileDevice() {
  const ua = String(window.navigator?.userAgent || '')
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || Boolean(window.AFRAME?.utils?.device?.isMobile?.())
}

function resolveQualityProfile(value = 'auto', { preferHigh = false } = {}) {
  const requested = String(queryString('quality', value) || value || 'auto').toLowerCase()
  if (requested in QUALITY_PROFILES) return QUALITY_PROFILES[requested]
  if (requested !== 'auto' && value in QUALITY_PROFILES) return QUALITY_PROFILES[value]
  return preferHigh || !isProbablyMobileDevice() ? QUALITY_PROFILES.high : QUALITY_PROFILES.balanced
}

function qualityShaderDefines(profile) {
  const selected = profile || QUALITY_PROFILES.high
  return {
    DMS_FBM_STEPS: selected.fbmSteps,
    DMS_CELL_COUNT: selected.cellCount,
  }
}

function liquidColorBoostForQuality(profile) {
  const selected = profile || QUALITY_PROFILES.high
  return clamp(queryNumber('colorBoost', selected.colorBoost ?? 0.12), 0, 0.8)
}

function liquidAlphaBoostForQuality(profile) {
  const selected = profile || QUALITY_PROFILES.high
  return clamp(queryNumber('alphaBoost', selected.alphaBoost ?? 1.04), 0.5, 1.35)
}

function liquidTextureOpacity() {
  return clamp(queryNumber('liquidOpacity', 1.55), 0.65, 1.75)
}

function liquidTextureExposure() {
  return clamp(queryNumber('liquidExposure', 1.08), 0.85, 1.55)
}

function liquidTextureHighlightLimit() {
  return clamp(queryNumber('liquidHighlightLimit', 0.82), 0.68, 0.96)
}

function fract(value) {
  return value - Math.floor(value)
}

function stableNoise(seed, salt) {
  return fract(Math.sin(seed * 91.721 + salt * 37.111) * 43758.5453)
}

function normalizeDmsPath(src) {
  if (!src) return src
  const path = String(src).replace(/^\.\//, '')
  if (path.startsWith('assets/dms/')) return path
  if (path.startsWith('assets/')) return `${DMS_ROOT}${path}`
  return path
}

async function fetchJson(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${APP_VERSION}`)
  if (!response.ok) throw new Error(`Unable to load ${url}`)
  return response.json()
}

function getThree() {
  return window.THREE || window.AFRAME?.THREE
}

function makeShardShape(THREE, points) {
  const shape = new THREE.Shape()
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y)
    else shape.lineTo(point.x, point.y)
  })
  shape.closePath()
  return shape
}

function transformPoint(THREE, point, bounds, scale) {
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  return new THREE.Vector2(
    (point[0] - centerX) * XR_STRETCH_X * scale,
    (point[1] - bounds.minY) * XR_STRETCH_Y * scale,
  )
}

function assignGlobalUv(THREE, geometry, center, dimensions) {
  const positions = geometry.getAttribute('position')
  const uv = []
  for (let index = 0; index < positions.count; index += 1) {
    const x = center.x + positions.getX(index)
    const y = center.y + positions.getY(index)
    uv.push(
      clamp((x + dimensions.width * 0.5) / dimensions.width, 0, 1),
      clamp(y / dimensions.height, 0, 1),
    )
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
}

function appendGeometryAttributes(geometry, buckets) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const position = source.getAttribute('position')
  const uv = source.getAttribute('uv')
  const dmsCenter = source.getAttribute('dmsCenter')
  const dmsSeed = source.getAttribute('dmsSeed')
  const dmsPanel = source.getAttribute('dmsPanel')

  for (let index = 0; index < position.count; index += 1) {
    buckets.positions.push(position.getX(index), position.getY(index), position.getZ(index))
    if (uv) buckets.uvs.push(uv.getX(index), uv.getY(index))
    if (dmsCenter) buckets.centers.push(dmsCenter.getX(index), dmsCenter.getY(index))
    if (dmsSeed) buckets.seeds.push(dmsSeed.getX(index))
    if (dmsPanel) buckets.panels.push(dmsPanel.getX(index))
  }

  if (source !== geometry) source.dispose()
}

function createMergedBufferGeometry(THREE, geometries, includeUv = true) {
  const buckets = {
    positions: [],
    uvs: [],
    centers: [],
    seeds: [],
    panels: [],
  }

  for (const geometry of geometries) {
    appendGeometryAttributes(geometry, buckets)
    geometry.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(buckets.positions, 3))
  if (includeUv && buckets.uvs.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(buckets.uvs, 2))
  if (buckets.centers.length) merged.setAttribute('dmsCenter', new THREE.Float32BufferAttribute(buckets.centers, 2))
  if (buckets.seeds.length) merged.setAttribute('dmsSeed', new THREE.Float32BufferAttribute(buckets.seeds, 1))
  if (buckets.panels.length) merged.setAttribute('dmsPanel', new THREE.Float32BufferAttribute(buckets.panels, 1))
  merged.computeBoundingSphere()
  return merged
}

function createMergedLineSegmentsGeometry(THREE, segments) {
  const positions = []
  const centers = []
  const seeds = []
  const panels = []

  const pushVertex = (point, segment) => {
    positions.push(point.x, point.y, point.z || 0)
    centers.push(segment.center.x, segment.center.y)
    seeds.push(segment.seed)
    panels.push(segment.panelIndex)
  }

  for (const segment of segments) {
    const points = segment.points || []
    for (let index = 0; index < points.length; index += 1) {
      pushVertex(points[index], segment)
      pushVertex(points[(index + 1) % points.length], segment)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('dmsCenter', new THREE.Float32BufferAttribute(centers, 2))
  geometry.setAttribute('dmsSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('dmsPanel', new THREE.Float32BufferAttribute(panels, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function colorForShard(THREE, seed) {
  const hueShift = stableNoise(seed, 4) * 0.08
  const color = new THREE.Color()
  color.setHSL(0.52 + hueShift, 0.28, 0.68 + stableNoise(seed, 5) * 0.07)
  return color
}

function easeSmooth(value) {
  const x = clamp(value, 0, 1)
  return x * x * (3 - 2 * x)
}

function streetPanelSpacingForSeries(series) {
  const street = series?.streetInstallation || {}
  return Number(street.panelSpacingMeters ?? series?.streetPanelSpacingMeters) || DEFAULT_PANEL_SPACING
}

function rememberBaseOpacity(material) {
  if (!material) return
  const materials = Array.isArray(material) ? material : [material]
  for (const item of materials) {
    if (item && item.userData.baseOpacity === undefined) {
      item.userData.baseOpacity = item.opacity ?? 1
    }
  }
}

function setShardOpacity(shard, opacity) {
  for (const child of shard.children) {
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      rememberBaseOpacity(material)
      material.transparent = true
      material.opacity = material.userData.baseOpacity * opacity
      if (material.userData?.liquidUniforms?.uMaterialOpacity) {
        material.userData.liquidUniforms.uMaterialOpacity.value = material.opacity
      }
    }
  }
}

function resetShardTransform(shard) {
  shard.position.copy(shard.userData.basePosition)
  shard.quaternion.copy(shard.userData.baseQuaternion)
  setShardOpacity(shard, 1)
  shard.userData.lastMotionOpacity = 1
}

function setAllPanelsVisible(group) {
  const activeMeshes = []
  for (const shard of group.userData.shardObjects || []) {
    shard.visible = true
    resetShardTransform(shard)
    if (shard.userData.hitMesh) activeMeshes.push(shard.userData.hitMesh)
  }
  group.userData.shardMeshes = activeMeshes
}

function panelStateForIndex(group, panelIndex) {
  return group.userData.panelStates?.[panelIndex] || null
}

function createPanelState(panelIndex, layout) {
  return {
    panelIndex,
    centerX: layout.offsetX,
    width: layout.width,
    height: layout.height,
    stress: 0,
    mode: 'stable',
    lastUpdate: 0,
    lastHit: -Infinity,
    lastStrength: 0,
    originX: layout.offsetX,
    originY: layout.height * 0.5,
    breakAt: Infinity,
    breakStart: Infinity,
  }
}

function nearestPanelIndexForPoint(group, x) {
  const states = group.userData.panelStates || []
  if (!states.length) return 0
  let nearestIndex = 0
  let nearestDistance = Infinity
  states.forEach((state, index) => {
    const distance = Math.abs(x - state.centerX)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })
  return nearestIndex
}

function clampInteractionTarget(group, target = {}) {
  const dimensions = group?.userData?.dimensions || { height: DEFAULT_PHYSICAL_HEIGHT }
  const fallbackX = Number(target.x)
  const panelIndex = Number.isFinite(Number(target.panelIndex))
    ? Number(target.panelIndex)
    : nearestPanelIndexForPoint(group, Number.isFinite(fallbackX) ? fallbackX : 0)
  const state = panelStateForIndex(group, panelIndex) || group?.userData?.panelStates?.[0]
  const height = Number(state?.height || dimensions.height) || DEFAULT_PHYSICAL_HEIGHT
  if (!state) {
    return {
      panelIndex: 0,
      x: Number.isFinite(fallbackX) ? fallbackX : 0,
      y: clamp(Number(target.y) || height * 0.5, 0, height),
    }
  }
  const halfWidth = Math.max(0.001, Number(state.width) * 0.5)
  const margin = Math.min(0.035, halfWidth * 0.12)
  const minX = state.centerX - halfWidth + margin
  const maxX = state.centerX + halfWidth - margin
  const x = Number.isFinite(fallbackX) ? fallbackX : state.centerX
  const y = Number.isFinite(Number(target.y)) ? Number(target.y) : height * 0.5
  return {
    panelIndex: state.panelIndex,
    x: clamp(x, minX, maxX),
    y: clamp(y, 0, height),
  }
}

function updateDebugState(el, group, extra = {}) {
  if (!el || !group) return
  const panelStates = group.userData.panelStates || []
  el.dataset.dmsLoaded = 'true'
  el.dataset.dmsShardCount = String(group.userData.shardObjects?.length || 0)
  el.dataset.dmsPanelCount = String(group.userData.panelCount || 0)
  el.dataset.dmsPanel = String(group.userData.currentPanelIndex || 0)
  el.dataset.dmsVisibleShardCount = String(group.userData.shardMeshes?.length || 0)
  el.dataset.dmsBrokenPanels = String(panelStates.filter(state => state.mode === 'falling').length)
  el.dataset.dmsLayoutScale = String(group.userData.layoutScale || DEFAULT_LAYOUT_SCALE)
  el.dataset.dmsDisplayScale = String(group.userData.displayScale || 1)
  el.dataset.dmsGpuMotion = String(group.userData.enableGpuMotion === true)
  el.dataset.dmsPhysicalHeight = (group.userData.dimensions?.height || 0).toFixed(2)
  el.dataset.dmsTotalWidth = (group.userData.dimensions?.width || 0).toFixed(2)
  el.dataset.dmsEffectiveHeight = ((group.userData.dimensions?.height || 0) * (group.userData.displayScale || 1)).toFixed(2)
  el.dataset.dmsEffectiveWidth = ((group.userData.dimensions?.width || 0) * (group.userData.displayScale || 1)).toFixed(2)
  const targetPanelIndex = group.userData.targetPanelIndex ?? group.userData.currentPanelIndex ?? 0
  const targetState = panelStateForIndex(group, targetPanelIndex)
  el.dataset.dmsTargetPanel = String(targetPanelIndex)
  el.dataset.dmsTargetMode = targetState?.mode || 'stable'
  el.dataset.dmsTargetStress = targetState ? targetState.stress.toFixed(2) : '0.00'
  arStatus.dmsLoaded = true
  arStatus.dmsShardCount = group.userData.shardObjects?.length || 0
  arStatus.dmsPanelCount = group.userData.panelCount || 0
  arStatus.dmsPhysicalHeight = group.userData.dimensions?.height || 0
  arStatus.dmsTotalWidth = group.userData.dimensions?.width || 0
  arStatus.dmsDisplayScale = group.userData.displayScale || 1
  arStatus.dmsEffectiveHeight = arStatus.dmsPhysicalHeight * arStatus.dmsDisplayScale
  arStatus.dmsEffectiveWidth = arStatus.dmsTotalWidth * arStatus.dmsDisplayScale
  arStatus.dmsQuality = group.userData.qualityProfile?.name || 'auto'
  arStatus.dmsLiquidTarget = group.userData.liquidRenderTargets?.[0]
    ? `${group.userData.liquidRenderTargets[0].width}x${group.userData.liquidRenderTargets[0].height}`
    : 'n/a'
  if (isArDebugEnabled()) renderArStatus()
  for (const [key, value] of Object.entries(extra)) {
    el.dataset[key] = String(value)
  }
}

function applyTextureColorSpace(THREE, texture) {
  if (!texture) return
  if ('colorSpace' in texture && THREE.SRGBColorSpace) {
    texture.colorSpace = THREE.SRGBColorSpace
  } else if ('encoding' in texture && THREE.sRGBEncoding) {
    texture.encoding = THREE.sRGBEncoding
  }
}

function makePhysicalMaterial(THREE, options) {
  const Material = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial
  return new Material(options)
}

function createGpuMotionUniforms(THREE, options = {}) {
  return {
    uDmsMotionEnabled: { value: 1 },
    uDmsTime: { value: 0 },
    uDmsHit0: { value: new THREE.Vector4(0, 0, 0, 99) },
    uDmsHit1: { value: new THREE.Vector4(0, 0, 0, 99) },
    uDmsHit2: { value: new THREE.Vector4(0, 0, 0, 99) },
    uDmsHitPanels: { value: new THREE.Vector4(-100, -100, -100, -100) },
    uDmsShapeBounds: { value: new THREE.Vector4(1, DEFAULT_PHYSICAL_HEIGHT, 0, DEFAULT_PHYSICAL_HEIGHT * 0.5) },
    uDmsShapePolarity: { value: 0 },
    uDmsShapeFinal: { value: 0 },
    uDmsMotionMix: { value: clamp(Number(options.motionMix ?? 1), 0, 1) },
    uDmsIdleRotationEnabled: { value: options.idleRotationEnabled === false ? 0 : 1 },
    uDmsIdleRotationStrength: { value: clamp(Number(options.idleRotationStrength ?? 1), 0, 2) },
    uDmsShockAfterglow: { value: clamp(Number(options.shockAfterglow ?? 1), 0, 2) },
  }
}

function assignGpuMotionAttributes(THREE, geometry, center, seed, panelIndex) {
  const positions = geometry?.getAttribute?.('position')
  if (!positions) return geometry
  const centers = new Float32Array(positions.count * 2)
  const seeds = new Float32Array(positions.count)
  const panels = new Float32Array(positions.count)
  for (let index = 0; index < positions.count; index += 1) {
    centers[index * 2] = center.x
    centers[index * 2 + 1] = center.y
    seeds[index] = seed
    panels[index] = panelIndex
  }
  geometry.setAttribute('dmsCenter', new THREE.Float32BufferAttribute(centers, 2))
  geometry.setAttribute('dmsSeed', new THREE.Float32BufferAttribute(seeds, 1))
  geometry.setAttribute('dmsPanel', new THREE.Float32BufferAttribute(panels, 1))
  return geometry
}

function injectGpuMotionVertexShader(vertexShader) {
  if (!vertexShader || vertexShader.includes('attribute vec2 dmsCenter;')) return vertexShader
  const withDefinitions = vertexShader.replace('void main() {', `${DMS_GPU_MOTION_GLSL}\nvoid main() {`)
  if (withDefinitions.includes('#include <begin_vertex>')) {
    return withDefinitions.replace('#include <begin_vertex>', 'vec3 transformed = dmsApplyMotion(position);')
  }
  return withDefinitions
}

function attachGpuMotionToMaterial(material, motionUniforms) {
  if (!material || !motionUniforms || material.userData?.dmsGpuMotionPatched) return material
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousProgramKey = material.customProgramCacheKey
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (typeof previousOnBeforeCompile === 'function') {
      previousOnBeforeCompile.call(this, shader, renderer)
    }
    Object.assign(shader.uniforms, motionUniforms)
    shader.vertexShader = injectGpuMotionVertexShader(shader.vertexShader)
  }
  material.customProgramCacheKey = function customProgramCacheKey() {
    const previousKey = typeof previousProgramKey === 'function'
      ? previousProgramKey.call(this)
      : ''
    return `${previousKey}|dms-gpu-motion-${APP_VERSION}`
  }
  material.userData.dmsGpuMotionPatched = true
  material.userData.dmsMotionUniforms = motionUniforms
  material.needsUpdate = true
  return material
}

function attachGlassOpticsToMaterial(material) {
  if (!material || material.userData?.dmsGlassOpticsPatched) return material
  const previousOnBeforeCompile = material.onBeforeCompile
  const previousProgramKey = material.customProgramCacheKey
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    if (typeof previousOnBeforeCompile === 'function') {
      previousOnBeforeCompile.call(this, shader, renderer)
    }
    if (shader.fragmentShader.includes('#include <output_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', `
        float dmsFacing = abs(dot(normalize(normal), normalize(vViewPosition)));
        float dmsFresnel = pow(clamp(1.0 - dmsFacing, 0.0, 1.0), 2.15);
        float dmsGrazingLine = smoothstep(0.34, 0.92, dmsFresnel);
        outgoingLight += vec3(0.48, 0.86, 1.0) * dmsFresnel * 0.36;
        outgoingLight += vec3(1.0, 1.0, 1.0) * dmsGrazingLine * 0.18;
        outgoingLight += vec3(0.90, 0.98, 1.0) * 0.020;
        diffuseColor.a *= 0.50 + dmsFresnel * 0.30;
        #include <output_fragment>
      `)
    }
  }
  material.customProgramCacheKey = function customProgramCacheKey() {
    const previousKey = typeof previousProgramKey === 'function'
      ? previousProgramKey.call(this)
      : ''
    return `${previousKey}|dms-glass-optics-${APP_VERSION}`
  }
  material.userData.dmsGlassOpticsPatched = true
  material.needsUpdate = true
  return material
}

function gpuMotionUniformSetsForGroup(group) {
  const sets = group?.userData?.gpuMotionUniformSets
  if (Array.isArray(sets) && sets.length) return sets
  return group?.userData?.gpuMotionUniforms ? [group.userData.gpuMotionUniforms] : []
}

function applyGpuMotionUniforms(group, uniforms, liveInteractions, timeSeconds) {
  uniforms.uDmsMotionEnabled.value = group.userData.enableGpuMotion ? 1 : 0
  uniforms.uDmsTime.value = timeSeconds
  const dimensions = group.userData.dimensions || {}
  const height = Number(dimensions.height) || DEFAULT_PHYSICAL_HEIGHT
  const width = Math.max(Number(dimensions.width) || Number(dimensions.panelWidth) || 1, 0.001)
  uniforms.uDmsShapeBounds.value.set(width, height, 0, height * 0.5)
  const liquidState = group.userData.liquidPosterState
  uniforms.uDmsShapePolarity.value = liquidState ? clamp(liquidState.polarity, -1, 1) : 0
  uniforms.uDmsShapeFinal.value = liquidState ? clamp(liquidState.final, 0, 1) : 0

  const hitUniforms = [uniforms.uDmsHit0, uniforms.uDmsHit1, uniforms.uDmsHit2]
  const panelValues = [-100, -100, -100]
  for (let index = 0; index < hitUniforms.length; index += 1) {
    const hit = liveInteractions[index]
    if (!hit) {
      hitUniforms[index].value.set(0, 0, 0, 99)
      continue
    }
    hitUniforms[index].value.set(hit.x, hit.y, hit.strength, Math.max(0, timeSeconds - hit.t))
    panelValues[index] = Number(hit.panelIndex ?? 0)
  }
  uniforms.uDmsHitPanels.value.set(panelValues[0], panelValues[1], panelValues[2], -100)
}

function updateGpuMotionUniforms(group, interactions, timeSeconds) {
  const uniformSets = gpuMotionUniformSetsForGroup(group)
  if (!uniformSets.length) return

  const liveInteractions = interactions
    .filter(hit => timeSeconds - hit.t < INTERACTION_LIFETIME)
    .slice(-MAX_ACTIVE_INTERACTIONS)
  interactions.length = 0
  interactions.push(...liveInteractions)

  for (const uniforms of uniformSets) {
    applyGpuMotionUniforms(group, uniforms, liveInteractions, timeSeconds)
  }
}

function createLiquidPosterUniforms(THREE, texture, authorityTexture = null, qualityProfile = QUALITY_PROFILES.high) {
  const image = texture?.image || {}
  return {
    uResolution: { value: new THREE.Vector2(image.width || 1024, image.height || 1024) },
    uTime: { value: 0 },
    uFinal: { value: 0 },
    uPolarity: { value: 0 },
    uPulse: { value: 0 },
    uRipple: { value: 0 },
    uPointer: { value: new THREE.Vector2(0.5, 0.5) },
    uTargetReady: { value: texture?.image ? 1 : 0 },
    uAuthorityTargetReady: { value: authorityTexture?.image ? 1 : 0 },
    uMaterialOpacity: { value: 0.82 },
    uColorBoost: { value: liquidColorBoostForQuality(qualityProfile) },
    uAlphaBoost: { value: liquidAlphaBoostForQuality(qualityProfile) },
    uTarget: { value: texture || null },
    uAuthorityTarget: { value: authorityTexture || texture || null },
  }
}

function createLiquidPosterMaterial(THREE, texture, motionUniforms = null, authorityTexture = null, qualityProfile = QUALITY_PROFILES.high) {
  const uniforms = {
    ...createLiquidPosterUniforms(THREE, texture, authorityTexture, qualityProfile),
    ...(motionUniforms || {}),
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    defines: qualityShaderDefines(qualityProfile),
    vertexShader: motionUniforms ? DMS_LIQUID_GPU_VERTEX_SHADER : DMS_LIQUID_VERTEX_SHADER,
    fragmentShader: DMS_LIQUID_FRAGMENT_SHADER,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  material.userData.liquidUniforms = uniforms
  return material
}

function createLiquidTextureMaterial(THREE, texture, motionUniforms = null) {
  const uniforms = {
    uLiquidTexture: { value: texture },
    uTextureOpacity: { value: liquidTextureOpacity() },
    uTextureExposure: { value: liquidTextureExposure() },
    uTextureHighlightLimit: { value: liquidTextureHighlightLimit() },
    ...(motionUniforms || {}),
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: motionUniforms ? DMS_LIQUID_TEXTURE_GPU_VERTEX_SHADER : DMS_LIQUID_VERTEX_SHADER,
    fragmentShader: DMS_LIQUID_TEXTURE_FRAGMENT_SHADER,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  material.userData.liquidTextureUniforms = uniforms
  return material
}

function createSolidGpuMaterial(THREE, color, opacity, motionUniforms = null) {
  const uniforms = {
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    ...(motionUniforms || {}),
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: motionUniforms ? DMS_SOLID_GPU_VERTEX_SHADER : DMS_SOLID_VERTEX_SHADER,
    fragmentShader: DMS_SOLID_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
  material.userData.baseOpacity = opacity
  return material
}

function createLiquidRenderTargetState(THREE, texture, authorityTexture, qualityProfile) {
  const image = texture?.image || {}
  const sourceAspect = image.width && image.height ? image.width / image.height : 0.8
  const height = Math.max(384, Math.round(qualityProfile.liquidTargetHeight || 1024))
  const width = Math.max(320, Math.round(height * sourceAspect))
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  })
  target.texture.name = `DMS_Liquid_${qualityProfile.name}_${width}x${height}`
  target.texture.generateMipmaps = false

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = createLiquidPosterMaterial(THREE, texture, null, authorityTexture, qualityProfile)
  material.transparent = false
  material.blending = THREE.NoBlending
  material.depthWrite = false
  material.needsUpdate = true
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  scene.add(mesh)

  return {
    target,
    scene,
    camera,
    geometry,
    material,
    uniforms: material.userData.liquidUniforms,
    width,
    height,
    frameInterval: 1 / Math.max(1, qualityProfile.liquidFps || 60),
    lastRender: -Infinity,
    renderedOnce: false,
  }
}

function textureIsReady(texture) {
  const image = texture?.image
  return Boolean(
    texture?.userData?.dmsLoaded ||
    (image && Number(image.width) > 0 && Number(image.height) > 0),
  )
}

function syncLiquidRenderTargetUniforms(item) {
  const uniforms = item?.uniforms
  if (!uniforms) return

  const targetTexture = uniforms.uTarget?.value
  const authorityTexture = uniforms.uAuthorityTarget?.value
  const targetReady = textureIsReady(targetTexture) ? 1 : 0
  const authorityReady = textureIsReady(authorityTexture) ? 1 : 0
  const targetImage = targetTexture?.image || {}
  let changed = false

  if (uniforms.uTargetReady && uniforms.uTargetReady.value !== targetReady) {
    uniforms.uTargetReady.value = targetReady
    changed = true
  }
  if (uniforms.uAuthorityTargetReady && uniforms.uAuthorityTargetReady.value !== authorityReady) {
    uniforms.uAuthorityTargetReady.value = authorityReady
    changed = true
  }
  if (
    targetReady &&
    uniforms.uResolution?.value &&
    Number(targetImage.width) > 0 &&
    Number(targetImage.height) > 0 &&
    (uniforms.uResolution.value.x !== targetImage.width || uniforms.uResolution.value.y !== targetImage.height)
  ) {
    uniforms.uResolution.value.set(targetImage.width, targetImage.height)
    changed = true
  }
  if (changed) item.renderedOnce = false
}

function renderLiquidRenderTargets(group, renderer, timeSeconds) {
  const targets = group?.userData?.liquidRenderTargets || []
  if (!renderer || !targets.length) return

  const previousTarget = renderer.getRenderTarget?.() || null
  const previousXrEnabled = renderer.xr ? renderer.xr.enabled : null
  const previousAutoClear = renderer.autoClear

  if (renderer.xr) renderer.xr.enabled = false
  renderer.autoClear = true

  for (const item of targets) {
    syncLiquidRenderTargetUniforms(item)
    if (item.renderedOnce && timeSeconds - item.lastRender < item.frameInterval) continue
    renderer.setRenderTarget(item.target)
    renderer.clear(true, true, true)
    renderer.render(item.scene, item.camera)
    item.lastRender = timeSeconds
    item.renderedOnce = true
  }

  renderer.setRenderTarget(previousTarget)
  renderer.autoClear = previousAutoClear
  if (renderer.xr && previousXrEnabled !== null) renderer.xr.enabled = previousXrEnabled
}

function updateRenderPerformanceState(sceneEl, group, timeSeconds) {
  if (!sceneEl?.renderer || !group) return
  const perf = group.userData.perfState || {
    lastSample: timeSeconds,
    frames: 0,
    fps: 0,
  }
  group.userData.perfState = perf
  perf.frames += 1

  const elapsed = timeSeconds - perf.lastSample
  if (elapsed < 0.5) return

  const rendererInfo = sceneEl.renderer.info || {}
  const renderInfo = rendererInfo.render || {}
  const memoryInfo = rendererInfo.memory || {}
  perf.fps = perf.frames / Math.max(elapsed, 0.001)
  perf.frames = 0
  perf.lastSample = timeSeconds

  arStatus.dmsFps = perf.fps
  arStatus.dmsDrawCalls = Number(renderInfo.calls) || 0
  arStatus.dmsTriangles = Number(renderInfo.triangles) || 0
  arStatus.dmsTextures = Number(memoryInfo.textures) || 0
  window.__dmsPerf = {
    version: APP_VERSION,
    quality: group.userData.qualityProfile?.name || 'auto',
    fps: Number(perf.fps.toFixed(1)),
    drawCalls: arStatus.dmsDrawCalls,
    triangles: arStatus.dmsTriangles,
    textures: arStatus.dmsTextures,
    liquidTargets: (group.userData.liquidRenderTargets || []).map(target => ({
      width: target.width,
      height: target.height,
      fps: Math.round(1 / target.frameInterval),
    })),
  }

  if (isArDebugEnabled()) renderArStatus()
}

function disposeLiquidRenderTargets(group) {
  const targets = group?.userData?.liquidRenderTargets || []
  for (const item of targets) {
    item.geometry?.dispose?.()
    item.material?.dispose?.()
    item.target?.dispose?.()
  }
  targets.length = 0
}

function disposeTextLayer(group) {
  const textLayer = group?.userData?.textLayer
  if (!textLayer) return
  textLayer.texture?.dispose?.()
  textLayer.mesh?.geometry?.dispose?.()
  textLayer.mesh?.material?.dispose?.()
  group.userData.textLayer = null
}

function createLiquidPosterState() {
  return {
    final: 0,
    targetFinal: 0,
    polarity: 0,
    targetPolarity: 0,
    pulse: 0,
    ripple: 0,
    pointerX: 0.5,
    pointerY: 0.5,
    lastUpdateTime: 0,
  }
}

function updateLiquidPosterEffect(group, timeSeconds) {
  const state = group?.userData?.liquidPosterState
  const uniformsList = group?.userData?.liquidPosterUniforms || []
  if (!state || !uniformsList.length) return

  const previousTime = Number(state.lastUpdateTime) || timeSeconds
  const dt = clamp(timeSeconds - previousTime, 0, 0.08)
  state.lastUpdateTime = timeSeconds
  const frameScale = dt * 60
  state.final += (state.targetFinal - state.final) * (1 - Math.pow(0.982, frameScale))
  state.polarity += (state.targetPolarity - state.polarity) * (1 - Math.pow(0.972, frameScale))
  state.pulse *= Math.pow(0.965, frameScale)
  state.ripple *= Math.pow(0.952, frameScale)

  for (const uniforms of uniformsList) {
    const texture = uniforms.uTarget.value
    const authorityTexture = uniforms.uAuthorityTarget.value
    const image = texture?.image
    const authorityImage = authorityTexture?.image
    uniforms.uTime.value = timeSeconds
    uniforms.uFinal.value = state.final
    uniforms.uPolarity.value = state.polarity
    uniforms.uPulse.value = state.pulse
    uniforms.uRipple.value = state.ripple
    uniforms.uPointer.value.set(state.pointerX, state.pointerY)
    uniforms.uTargetReady.value = image ? 1 : 0
    uniforms.uAuthorityTargetReady.value = authorityImage ? 1 : 0
    if (image?.width && image?.height) uniforms.uResolution.value.set(image.width, image.height)
  }
}

function panelUvForLocalPoint(group, x, y, panelIndex) {
  const panel = panelStateForIndex(group, panelIndex)
  const dimensions = group.userData.dimensions || { height: DEFAULT_PHYSICAL_HEIGHT }
  if (!panel) return { x: 0.5, y: 0.5 }
  return {
    x: clamp((x - (panel.centerX - panel.width * 0.5)) / Math.max(0.001, panel.width), 0, 1),
    y: clamp(y / Math.max(0.001, dimensions.height), 0, 1),
  }
}

function driveLiquidPosterEffect(group, x, y, strength, panelIndex, mode = 'blue') {
  const state = group?.userData?.liquidPosterState
  if (!state) return
  const uv = panelUvForLocalPoint(group, x, y, panelIndex)
  const normalizedStrength = clamp(Number(strength) || 1, 0.25, 2)
  const coupling = clamp(Number(group.userData.liquidShockCoupling ?? 1), 0, 2)
  state.pointerX = uv.x
  state.pointerY = uv.y
  state.ripple = Math.min(2.15, state.ripple + 0.82 * normalizedStrength * coupling)
  state.pulse = Math.max(state.pulse, 0.58 * normalizedStrength * coupling)
  const direction = mode === 'orange' ? -1 : 1
  state.targetPolarity = clamp(
    state.targetPolarity * CHOICE_POLARITY_MEMORY +
    direction * CHOICE_POLARITY_STEP +
    (uv.x - 0.5) * CHOICE_POINTER_BIAS,
    -1,
    1,
  )
  state.targetFinal = clamp(state.targetFinal + normalizedStrength * CHOICE_FINAL_STEP, 0, 1)
}

function resetLiquidPosterEffect(group) {
  const state = group?.userData?.liquidPosterState
  if (!state) return
  state.final = 0
  state.targetFinal = 0
  state.polarity = 0
  state.targetPolarity = 0
  state.pulse = 0
  state.ripple = 0
  state.lastUpdateTime = 0
  state.pointerX = 0.5
  state.pointerY = 0.5
}

async function loadVariantData(defaultData) {
  const entries = await Promise.all(
    Object.entries(SHARD_VARIANT_URLS).map(async ([variant, url]) => {
      try {
        return [variant, await fetchJson(url)]
      } catch {
        return [variant, null]
      }
    }),
  )
  const map = new Map(entries.filter(([, data]) => data))
  if (!map.has('impact_star')) map.set('impact_star', defaultData)
  return map
}

function normalizeSeries(series) {
  if (!series?.panels) return series
  return {
    ...series,
    panels: series.panels.map(panel => ({
      ...panel,
      src: normalizeDmsPath(panel.src),
      authoritySrc: normalizeDmsPath(panel.authoritySrc),
    })),
  }
}

function wrapCanvasText(context, text, maxWidth) {
  const paragraphs = String(text || '').split(/\n+/)
  const lines = []
  for (const paragraph of paragraphs) {
    const chars = Array.from(paragraph.trim())
    if (!chars.length) {
      lines.push('')
      continue
    }
    let current = ''
    for (const char of chars) {
      const candidate = `${current}${char}`
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current)
        current = char
      } else {
        current = candidate
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

function createTextLayerObject(THREE, {
  text,
  width,
  height,
  opacity,
  depth,
  motionMix,
  motionUniformOptions,
  panelIndex = 0,
}) {
  if (!text || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1440
  const context = canvas.getContext('2d')
  if (!context) return null

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = 'rgba(245, 252, 255, 0.82)'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '500 58px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
  context.shadowColor = 'rgba(33, 92, 160, 0.24)'
  context.shadowBlur = 18
  const lines = wrapCanvasText(context, text, canvas.width * 0.70).slice(0, 8)
  const lineHeight = 76
  const firstY = canvas.height * 0.50 - ((lines.length - 1) * lineHeight) * 0.5
  lines.forEach((line, index) => {
    context.fillText(line, canvas.width * 0.5, firstY + index * lineHeight)
  })

  const texture = new THREE.CanvasTexture(canvas)
  applyTextureColorSpace(THREE, texture)
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const textWidth = width * 0.72
  const textHeight = height * 0.58
  const geometry = new THREE.PlaneGeometry(textWidth, textHeight, 1, 1)
  geometry.translate(0, height * 0.5, depth)
  assignGpuMotionAttributes(
    THREE,
    geometry,
    new THREE.Vector2(0, height * 0.5),
    0.527,
    panelIndex,
  )

  const motionUniforms = motionMix > 0
    ? createGpuMotionUniforms(THREE, { ...motionUniformOptions, motionMix })
    : null
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    color: 0xffffff,
  })
  if (motionUniforms) attachGpuMotionToMaterial(material, motionUniforms)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'DMS_TextLayer'
  mesh.renderOrder = 6
  mesh.frustumCulled = false
  mesh.userData.dmsTextTexture = texture
  return { mesh, motionUniforms, texture }
}

function buildMirrorGroup(THREE, data, series = null, variantDataMap = new Map(), options = {}) {
  const group = new THREE.Group()
  group.name = 'DMS_AFrame_8thWall_Shards'

  const layoutScale = Number(options.layoutScale) || DEFAULT_LAYOUT_SCALE
  const requestedPanelLimit = Math.floor(Number(options.panelLimit ?? DEFAULT_PANEL_LIMIT))
  const enableFracture = options.enableFracture === true
  const enableGpuMotion = options.enableGpuMotion !== false && !enableFracture
  const qualityProfile = options.qualityProfile || resolveQualityProfile(options.quality || 'auto')
  const mergeStaticLayers = !enableFracture
  const idleRotationEnabled = options.idleRotationEnabled !== false
  const idleRotationStrength = clamp(Number(options.idleRotationStrength ?? 1), 0, 2)
  const shockAfterglow = clamp(Number(options.shockAfterglow ?? 1), 0, 2)
  const liquidShockCoupling = clamp(Number(options.liquidShockCoupling ?? 1), 0, 2)
  const textLayerEnabled = options.textLayerEnabled === true
  const textLayerText = String(options.textLayerText || '').trim()
  const textLayerOpacity = clamp(Number(options.textLayerOpacity ?? 0.72), 0, 1)
  const textLayerDepth = Number.isFinite(Number(options.textLayerDepth)) ? Number(options.textLayerDepth) : 0.026
  const textLayerMotionMix = clamp(Number(options.textLayerMotionMix ?? 0.35), 0, 1)
  const physicalHeight = (Number(series?.physicalHeightMeters) || DEFAULT_PHYSICAL_HEIGHT) * layoutScale
  const sourcePanelDefs = Array.isArray(series?.panels) && series.panels.length
    ? series.panels
    : [{ id: 'mirror-shards', src: null, variant: 'impact_star' }]
  const panelDefs = requestedPanelLimit > 0
    ? sourcePanelDefs.slice(0, Math.min(sourcePanelDefs.length, requestedPanelLimit))
    : sourcePanelDefs
  const panelLayouts = panelDefs.map((panel) => {
    const panelData = variantDataMap.get(panel.variant || 'impact_star') || data
    const bounds = panelData.bounds
    const modelHeight = bounds.maxY - bounds.minY
    const scale = physicalHeight / (modelHeight * XR_STRETCH_Y)
    const panelWidth = (bounds.maxX - bounds.minX) * XR_STRETCH_X * scale
    return { panel, data: panelData, bounds, scale, width: panelWidth }
  })
  const panelSpacing = streetPanelSpacingForSeries(series) * layoutScale
  const maxPanelWidth = Math.max(...panelLayouts.map(layout => layout.width), 0)
  const totalWidth = panelLayouts.reduce((sum, layout) => sum + layout.width, 0) +
    Math.max(0, panelLayouts.length - 1) * panelSpacing
  let panelCursor = -totalWidth * 0.5
  panelLayouts.forEach((layout) => {
    layout.offsetX = panelCursor + layout.width * 0.5
    layout.height = physicalHeight
    panelCursor += layout.width + panelSpacing
  })
  const textureLoader = new THREE.TextureLoader()
  const textures = new Map()

  const loadPanelTexture = (src) => {
    if (!src) return null
    if (textures.has(src)) return textures.get(src)
    const texture = textureLoader.load(src, loadedTexture => {
      loadedTexture.userData.dmsLoaded = true
      loadedTexture.needsUpdate = true
    })
    texture.userData.dmsLoaded = false
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    applyTextureColorSpace(THREE, texture)
    textures.set(src, texture)
    return texture
  }

  for (const panel of panelDefs) {
    loadPanelTexture(panel.src)
    loadPanelTexture(panel.authoritySrc)
  }

  const glassMaterial = makePhysicalMaterial(THREE, {
    color: 0xdaf8ff,
    metalness: 0.0,
    roughness: 0.045,
    transparent: true,
    opacity: 0.32,
    transmission: 0.68,
    thickness: 0.06,
    ior: 1.46,
    clearcoat: 1.0,
    clearcoatRoughness: 0.018,
    specularIntensity: 1.45,
    specularColor: new THREE.Color(0xeaffff),
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color(0xdffbff),
    emissiveIntensity: 0.008,
  })
  const innerMaterial = new THREE.MeshBasicMaterial({
    color: 0xb7dce6,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x061922,
    transparent: true,
    opacity: 0.76,
  })
  const highlightMaterial = new THREE.LineBasicMaterial({
    color: 0xcdfdff,
    transparent: true,
    opacity: 0.66,
  })

  const shardObjects = []
  const shardMeshes = []
  const liquidPosterUniforms = []
  const sharedLiquidMaterials = new Map()
  const liquidRenderTargets = []
  const mergedLiquidBuckets = new Map()
  const mergedEdgeSegments = []
  const mergedHighlightSegments = []
  const gpuMotionUniforms = enableGpuMotion
    ? createGpuMotionUniforms(THREE, { idleRotationEnabled, idleRotationStrength, shockAfterglow, motionMix: 1 })
    : null
  const gpuMotionUniformSets = gpuMotionUniforms ? [gpuMotionUniforms] : []
  const panelStates = panelLayouts.map((layout, panelIndex) => createPanelState(panelIndex, layout))
  const mergedEdgeMaterial = mergeStaticLayers
    ? createSolidGpuMaterial(THREE, 0x061922, 0.76, gpuMotionUniforms)
    : null
  const mergedHighlightMaterial = mergeStaticLayers
    ? createSolidGpuMaterial(THREE, 0xcdfdff, 0.66, gpuMotionUniforms)
    : null

  const liquidMaterialForPanel = (panel, texture, authorityTexture) => {
    if (!texture) return attachGpuMotionToMaterial(innerMaterial.clone(), gpuMotionUniforms)
    if (enableFracture) return createLiquidPosterMaterial(THREE, texture, null, authorityTexture, qualityProfile)
    const key = `${panel.src || panel.id || 'single-panel'}::${panel.authoritySrc || 'no-authority'}`
    if (!sharedLiquidMaterials.has(key)) {
      const renderTargetState = createLiquidRenderTargetState(THREE, texture, authorityTexture, qualityProfile)
      const material = createLiquidTextureMaterial(THREE, renderTargetState.target.texture, gpuMotionUniforms)
      sharedLiquidMaterials.set(key, material)
      liquidRenderTargets.push(renderTargetState)
      liquidPosterUniforms.push(renderTargetState.uniforms)
    }
    return sharedLiquidMaterials.get(key)
  }

  panelLayouts.forEach((layout, panelIndex) => {
    const { panel, data: panelData, bounds, scale, width: panelWidth } = layout
    const texture = panel.src ? textures.get(panel.src) : null
    const authorityTexture = panel.authoritySrc ? textures.get(panel.authoritySrc) : null

    for (const shard of panelData.shards) {
      const worldPoints = shard.points.map(point => transformPoint(THREE, point, bounds, scale))
      const center = transformPoint(THREE, shard.center, bounds, scale)
      const localPoints = worldPoints.map(point => new THREE.Vector2(point.x - center.x, point.y - center.y))
      if (localPoints.length < 3) continue

      const container = new THREE.Group()
      container.name = `DMS_${panel.id || `Panel_${panelIndex}`}_Shard_${String(shard.index).padStart(3, '0')}`
      const panelCenter = new THREE.Vector2(center.x + layout.offsetX, center.y)
      container.position.set(panelCenter.x, panelCenter.y, shard.depth * 0.035)
      container.userData.basePosition = container.position.clone()
      container.userData.baseQuaternion = container.quaternion.clone()
      container.userData.seed = shard.seed + panelIndex * 0.137
      container.userData.center = panelCenter
      container.userData.panelIndex = panelIndex
      container.userData.motionPhase = container.userData.seed * Math.PI * 2
      container.userData.tangentX = Math.cos(container.userData.motionPhase)
      container.userData.tangentY = Math.sin(container.userData.motionPhase)
      container.userData.idlePhaseA = container.userData.seed * 24
      container.userData.idlePhaseB = container.userData.seed * 11
      container.userData.idlePhaseC = container.userData.seed * 18
      container.userData.idlePhaseD = container.userData.seed * 9
      container.userData.lastMotionOpacity = 1

      const glassShrink = 0.940 + stableNoise(shard.seed, 14) * 0.016
      const glassPoints = localPoints.map(point => point.clone().multiplyScalar(glassShrink))
      const shapeGeometry = new THREE.ShapeGeometry(makeShardShape(THREE, glassPoints))
      assignGpuMotionAttributes(THREE, shapeGeometry, panelCenter, container.userData.seed, panelIndex)
      assignGlobalUv(THREE, shapeGeometry, center, { width: panelWidth, height: physicalHeight })
      const meshMaterial = glassMaterial.clone()
      meshMaterial.color.copy(colorForShard(THREE, shard.seed + panelIndex * 0.19))
      meshMaterial.opacity = 0.20 + stableNoise(shard.seed, 7) * 0.045
      meshMaterial.roughness = 0.032 + stableNoise(shard.seed, 9) * 0.032
      attachGlassOpticsToMaterial(meshMaterial)
      attachGpuMotionToMaterial(meshMaterial, gpuMotionUniforms)

      const mesh = new THREE.Mesh(shapeGeometry, meshMaterial)
      mesh.name = `${container.name}_Glass`
      mesh.renderOrder = 2
      mesh.userData.shardContainer = container
      container.add(mesh)
      container.userData.hitMesh = mesh
      shardMeshes.push(mesh)

      const innerPoints = localPoints.map(point => point.clone().multiplyScalar(texture ? 0.93 : 0.72 + stableNoise(shard.seed, 12) * 0.08))
      const panelMaterial = liquidMaterialForPanel(panel, texture, authorityTexture)
      if (enableFracture && panelMaterial.userData?.liquidUniforms) {
        liquidPosterUniforms.push(panelMaterial.userData.liquidUniforms)
      }

      if (mergeStaticLayers) {
        const uvOffset = new THREE.Vector2(-layout.offsetX, 0)
        const innerWorldPoints = innerPoints.map(point => new THREE.Vector2(
          point.x + panelCenter.x,
          point.y + panelCenter.y,
        ))
        const innerGeometry = new THREE.ShapeGeometry(makeShardShape(THREE, innerWorldPoints))
        innerGeometry.translate(0, 0, shard.depth * 0.035 + 0.003)
        assignGpuMotionAttributes(THREE, innerGeometry, panelCenter, container.userData.seed, panelIndex)
        assignGlobalUv(THREE, innerGeometry, uvOffset, { width: panelWidth, height: physicalHeight })
        const bucketKey = panelMaterial.uuid || `${panel.id || panelIndex}-liquid`
        if (!mergedLiquidBuckets.has(bucketKey)) {
          mergedLiquidBuckets.set(bucketKey, { material: panelMaterial, geometries: [] })
        }
        mergedLiquidBuckets.get(bucketKey).geometries.push(innerGeometry)

        mergedEdgeSegments.push({
          center: panelCenter,
          seed: container.userData.seed,
          panelIndex,
          points: glassPoints.map(point => new THREE.Vector3(
            point.x + panelCenter.x,
            point.y + panelCenter.y,
            shard.depth * 0.035 + 0.006,
          )),
        })
        mergedHighlightSegments.push({
          center: panelCenter,
          seed: container.userData.seed,
          panelIndex,
          points: innerPoints.map(point => new THREE.Vector3(
            point.x + panelCenter.x,
            point.y + panelCenter.y,
            shard.depth * 0.035 + 0.008,
          )),
        })
      } else {
        const innerGeometry = new THREE.ShapeGeometry(makeShardShape(THREE, innerPoints))
        assignGpuMotionAttributes(THREE, innerGeometry, panelCenter, container.userData.seed, panelIndex)
        assignGlobalUv(THREE, innerGeometry, center, { width: panelWidth, height: physicalHeight })
        const innerMesh = new THREE.Mesh(innerGeometry, panelMaterial)
        innerMesh.name = `${container.name}_Illustration`
        innerMesh.position.z = 0.003
        container.add(innerMesh)

        const edgePoints = glassPoints.map(point => new THREE.Vector3(point.x, point.y, 0.006))
        edgePoints.push(edgePoints[0].clone())
        const edgeGeometry = new THREE.BufferGeometry().setFromPoints(edgePoints)
        assignGpuMotionAttributes(THREE, edgeGeometry, panelCenter, container.userData.seed, panelIndex)
        const edge = new THREE.Line(edgeGeometry, attachGpuMotionToMaterial(edgeMaterial.clone(), gpuMotionUniforms))
        container.add(edge)

        const highlightPoints = innerPoints.map(point => new THREE.Vector3(point.x, point.y, 0.008))
        highlightPoints.push(highlightPoints[0].clone())
        const highlightGeometry = new THREE.BufferGeometry().setFromPoints(highlightPoints)
        assignGpuMotionAttributes(THREE, highlightGeometry, panelCenter, container.userData.seed, panelIndex)
        const highlight = new THREE.Line(highlightGeometry, attachGpuMotionToMaterial(highlightMaterial.clone(), gpuMotionUniforms))
        container.add(highlight)
      }

      for (const child of container.children) rememberBaseOpacity(child.material)
      group.add(container)
      shardObjects.push(container)
    }
  })

  const mergedLayerObjects = []
  if (mergeStaticLayers) {
    for (const [key, bucket] of mergedLiquidBuckets.entries()) {
      if (!bucket.geometries.length) continue
      const geometry = createMergedBufferGeometry(THREE, bucket.geometries, true)
      const mesh = new THREE.Mesh(geometry, bucket.material)
      mesh.name = `DMS_Merged_Liquid_${key.replace(/[^a-z0-9_-]+/gi, '_')}`
      mesh.frustumCulled = false
      mesh.renderOrder = 1
      group.add(mesh)
      mergedLayerObjects.push(mesh)
    }

    if (mergedEdgeSegments.length && mergedEdgeMaterial) {
      const edgeGeometry = createMergedLineSegmentsGeometry(THREE, mergedEdgeSegments)
      const edge = new THREE.LineSegments(edgeGeometry, mergedEdgeMaterial)
      edge.name = 'DMS_Merged_Edges'
      edge.frustumCulled = false
      edge.renderOrder = 3
      group.add(edge)
      mergedLayerObjects.push(edge)
    }

    if (mergedHighlightSegments.length && mergedHighlightMaterial) {
      const highlightGeometry = createMergedLineSegmentsGeometry(THREE, mergedHighlightSegments)
      const highlight = new THREE.LineSegments(highlightGeometry, mergedHighlightMaterial)
      highlight.name = 'DMS_Merged_Highlights'
      highlight.frustumCulled = false
      highlight.renderOrder = 4
      group.add(highlight)
      mergedLayerObjects.push(highlight)
    }
  }

  const textLayer = textLayerEnabled && textLayerText
    ? createTextLayerObject(THREE, {
      text: textLayerText,
      width: maxPanelWidth || totalWidth || 1,
      height: physicalHeight,
      opacity: textLayerOpacity,
      depth: textLayerDepth,
      motionMix: textLayerMotionMix,
      motionUniformOptions: { idleRotationEnabled, idleRotationStrength, shockAfterglow },
      panelIndex: 0,
    })
    : null
  if (textLayer?.mesh) {
    group.add(textLayer.mesh)
    if (textLayer.motionUniforms) gpuMotionUniformSets.push(textLayer.motionUniforms)
  }

  group.userData.shardObjects = shardObjects
  group.userData.allShardMeshes = shardMeshes
  group.userData.shardMeshes = shardMeshes
  group.userData.mergedLayerObjects = mergedLayerObjects
  group.userData.liquidPosterState = createLiquidPosterState()
  group.userData.liquidPosterUniforms = liquidPosterUniforms
  group.userData.liquidRenderTargets = liquidRenderTargets
  group.userData.panelStates = panelStates
  group.userData.panelCount = panelLayouts.length
  group.userData.currentPanelIndex = 0
  group.userData.targetPanelIndex = 0
  group.userData.enableFracture = enableFracture
  group.userData.enableGpuMotion = enableGpuMotion
  group.userData.qualityProfile = qualityProfile
  group.userData.gpuMotionUniforms = gpuMotionUniforms
  group.userData.gpuMotionUniformSets = gpuMotionUniformSets
  group.userData.textLayer = textLayer || null
  group.userData.liquidShockCoupling = liquidShockCoupling
  group.userData.idleRotationEnabled = idleRotationEnabled
  group.userData.idleRotationStrength = idleRotationStrength
  group.userData.shockAfterglow = shockAfterglow
  group.userData.layoutScale = layoutScale
  group.userData.dimensions = { height: physicalHeight, width: totalWidth, panelWidth: maxPanelWidth }
  group.userData.streetInstallation = series?.streetInstallation || null
  group.userData.streetPanelSpacingMeters = panelSpacing
  group.userData.animationMode = enableFracture
    ? `${panelDefs.length}-panel-camera-targeted-stress-fracture`
    : `${panelDefs.length}-panel-liquid-shock-${enableGpuMotion ? 'gpu' : 'cpu'}-no-fracture`
  setAllPanelsVisible(group)
  return group
}

function zeroMotion() {
  return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, opacity: 1 }
}

function randomButtonStrength(detail = {}) {
  const requested = Number(detail.strength)
  if (Number.isFinite(requested) && requested > 0) return requested
  return BUTTON_RANDOM_MIN + Math.random() * (BUTTON_RANDOM_MAX - BUTTON_RANDOM_MIN)
}

function randomStrongButtonStrength() {
  return STRONG_BUTTON_RANDOM_MIN + Math.random() * (STRONG_BUTTON_RANDOM_MAX - STRONG_BUTTON_RANDOM_MIN)
}

function updatePanelStress(group, now) {
  const fractureEnabled = group.userData.enableFracture === true
  for (const state of group.userData.panelStates || []) {
    const delta = state.lastUpdate ? Math.max(0, now - state.lastUpdate) : 0
    state.lastUpdate = now

    if (state.mode === 'stable' || !fractureEnabled) {
      state.stress = Math.max(0, state.stress - STRESS_DECAY_PER_SECOND * delta)
      if (!fractureEnabled) {
        state.mode = 'stable'
        state.breakAt = Infinity
        state.breakStart = Infinity
      }
      continue
    }

    if (state.mode === 'charging' && now >= state.breakAt) {
      state.mode = 'falling'
      state.breakStart = now
      state.stress = BREAK_THRESHOLD
      continue
    }

    if (state.mode === 'falling' && now - state.breakStart >= BREAK_TOTAL_SECONDS) {
      state.mode = 'stable'
      state.stress = 0
      state.breakAt = Infinity
      state.breakStart = Infinity
    }
  }
}

function triggerPanelStress(group, panelIndex, x, y, strength, now) {
  const state = panelStateForIndex(group, panelIndex)
  if (!state) return
  const fractureEnabled = group.userData.enableFracture === true
  state.originX = x
  state.originY = y
  state.lastHit = now
  state.lastStrength = strength
  group.userData.currentPanelIndex = panelIndex
  group.userData.targetPanelIndex = panelIndex

  if (fractureEnabled && state.mode === 'falling') return

  const stressLimit = fractureEnabled ? BREAK_THRESHOLD * 1.45 : BREAK_THRESHOLD * 0.72
  state.stress = clamp(state.stress + strength, 0, stressLimit)
  if (!fractureEnabled) {
    state.mode = 'stable'
    state.breakAt = Infinity
    state.breakStart = Infinity
    return
  }
  if (state.stress >= BREAK_THRESHOLD && state.mode !== 'charging') {
    state.mode = 'charging'
    state.breakAt = now + BREAK_DELAY_SECONDS
  }
}

function panelFractureMotionForShard(group, shard, now) {
  if (group.userData.enableFracture !== true) return zeroMotion()
  const state = panelStateForIndex(group, shard.userData.panelIndex)
  if (!state || state.mode !== 'falling') return zeroMotion()

  const elapsed = now - state.breakStart
  let amount = 0
  if (elapsed <= BREAK_FALL_SECONDS) {
    amount = easeSmooth(elapsed / BREAK_FALL_SECONDS)
  } else if (elapsed <= BREAK_FALL_SECONDS + BREAK_HOLD_SECONDS) {
    amount = 1
  } else if (elapsed <= BREAK_TOTAL_SECONDS) {
    const recover = (elapsed - BREAK_FALL_SECONDS - BREAK_HOLD_SECONDS) / BREAK_RECOVER_SECONDS
    amount = 1 - easeSmooth(recover)
  }

  const center = shard.userData.center
  const dimensions = group.userData.dimensions || { height: DEFAULT_PHYSICAL_HEIGHT, width: 1.2 }
  const dx = center.x - state.originX
  const dy = center.y - state.originY
  const dist = Math.max(0.001, Math.hypot(dx, dy))
  const delay = stableNoise(shard.userData.seed, 41) * 0.24 + dist * 0.08
  const delayedAmount = easeSmooth(clamp((amount - delay * 0.28) / 0.92, 0, 1))
  const outward = 0.12 + stableNoise(shard.userData.seed, 42) * 0.22
  const sideways = (stableNoise(shard.userData.seed, 44) - 0.5) * 0.12 * delayedAmount
  const flutter = Math.sin((elapsed + shard.userData.seed * 3.7) * 7.8) * 0.035 * delayedAmount
  const groundY = -dimensions.height * 0.035
  const fallDistance = Math.max(0.18, center.y - groundY) +
    stableNoise(shard.userData.seed, 43) * dimensions.height * 0.12

  return {
    x: (dx / dist) * outward * delayedAmount + sideways,
    y: (dy / dist) * 0.035 * delayedAmount - fallDistance * delayedAmount + flutter,
    z: delayedAmount * (0.12 + stableNoise(shard.userData.seed, 46) * 0.2),
    rx: (stableNoise(shard.userData.seed, 45) - 0.5) * 1.35 * delayedAmount,
    ry: (stableNoise(shard.userData.seed, 47) - 0.5) * 0.84 * delayedAmount,
    rz: (stableNoise(shard.userData.seed, 48) - 0.5) * 2.65 * delayedAmount,
    opacity: 1,
  }
}

function motionForShard(group, shard, interactions, now) {
  const center = shard.userData.center
  const seed = shard.userData.seed
  const phase = shard.userData.motionPhase ?? seed * Math.PI * 2
  let globalWave = 0
  let localKick = 0
  let localSlide = 0
  let localSpin = 0

  for (const hit of interactions) {
    if (hit.panelIndex !== undefined && hit.panelIndex !== shard.userData.panelIndex) continue
    const age = now - hit.t
    if (age < 0 || age > INTERACTION_LIFETIME) continue

    const dx = center.x - hit.x
    const dy = center.y - hit.y
    const distSq = dx * dx + dy * dy
    const dist = Math.sqrt(distSq)
    const spatialFalloff = 1 / (1 + dist * 2.3 + distSq * 1.35)
    const waveAge = age - dist * 0.045
    if (waveAge > 0) {
      const timeFalloff = Math.max(0, 1 - waveAge * 0.52)
      globalWave += Math.sin(waveAge * 10.8 - dist * 4.4) *
        timeFalloff * timeFalloff *
        spatialFalloff *
        hit.strength
    }

    const localAge = age - dist * 0.035
    if (localAge > 0) {
      const localTime = Math.max(0, 1 - localAge * 1.05)
      const falloff = localTime * localTime * spatialFalloff * hit.strength
      localKick += Math.sin(localAge * 18 + phase) * falloff
      localSlide += Math.sin(localAge * 15.5 + phase * 0.73) * falloff
      localSpin += Math.cos(localAge * 16.5 + phase * 1.31) * falloff
    }
  }

  const panelState = panelStateForIndex(group, shard.userData.panelIndex)
  if (panelState && panelState.mode !== 'falling') {
    const stressAge = now - panelState.lastHit
    if (stressAge >= 0 && stressAge < 1.25) {
      const fastDecay = Math.max(0, 1 - stressAge * 0.9)
      const slowDecay = Math.max(0, 1 - stressAge * 0.42)
      const instantKick = Math.cos(stressAge * 34 + seed * 7) *
        fastDecay * fastDecay *
        panelState.lastStrength
      const stressWave = Math.sin(stressAge * 17.5 + seed * 11) *
        slowDecay * slowDecay *
        panelState.stress
      globalWave += instantKick * 0.44
      localKick += instantKick * 0.32
      localSpin += instantKick * 0.22
      globalWave += stressWave * 0.28
      localKick += stressWave * 0.18
      localSpin += stressWave * 0.16
    }
  }

  const coherentBreath = Math.sin(now * 0.46) * 0.006 + Math.sin(now * 0.18 + 1.8) * 0.003
  const idle = Math.sin(now * 0.88 + (shard.userData.idlePhaseA ?? seed * 24)) * 0.003 +
    Math.sin(now * 1.37 + (shard.userData.idlePhaseB ?? seed * 11)) * 0.0014
  const normalOffset = globalWave * 0.055 + localKick * 0.03 + coherentBreath + idle
  const fall = panelFractureMotionForShard(group, shard, now)
  const tangentX = shard.userData.tangentX ?? Math.cos(phase)
  const tangentY = shard.userData.tangentY ?? Math.sin(phase)

  return {
    x: tangentX * localSlide * 0.018 + fall.x,
    y: tangentY * localSlide * 0.018 + fall.y,
    z: normalOffset + fall.z,
    rx: globalWave * 0.035 + localSpin * 0.105 + coherentBreath * 0.18 + fall.rx,
    ry: globalWave * 0.018 + localSpin * 0.045 + Math.sin(now * 0.64 + (shard.userData.idlePhaseC ?? seed * 18)) * 0.005 + fall.ry,
    rz: localSpin * 0.022 + Math.sin(now * 0.52 + (shard.userData.idlePhaseD ?? seed * 9)) * 0.0025 + fall.rz,
    opacity: fall.opacity,
  }
}

function updateShardMotion(group, interactions, timeSeconds) {
  if (group.userData.enableGpuMotion) {
    updatePanelStress(group, timeSeconds)
    updateGpuMotionUniforms(group, interactions, timeSeconds)
    return
  }

  const liveInteractions = interactions
    .filter(hit => timeSeconds - hit.t < INTERACTION_LIFETIME)
    .slice(-MAX_ACTIVE_INTERACTIONS)
  interactions.length = 0
  interactions.push(...liveInteractions)
  updatePanelStress(group, timeSeconds)

  for (const shard of group.userData.shardObjects) {
    if (!shard.visible) continue
    const basePosition = shard.userData.basePosition
    const baseQuaternion = shard.userData.baseQuaternion
    const motion = motionForShard(group, shard, interactions, timeSeconds)
    shard.position.set(basePosition.x + motion.x, basePosition.y + motion.y, basePosition.z + motion.z)
    shard.quaternion.copy(baseQuaternion)
    shard.rotateX(motion.rx)
    shard.rotateY(motion.ry)
    shard.rotateZ(motion.rz)
    if (motion.opacity !== 1 || shard.userData.lastMotionOpacity !== 1) {
      setShardOpacity(shard, motion.opacity)
      shard.userData.lastMotionOpacity = motion.opacity
    }
  }
}

function faceEntityTowardCamera(el) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !el?.object3D) return
  cameraObject.updateMatrixWorld?.(true)
  el.object3D.updateMatrixWorld(true)
  const entityPosition = new THREE.Vector3().setFromMatrixPosition(el.object3D.matrixWorld)
  const cameraPosition = new THREE.Vector3().setFromMatrixPosition(cameraObject.matrixWorld)
  const direction = cameraPosition.sub(entityPosition)
  el.object3D.rotation.y = Math.atan2(direction.x, direction.z)
}

function faceEntityTowardWorldPoint(el, worldPoint) {
  const THREE = getThree()
  if (!THREE || !el?.object3D || !worldPoint) return
  el.object3D.updateMatrixWorld(true)
  const entityPosition = new THREE.Vector3().setFromMatrixPosition(el.object3D.matrixWorld)
  const direction = worldPoint.clone().sub(entityPosition)
  direction.y = 0
  if (direction.lengthSq() < 0.0001) return
  direction.normalize()
  el.object3D.rotation.y = Math.atan2(direction.x, direction.z)
}

function getCameraObject() {
  const cameraEl = document.querySelector('#camera')
  return cameraEl?.getObject3D?.('camera') || cameraEl?.object3DMap?.camera || cameraEl?.object3D || null
}

function placeEntityInFrontOfCamera(el, distance, groundY) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !el?.object3D) return false

  cameraObject.updateMatrixWorld?.(true)
  el.object3D.parent?.updateMatrixWorld?.(true)

  const cameraPosition = new THREE.Vector3()
  const cameraDirection = new THREE.Vector3()
  cameraObject.getWorldPosition(cameraPosition)
  cameraObject.getWorldDirection(cameraDirection)
  cameraDirection.y = 0
  if (cameraDirection.lengthSq() < 0.0001) cameraDirection.set(0, 0, -1)
  cameraDirection.normalize()

  const targetWorld = cameraPosition.clone().addScaledVector(cameraDirection, Math.max(0.8, Number(distance) || 4.6))
  targetWorld.y = Number.isFinite(Number(groundY)) ? Number(groundY) : el.object3D.position.y

  const targetLocal = targetWorld.clone()
  if (el.object3D.parent) el.object3D.parent.worldToLocal(targetLocal)
  el.object3D.position.copy(targetLocal)
  el.object3D.visible = true
  el.setAttribute('visible', true)
  el.object3D.updateMatrixWorld(true)
  faceEntityTowardCamera(el)
  return true
}

function placeEntityFromTrackedSceneCamera(el, distance, groundY) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !el?.object3D) return false

  cameraObject.updateMatrixWorld?.(true)
  el.object3D.parent?.updateMatrixWorld?.(true)

  const cameraPosition = new THREE.Vector3()
  const cameraDirection = new THREE.Vector3()
  cameraObject.getWorldPosition(cameraPosition)
  cameraObject.getWorldDirection(cameraDirection)
  cameraDirection.y = 0
  if (cameraDirection.lengthSq() < 0.0001) cameraDirection.set(0, 0, -1)
  cameraDirection.normalize()

  const targetWorld = cameraPosition.clone().addScaledVector(cameraDirection, Math.max(1.2, Number(distance) || 3.0))
  targetWorld.y = Number.isFinite(Number(groundY)) ? Number(groundY) : targetWorld.y

  const targetLocal = targetWorld.clone()
  if (el.object3D.parent) el.object3D.parent.worldToLocal(targetLocal)
  el.object3D.position.copy(targetLocal)
  el.object3D.visible = true
  el.setAttribute('visible', true)
  el.object3D.updateMatrixWorld(true)
  faceEntityTowardWorldPoint(el, cameraPosition)
  return true
}

function cameraCenterGroundHit(THREE, minDistance, maxDistance, groundY) {
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject) return { point: null, reason: 'no-camera' }

  cameraObject.updateMatrixWorld?.(true)
  const floorY = Number.isFinite(Number(groundY)) ? Number(groundY) : 0.04
  const { origin, direction } = cameraRayForPointer(THREE, cameraObject, null)

  if (Math.abs(direction.y) <= 0.035) {
    return { point: null, reason: 'tilt-down' }
  }

  const rayDistance = (floorY - origin.y) / direction.y
  const min = Math.max(0.5, Number(minDistance) || 1.2)
  const max = Math.max(min + 0.5, Number(maxDistance) || 5.2)
  if (rayDistance < min) return { point: null, reason: 'too-close' }
  if (rayDistance > max) return { point: null, reason: 'too-far' }

  const point = origin.clone().addScaledVector(direction, rayDistance)
  point.y = floorY
  return { point, reason: 'floor-hit', distance: rayDistance }
}

function averageWorldPoints(THREE, points) {
  const result = new THREE.Vector3()
  for (const point of points) result.add(point)
  return result.multiplyScalar(1 / Math.max(1, points.length))
}

function placementRadiusAround(point, samples) {
  if (!point || !samples?.length) return Infinity
  return Math.max(...samples.map(sample => sample.distanceTo(point)))
}

function placeEntityAtWorldPointFacingCamera(el, worldPoint, groundY) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !el?.object3D || !worldPoint) return false

  cameraObject.updateMatrixWorld?.(true)
  el.object3D.parent?.updateMatrixWorld?.(true)

  const targetWorld = worldPoint.clone()
  if (Number.isFinite(Number(groundY))) targetWorld.y = Number(groundY)
  const targetLocal = targetWorld.clone()
  if (el.object3D.parent) el.object3D.parent.worldToLocal(targetLocal)

  const cameraPosition = new THREE.Vector3()
  cameraObject.getWorldPosition(cameraPosition)
  el.object3D.position.copy(targetLocal)
  el.object3D.visible = true
  el.setAttribute('visible', true)
  el.object3D.updateMatrixWorld(true)
  faceEntityTowardWorldPoint(el, cameraPosition)
  return true
}

function worldPositionForObject(THREE, object3D) {
  if (!THREE || !object3D) return null
  object3D.updateMatrixWorld?.(true)
  return new THREE.Vector3().setFromMatrixPosition(object3D.matrixWorld)
}

function cameraDistanceToWorldPoint(THREE, worldPoint) {
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !worldPoint) return 0
  cameraObject.updateMatrixWorld?.(true)
  const cameraPosition = worldPositionForObject(THREE, cameraObject)
  return cameraPosition ? cameraPosition.distanceTo(worldPoint) : 0
}

function screenProjectionForWorldPoint(THREE, worldPoint) {
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject?.isCamera || !worldPoint) return null
  cameraObject.updateMatrixWorld?.(true)
  cameraObject.updateProjectionMatrix?.()
  const projected = worldPoint.clone().project(cameraObject)
  if (![projected.x, projected.y, projected.z].every(Number.isFinite)) return null
  return { x: projected.x, y: projected.y, z: projected.z }
}

function screenStatus(point) {
  if (!point) return 'n/a'
  return `${point.x.toFixed(2)},${point.y.toFixed(2)},${point.z.toFixed(2)}`
}

function screenDistance(a, b) {
  if (!a || !b) return 0
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function sceneUsesXrWeb() {
  return Boolean(document.querySelector('a-scene[xrweb]'))
}

function registerDmsWorldRoomAnchor() {
  if (!window.AFRAME || window.AFRAME.components['dms-world-room-anchor']) return

  window.AFRAME.registerComponent('dms-world-room-anchor', {
    schema: {
      autoPlace: { default: true },
      distance: { default: 2.55 },
      groundY: { default: 0.04 },
      placementDelayMs: { default: 1200 },
      retryIntervalMs: { default: 240 },
      maxRetries: { default: 24 },
      minCameraTravelBeforePlace: { default: 0.08 },
      minXrPoseTravelBeforePlace: { default: 0.18 },
      maxXrPoseAgeMs: { default: 700 },
      requireXrWorldPose: { default: true },
      requireSceneCameraMotion: { default: true },
      placementMode: { default: 'floor-ray' },
      minPlacementDistance: { default: 1.2 },
      maxPlacementDistance: { default: 5.2 },
      stablePlacementSamples: { default: 12 },
      stablePlacementRadius: { default: 0.16 },
      waitForRealityReady: { default: true },
      waitForTrackingNormal: { default: true },
    },

    init() {
      const THREE = getThree()
      this.placed = false
      this.realityReady = false
      this.trackingStatus = 'unknown'
      this.trackingReason = ''
      this.cameraOrigin = THREE ? new THREE.Vector3() : null
      this.cameraCurrent = THREE ? new THREE.Vector3() : null
      this.hasCameraOrigin = false
      this.cameraTravel = 0
      this.xrPose = dmsWorldPoseState.latest || null
      this.xrPoseTravel = this.xrPose?.travel || 0
      this.placementSamples = []
      this.placementCandidate = null
      this.placementCandidateReason = 'waiting'
      this.placementCandidateRadius = Infinity
      this.lockedWorldPosition = null
      this.lockedScreenPosition = null
      this.lockedCameraDistance = 0
      this.lastStatusUpdate = 0
      this.retryCount = 0
      this.timer = null
      this.sceneEl = this.el.sceneEl || document.querySelector('a-scene')
      this.trackingEventNames = ['xrtrackingstatus', 'trackingstatus', 'reality.trackingstatus', 'dms-tracking-status']
      this.onRealityReady = this.onRealityReady.bind(this)
      this.onTrackingStatus = this.onTrackingStatus.bind(this)
      this.onXrPose = this.onXrPose.bind(this)
      this.onReplace = this.onReplace.bind(this)
      this.tryPlace = this.tryPlace.bind(this)

      this.el.object3D.visible = false
      this.el.dataset.dmsAnchorLocked = 'false'
      this.el.dataset.dmsAnchorMode = 'waiting-for-world'

      window.addEventListener('realityready', this.onRealityReady)
      this.sceneEl?.addEventListener('realityready', this.onRealityReady)
      window.addEventListener('dms-replace-world', this.onReplace)
      this.trackingEventNames.forEach((eventName) => {
        window.addEventListener(eventName, this.onTrackingStatus)
        this.sceneEl?.addEventListener(eventName, this.onTrackingStatus)
      })
      window.addEventListener('dms-xr-pose', this.onXrPose)

      setArStatus({
        targetName: 'world',
        targetState: 'world',
        anchorState: this.initialAnchorState(),
        anchorScale: 1,
        message: 'Starting AR world tracking...',
        hideStatus: false,
      })

      if (this.data.autoPlace && this.canPlaceNow()) {
        this.schedulePlace(this.data.placementDelayMs)
      }
    },

    remove() {
      if (this.timer) window.clearTimeout(this.timer)
      window.removeEventListener('realityready', this.onRealityReady)
      this.sceneEl?.removeEventListener('realityready', this.onRealityReady)
      window.removeEventListener('dms-replace-world', this.onReplace)
      this.trackingEventNames.forEach((eventName) => {
        window.removeEventListener(eventName, this.onTrackingStatus)
        this.sceneEl?.removeEventListener(eventName, this.onTrackingStatus)
      })
      window.removeEventListener('dms-xr-pose', this.onXrPose)
    },

    initialAnchorState() {
      if (this.data.waitForRealityReady && sceneUsesXrWeb()) return 'waiting-for-reality'
      if (this.data.waitForTrackingNormal && sceneUsesXrWeb()) return 'waiting-for-tracking'
      return 'placing'
    },

    isTrackingNormal() {
      return String(this.trackingStatus || '').toUpperCase() === 'NORMAL'
    },

    updateXrPoseStatus() {
      const pose = this.xrPose || dmsWorldPoseState.latest
      const now = performance.now()
      const ageMs = pose?.timestamp ? Math.max(0, now - pose.timestamp) : Infinity
      arStatus.xrPoseSource = pose?.source || 'none'
      arStatus.xrPosePosition = pose ? plainVectorStatus(pose.position) : 'n/a'
      arStatus.xrPoseTravel = Number(pose?.travel) || 0
      arStatus.xrPoseSamples = Number(pose?.sampleCount) || 0
      arStatus.xrPoseAgeMs = Number.isFinite(ageMs) ? ageMs : 0
    },

    updateCameraTravel() {
      const cameraObject = getCameraObject()
      if (!cameraObject || !this.cameraCurrent || !this.cameraOrigin) return this.cameraTravel
      cameraObject.updateMatrixWorld?.(true)
      cameraObject.getWorldPosition(this.cameraCurrent)
      if (!this.hasCameraOrigin) {
        this.cameraOrigin.copy(this.cameraCurrent)
        this.hasCameraOrigin = true
        this.cameraTravel = 0
        return this.cameraTravel
      }
      this.cameraTravel = this.cameraOrigin.distanceTo(this.cameraCurrent)
      return this.cameraTravel
    },

    hasCameraMotionSignal() {
      const minTravel = Math.max(0, Number(this.data.minCameraTravelBeforePlace) || 0)
      return minTravel <= 0 || this.updateCameraTravel() >= minTravel
    },

    hasFreshXrPose() {
      const pose = this.xrPose || dmsWorldPoseState.latest
      if (!pose?.position || !pose?.rotation) return false
      const ageMs = performance.now() - Number(pose.timestamp || 0)
      return Number.isFinite(ageMs) && ageMs <= Math.max(120, Number(this.data.maxXrPoseAgeMs) || 700)
    },

    hasTrustedXrPoseMotion() {
      if (!this.hasFreshXrPose()) return false
      const pose = this.xrPose || dmsWorldPoseState.latest
      const minTravel = Math.max(0.02, Number(this.data.minXrPoseTravelBeforePlace) || 0.12)
      return Number(pose.travel) >= minTravel && Number(pose.sampleCount) >= 4
    },

    hasWorldTrackingSignal() {
      if (sceneUsesXrWeb() && this.data.requireXrWorldPose) {
        const hasXrPoseMotion = this.hasTrustedXrPoseMotion()
        const hasSceneCameraMotion = !this.data.requireSceneCameraMotion || this.hasCameraMotionSignal()
        return hasXrPoseMotion && hasSceneCameraMotion
      }
      return this.isTrackingNormal() || this.hasCameraMotionSignal()
    },

    updatePlacementCandidate() {
      if (this.data.placementMode !== 'floor-ray' || !sceneUsesXrWeb()) {
        arStatus.placementCandidate = 'not-required'
        arStatus.placementStability = 'ready'
        return true
      }

      const THREE = getThree()
      if (!THREE) return false
      const hit = cameraCenterGroundHit(
        THREE,
        this.data.minPlacementDistance,
        this.data.maxPlacementDistance,
        this.data.groundY,
      )

      this.placementCandidateReason = hit.reason || 'unknown'
      if (!hit.point) {
        this.placementSamples.length = 0
        this.placementCandidate = null
        this.placementCandidateRadius = Infinity
        arStatus.placementCandidate = this.placementCandidateReason
        arStatus.placementStability = `0/${Math.max(1, Number(this.data.stablePlacementSamples) || 12)}`
        return false
      }

      this.placementSamples.push(hit.point.clone())
      const requiredSamples = Math.max(3, Math.round(Number(this.data.stablePlacementSamples) || 12))
      while (this.placementSamples.length > requiredSamples) this.placementSamples.shift()

      const average = averageWorldPoints(THREE, this.placementSamples)
      const radius = placementRadiusAround(average, this.placementSamples)
      this.placementCandidate = {
        point: average,
        distance: hit.distance,
        radius,
      }
      this.placementCandidateRadius = radius
      arStatus.placementCandidate = `${vectorStatus(average)} ${this.placementCandidateReason}`
      arStatus.placementStability = `${this.placementSamples.length}/${requiredSamples} r${radius.toFixed(2)}`
      return this.hasStablePlacementCandidate()
    },

    hasStablePlacementCandidate() {
      if (this.data.placementMode !== 'floor-ray' || !sceneUsesXrWeb()) return true
      const requiredSamples = Math.max(3, Math.round(Number(this.data.stablePlacementSamples) || 12))
      const maxRadius = Math.max(0.03, Number(this.data.stablePlacementRadius) || 0.16)
      return Boolean(this.placementCandidate?.point) &&
        this.placementSamples.length >= requiredSamples &&
        this.placementCandidateRadius <= maxRadius
    },

    waitingMessage() {
      if (!this.hasWorldTrackingSignal()) {
        return 'Move phone 20cm slowly until XR pose and scene camera both move...'
      }
      if (this.data.placementMode === 'floor-ray' && !this.hasStablePlacementCandidate()) {
        if (this.placementCandidateReason === 'tilt-down' || this.placementCandidateReason === 'too-far') {
          return 'Tilt phone slightly down until the center ray hits the floor...'
        }
        if (this.placementCandidateReason === 'too-close') {
          return 'Aim a little farther away on the floor...'
        }
        return 'Hold phone steady while the room anchor point stabilizes...'
      }
      return 'Placing AR installation in room space...'
    },

    pendingAnchorState() {
      if (this.placed) return 'locked'
      if (!this.hasWorldTrackingSignal()) return 'waiting-for-tracking'
      if (this.data.placementMode === 'floor-ray' && !this.hasStablePlacementCandidate()) return 'waiting-for-placement'
      return 'placing'
    },

    updateAnchorLockDiagnostics() {
      const THREE = getThree()
      if (!THREE || !this.el?.object3D) return

      const worldPosition = worldPositionForObject(THREE, this.el.object3D)
      const screenPosition = screenProjectionForWorldPoint(THREE, worldPosition)
      const cameraDistance = cameraDistanceToWorldPoint(THREE, worldPosition)
      const worldDrift = this.lockedWorldPosition && worldPosition
        ? this.lockedWorldPosition.distanceTo(worldPosition)
        : 0
      const screenDelta = this.lockedScreenPosition && screenPosition
        ? screenDistance(this.lockedScreenPosition, screenPosition)
        : 0

      let followSignal = 'waiting'
      if (this.placed) {
        if (worldDrift > 0.06) {
          followSignal = 'anchor-object-moving'
        } else if (this.cameraTravel > 0.35 && screenDelta < 0.035 && Math.abs(cameraDistance - this.lockedCameraDistance) < 0.08) {
          followSignal = 'screen-pinned-check'
        } else {
          followSignal = 'world-lock-ok'
        }
      }

      arStatus.anchorWorldPosition = worldPosition ? vectorStatus(worldPosition) : 'n/a'
      arStatus.anchorWorldDrift = worldDrift
      arStatus.anchorCameraDistance = cameraDistance
      arStatus.anchorScreenPosition = screenStatus(screenPosition)
      arStatus.anchorScreenDelta = screenDelta
      arStatus.anchorFollowSignal = followSignal
      if (document.body) {
        document.body.dataset.dmsAnchorWorldPosition = arStatus.anchorWorldPosition
        document.body.dataset.dmsAnchorWorldDrift = worldDrift.toFixed(4)
        document.body.dataset.dmsAnchorCameraDistance = cameraDistance.toFixed(3)
        document.body.dataset.dmsAnchorScreenPosition = arStatus.anchorScreenPosition
        document.body.dataset.dmsAnchorScreenDelta = screenDelta.toFixed(4)
        document.body.dataset.dmsAnchorFollowSignal = followSignal
      }
    },

    canPlaceNow() {
      if (this.data.waitForRealityReady && sceneUsesXrWeb() && !this.realityReady) return false
      if (this.data.waitForTrackingNormal && sceneUsesXrWeb() && !this.hasWorldTrackingSignal()) return false
      if (sceneUsesXrWeb() && this.data.placementMode === 'floor-ray' && !this.hasStablePlacementCandidate()) return false
      return true
    },

    schedulePlace(delayMs = 0) {
      if (this.timer) window.clearTimeout(this.timer)
      this.timer = window.setTimeout(this.tryPlace, Math.max(0, Number(delayMs) || 0))
    },

    onXrPose(event) {
      this.xrPose = event?.detail || dmsWorldPoseState.latest
      this.xrPoseTravel = Number(this.xrPose?.travel) || 0
      this.updateXrPoseStatus()
      this.updatePlacementCandidate()
      if (this.data.autoPlace && !this.placed && this.canPlaceNow()) {
        this.retryCount = 0
        this.schedulePlace(this.data.placementDelayMs)
      }
    },

    onRealityReady() {
      if (this.realityReady) return
      this.realityReady = true
      this.hasCameraOrigin = false
      this.placementSamples.length = 0
      this.placementCandidate = null
      this.updateCameraTravel()
      this.updateXrPoseStatus()
      this.updatePlacementCandidate()
      if (!this.data.autoPlace || this.placed) return
      if (this.canPlaceNow()) {
        this.retryCount = 0
        this.schedulePlace(this.data.placementDelayMs)
      }
      setArStatus({
        targetState: 'world',
        anchorState: this.pendingAnchorState(),
        message: this.waitingMessage(),
        hideStatus: false,
      })
    },

    onTrackingStatus(event) {
      const detail = event?.detail || {}
      this.trackingStatus = String(detail.status || detail.trackingStatus || detail.state || 'unknown')
      this.trackingReason = String(detail.reason || detail.trackingReason || '')
      this.updateCameraTravel()
      this.updatePlacementCandidate()

      setArStatus({
        trackingStatus: this.trackingStatus,
        trackingReason: this.trackingReason,
        xrPoseSource: this.xrPose?.source || arStatus.xrPoseSource,
        xrPosePosition: this.xrPose ? plainVectorStatus(this.xrPose.position) : arStatus.xrPosePosition,
        xrPoseTravel: Number(this.xrPose?.travel) || arStatus.xrPoseTravel,
        xrPoseSamples: Number(this.xrPose?.sampleCount) || arStatus.xrPoseSamples,
        anchorState: this.pendingAnchorState(),
        message: this.placed
          ? 'AR installation locked in room space'
          : this.waitingMessage(),
        hideStatus: this.placed,
      })

      if (this.data.autoPlace && !this.placed && this.canPlaceNow()) {
        this.retryCount = 0
        this.schedulePlace(this.data.placementDelayMs)
      }
    },

    onReplace() {
      this.placed = false
      this.retryCount = 0
      this.hasCameraOrigin = false
      this.placementSamples.length = 0
      this.placementCandidate = null
      this.placementCandidateReason = 'replacing'
      this.placementCandidateRadius = Infinity
      this.lockedWorldPosition = null
      this.lockedScreenPosition = null
      this.lockedCameraDistance = 0
      this.updateCameraTravel()
      this.updateXrPoseStatus()
      this.updatePlacementCandidate()
      this.updateAnchorLockDiagnostics()
      this.el.object3D.visible = false
      this.el.dataset.dmsAnchorLocked = 'false'
      this.el.dataset.dmsAnchorMode = 'replacing'
      if (this.canPlaceNow()) this.schedulePlace(80)
      setArStatus({
        targetState: 'world',
        anchorState: this.pendingAnchorState(),
        anchorPosition: 'n/a',
        message: this.waitingMessage(),
        hideStatus: false,
      })
    },

    tick(time) {
      this.updateCameraTravel()
      this.updateXrPoseStatus()
      this.updatePlacementCandidate()
      this.updateAnchorLockDiagnostics()
      if (!this.placed && this.data.autoPlace && !this.timer && this.canPlaceNow()) {
        this.retryCount = 0
        this.schedulePlace(80)
      }
      if (isArDebugEnabled() && !this.placed && time - this.lastStatusUpdate > 400) {
        this.lastStatusUpdate = time
        setArStatus({
          trackingStatus: this.trackingStatus,
          trackingReason: this.trackingReason,
          xrPoseSource: arStatus.xrPoseSource,
          xrPosePosition: arStatus.xrPosePosition,
          xrPoseTravel: arStatus.xrPoseTravel,
          xrPoseSamples: arStatus.xrPoseSamples,
          anchorState: this.pendingAnchorState(),
          message: this.waitingMessage(),
          hideStatus: false,
        })
      }
    },

    tryPlace() {
      this.timer = null
      this.updatePlacementCandidate()
      if (!this.canPlaceNow()) {
        this.schedulePlace(this.data.retryIntervalMs)
        return
      }

      const placed = sceneUsesXrWeb() && this.data.requireXrWorldPose
        ? (this.data.placementMode === 'floor-ray'
          ? placeEntityAtWorldPointFacingCamera(
            this.el,
            this.placementCandidate?.point,
            this.data.groundY,
          )
          : placeEntityFromTrackedSceneCamera(
            this.el,
            this.data.distance,
            this.data.groundY,
          ))
        : placeEntityInFrontOfCamera(
          this.el,
          this.data.distance,
          this.data.groundY,
        )

      if (!placed) {
        this.retryCount += 1
        if (this.retryCount <= Number(this.data.maxRetries)) {
          this.schedulePlace(this.data.retryIntervalMs)
        }
        return
      }

      this.placed = true
      const THREE = getThree()
      this.lockedWorldPosition = worldPositionForObject(THREE, this.el.object3D)
      this.lockedScreenPosition = screenProjectionForWorldPoint(THREE, this.lockedWorldPosition)
      this.lockedCameraDistance = cameraDistanceToWorldPoint(THREE, this.lockedWorldPosition)
      this.updateAnchorLockDiagnostics()
      this.el.dataset.dmsAnchorLocked = 'true'
      this.el.dataset.dmsAnchorMode = 'world'
      this.el.dataset.dmsAnchorPosition = vectorStatus(this.el.object3D?.position)
      setArStatus({
        targetState: 'world',
        anchorState: 'locked',
        anchorPosition: vectorStatus(this.el.object3D?.position),
        message: 'AR installation locked in room space',
        hideStatus: true,
      })
    },
  })
}

function registerDmsSpatialDiagnostics() {
  if (!window.AFRAME || window.AFRAME.components['dms-spatial-diagnostics']) return

  window.AFRAME.registerComponent('dms-spatial-diagnostics', {
    init() {
      const THREE = getThree()
      this.origin = THREE ? new THREE.Vector3() : null
      this.current = THREE ? new THREE.Vector3() : null
      this.hasOrigin = false
      this.lastDebugUpdate = 0
    },

    tick(time) {
      const cameraObject = getCameraObject()
      if (!cameraObject || !this.current) return
      cameraObject.updateMatrixWorld?.(true)
      cameraObject.getWorldPosition(this.current)
      if (!this.hasOrigin) {
        this.origin.copy(this.current)
        this.hasOrigin = true
      }

      const travel = this.origin.distanceTo(this.current)
      if (document.body) {
        document.body.dataset.dmsCameraPosition = vectorStatus(this.current)
        document.body.dataset.dmsCameraTravel = travel.toFixed(3)
      }
      arStatus.cameraPosition = vectorStatus(this.current)
      arStatus.cameraTravel = travel

      if (isArDebugEnabled() && time - this.lastDebugUpdate > 250) {
        this.lastDebugUpdate = time
        renderArStatus()
      }
    },
  })
}

function registerDmsWorldDebugReference() {
  if (!window.AFRAME || window.AFRAME.components['dms-world-debug-reference']) return

  window.AFRAME.registerComponent('dms-world-debug-reference', {
    schema: {
      showInDebug: { default: true },
      radius: { default: 0.38 },
      poleHeight: { default: 1.7 },
    },

    init() {
      this.group = null
      this.initialScreenPosition = null
      this.initialCameraDistance = 0
      this.lastUpdate = 0
      this.el.object3D.visible = false
      this.build()
    },

    build() {
      const THREE = getThree()
      if (!THREE || !this.el?.object3D || this.group) return

      const group = new THREE.Group()
      group.name = 'DMS_World_Debug_Reference'
      const cyan = new THREE.MeshBasicMaterial({ color: 0x6ff7ff, transparent: true, opacity: 0.72, depthWrite: false })
      const white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, depthWrite: false })
      const radius = Math.max(0.12, Number(this.data.radius) || 0.38)
      const poleHeight = Math.max(0.6, Number(this.data.poleHeight) || 1.7)

      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.76, radius, 48), cyan)
      ring.rotation.x = -Math.PI * 0.5
      ring.renderOrder = 20
      group.add(ring)

      const crossA = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.2, 0.018, 0.018), white)
      crossA.position.y = 0.018
      crossA.renderOrder = 21
      group.add(crossA)

      const crossB = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, radius * 2.2), white)
      crossB.position.y = 0.018
      crossB.renderOrder = 21
      group.add(crossB)

      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.026, poleHeight, 0.026), cyan)
      pole.position.y = poleHeight * 0.5
      pole.renderOrder = 22
      group.add(pole)

      this.group = group
      this.el.object3D.add(group)
    },

    tick(time) {
      const enabled = isArDebugEnabled() || queryNumber('worldRef', 0) > 0
      this.el.object3D.visible = Boolean(enabled)
      if (!enabled || time - this.lastUpdate < 250) return
      this.lastUpdate = time

      const THREE = getThree()
      const worldPosition = worldPositionForObject(THREE, this.el.object3D)
      const screenPosition = screenProjectionForWorldPoint(THREE, worldPosition)
      const cameraDistance = cameraDistanceToWorldPoint(THREE, worldPosition)

      if (!this.initialScreenPosition && screenPosition) {
        this.initialScreenPosition = { ...screenPosition }
        this.initialCameraDistance = cameraDistance
      }

      const screenDelta = screenDistance(this.initialScreenPosition, screenPosition)
      const distanceDelta = Math.abs(cameraDistance - this.initialCameraDistance)
      let followSignal = 'waiting'
      if (arStatus.cameraTravel > 0.35) {
        followSignal = screenDelta < 0.035 && distanceDelta < 0.08 ? 'world-scene-screen-pinned' : 'world-scene-moving'
      }

      arStatus.worldRefPosition = worldPosition ? vectorStatus(worldPosition) : 'n/a'
      arStatus.worldRefCameraDistance = cameraDistance
      arStatus.worldRefScreenPosition = screenStatus(screenPosition)
      arStatus.worldRefScreenDelta = screenDelta
      arStatus.worldRefFollowSignal = followSignal
      if (document.body) {
        document.body.dataset.dmsWorldRefPosition = arStatus.worldRefPosition
        document.body.dataset.dmsWorldRefCameraDistance = cameraDistance.toFixed(3)
        document.body.dataset.dmsWorldRefScreenPosition = arStatus.worldRefScreenPosition
        document.body.dataset.dmsWorldRefScreenDelta = screenDelta.toFixed(4)
        document.body.dataset.dmsWorldRefFollowSignal = followSignal
      }
    },
  })
}

function cameraRayForPointer(THREE, cameraObject, event) {
  const origin = new THREE.Vector3()
  const direction = new THREE.Vector3()
  cameraObject.getWorldPosition(origin)

  if (cameraObject.isCamera && Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
    const rect = document.body.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, cameraObject)
    return {
      origin: raycaster.ray.origin.clone(),
      direction: raycaster.ray.direction.clone().normalize(),
    }
  }

  cameraObject.getWorldDirection(direction)
  return { origin, direction: direction.normalize() }
}

function placeEntityAtCameraGroundHit(el, distance, groundY, event = null) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !el?.object3D) return false

  cameraObject.updateMatrixWorld?.(true)
  el.object3D.parent?.updateMatrixWorld?.(true)

  const floorY = Number.isFinite(Number(groundY)) ? Number(groundY) : 0.04
  const { origin, direction } = cameraRayForPointer(THREE, cameraObject, event)
  let targetWorld = null

  if (Math.abs(direction.y) > 0.035) {
    const groundDistance = (floorY - origin.y) / direction.y
    if (groundDistance > 0.7 && groundDistance < 14) {
      targetWorld = origin.clone().addScaledVector(direction, groundDistance)
    }
  }

  if (!targetWorld) {
    const horizontal = direction.clone()
    horizontal.y = 0
    if (horizontal.lengthSq() < 0.0001) horizontal.set(0, 0, -1)
    horizontal.normalize()
    targetWorld = origin.clone().addScaledVector(horizontal, Math.max(1.2, Number(distance) || 3.6))
    targetWorld.y = floorY
  }

  const targetLocal = targetWorld.clone()
  if (el.object3D.parent) el.object3D.parent.worldToLocal(targetLocal)
  el.object3D.position.copy(targetLocal)
  el.object3D.visible = true
  el.setAttribute('visible', true)
  el.object3D.updateMatrixWorld(true)
  faceEntityTowardCamera(el)
  return true
}

function targetFromCameraCenter(el, group, detail = {}) {
  const THREE = getThree()
  const cameraObject = getCameraObject()
  if (!THREE || !cameraObject || !group) {
    const fallbackPanel = group ? group.userData.currentPanelIndex || 0 : 0
    return {
      panelIndex: fallbackPanel,
      x: 0,
      y: group?.userData.dimensions?.height * 0.5 || DEFAULT_PHYSICAL_HEIGHT * 0.5,
    }
  }

  cameraObject.updateMatrixWorld?.(true)
  el.object3D?.updateMatrixWorld?.(true)
  group.updateMatrixWorld?.(true)

  const origin = new THREE.Vector3()
  const direction = new THREE.Vector3()
  cameraObject.getWorldPosition(origin)
  cameraObject.getWorldDirection(direction)

  const raycaster = new THREE.Raycaster(origin, direction, 0.02, 32)
  const hits = raycaster.intersectObjects(group.userData.shardMeshes || [], false)
  if (hits.length) {
    const hit = hits[0]
    const shard = hit.object?.userData?.shardContainer
    const local = el.object3D.worldToLocal(hit.point.clone())
    const panelIndex = shard?.userData?.panelIndex ?? nearestPanelIndexForPoint(group, local.x)
    return clampInteractionTarget(group, { panelIndex, x: local.x, y: local.y })
  }

  const planeNormal = new THREE.Vector3(0, 0, 1)
  const entityQuaternion = new THREE.Quaternion()
  const entityPosition = new THREE.Vector3()
  el.object3D.getWorldQuaternion(entityQuaternion)
  el.object3D.getWorldPosition(entityPosition)
  planeNormal.applyQuaternion(entityQuaternion).normalize()

  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, entityPosition)
  const ray = new THREE.Ray(origin, direction)
  const planePoint = new THREE.Vector3()
  const didHitPlane = ray.intersectPlane(plane, planePoint)
  if (didHitPlane) {
    const local = el.object3D.worldToLocal(planePoint)
    const panelIndex = nearestPanelIndexForPoint(group, local.x)
    return clampInteractionTarget(group, { panelIndex, x: local.x, y: local.y })
  }

  const fallbackIndex = Number(detail.panelIndex ?? group.userData.currentPanelIndex ?? 0)
  const state = panelStateForIndex(group, fallbackIndex) || group.userData.panelStates?.[0]
  return clampInteractionTarget(group, {
    panelIndex: state?.panelIndex || 0,
    x: state?.centerX || 0,
    y: group.userData.dimensions?.height * 0.5 || DEFAULT_PHYSICAL_HEIGHT * 0.5,
  })
}

function imageTargetNameFromEvent(event) {
  return event?.detail?.name ||
    event?.detail?.imageTarget?.name ||
    event?.detail?.target?.name ||
    ''
}

function imageTargetPoseFromEvent(event) {
  const detail = event?.detail || {}
  const source = detail.imageTarget || detail.target || detail
  const position = detail.position || source.position
  const rotation = detail.rotation || source.rotation
  const rawScale = detail.scale ?? source.scale ?? 1
  const scale = Number(rawScale?.x ?? rawScale)

  if (!position || !rotation) return null
  return {
    position,
    rotation,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  }
}

function applyImageTargetPose(el, pose, options = {}) {
  if (!el?.object3D || !pose) return false
  const object = el.object3D
  const anchorScale = Number(options.anchorScale)
  const useTargetScale = Boolean(options.useTargetScale)
  const multiplier = Number(options.targetScaleMultiplier)
  const resolvedScale = (Number.isFinite(anchorScale) && anchorScale > 0 ? anchorScale : 1) *
    (useTargetScale ? pose.scale : 1) *
    (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1)

  object.position.set(
    Number(pose.position.x) || 0,
    Number(pose.position.y) || 0,
    Number(pose.position.z) || 0,
  )

  if (Number.isFinite(Number(pose.rotation.w))) {
    object.quaternion.set(
      Number(pose.rotation.x) || 0,
      Number(pose.rotation.y) || 0,
      Number(pose.rotation.z) || 0,
      Number(pose.rotation.w) || 1,
    )
  } else {
    object.rotation.set(
      Number(pose.rotation.x) || 0,
      Number(pose.rotation.y) || 0,
      Number(pose.rotation.z) || 0,
    )
  }

  object.scale.setScalar(resolvedScale)
  object.visible = true
  object.updateMatrixWorld(true)
  return resolvedScale
}

function registerDmsImageTargetRoomAnchor() {
  if (!window.AFRAME || window.AFRAME.components['dms-image-target-room-anchor']) return

  window.AFRAME.registerComponent('dms-image-target-room-anchor', {
    schema: {
      targetName: { default: 'video-target' },
      targetElementId: { default: 'dms-calibration-target' },
      persistent: { default: true },
      refineUpdates: { default: ROOM_ANCHOR_REFINE_UPDATES },
      anchorScale: { default: 1 },
      useTargetScale: { default: false },
      targetScaleMultiplier: { default: 1 },
      fallbackPreviewAfterMs: { default: 4200 },
      fallbackDistance: { default: 3.8 },
      fallbackGroundY: { default: 0.04 },
    },

    init() {
      this.locked = false
      this.hasImageEvent = false
      this.refineCount = 0
      this.sceneEl = this.el.sceneEl || document.querySelector('a-scene')
      this.eventSources = []
      this.fallbackTimer = null
      this.onImagePose = this.onImagePose.bind(this)
      this.onImageLost = this.onImageLost.bind(this)
      this.onRelock = this.onRelock.bind(this)
      this.el.object3D.visible = false
      this.el.dataset.dmsAnchorLocked = 'false'
      this.el.dataset.dmsAnchorMode = 'waiting'

      this.addImageTargetEventListeners()
      window.addEventListener('dms-relock-target', this.onRelock)
      this.startFallbackTimer()

      setArStatus({
        targetName: this.data.targetName,
        targetState: 'searching',
        anchorState: 'waiting',
        anchorScale: Number(this.data.anchorScale) || 1,
        message: `Scan marker: ${this.data.targetName}`,
        hideStatus: false,
      })
    },

    remove() {
      this.clearFallbackTimer()
      for (const source of this.eventSources) {
        source.removeEventListener('xrimagefound', this.onImagePose)
        source.removeEventListener('xrimageupdated', this.onImagePose)
        source.removeEventListener('xrimagelost', this.onImageLost)
      }
      this.eventSources = []
      window.removeEventListener('dms-relock-target', this.onRelock)
    },

    resolveTargetElement() {
      const explicit = this.data.targetElementId ? document.getElementById(this.data.targetElementId) : null
      if (explicit) return explicit
      return Array.from(document.querySelectorAll('xrextras-named-image-target'))
        .find(target => target.getAttribute('name') === this.data.targetName) || null
    },

    addImageTargetEventListeners() {
      const sources = [
        this.sceneEl,
        this.el,
        this.resolveTargetElement(),
        window,
      ].filter(Boolean)

      for (const source of sources) {
        if (this.eventSources.includes(source)) continue
        source.addEventListener('xrimagefound', this.onImagePose)
        source.addEventListener('xrimageupdated', this.onImagePose)
        source.addEventListener('xrimagelost', this.onImageLost)
        this.eventSources.push(source)
      }
    },

    clearFallbackTimer() {
      if (!this.fallbackTimer) return
      window.clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    },

    startFallbackTimer() {
      this.clearFallbackTimer()
      const fallbackMs = Math.max(0, Number(this.data.fallbackPreviewAfterMs) || 0)
      if (fallbackMs <= 0) return
      this.fallbackTimer = window.setTimeout(() => this.showCameraFallbackPreview(), fallbackMs)
    },

    showCameraFallbackPreview() {
      this.fallbackTimer = null
      if (this.locked || this.hasImageEvent || !this.el?.object3D) return
      const placed = placeEntityInFrontOfCamera(
        this.el,
        this.data.fallbackDistance,
        this.data.fallbackGroundY,
      )
      if (!placed) {
        this.startFallbackTimer()
        return
      }
      this.el.dataset.dmsAnchorLocked = 'false'
      this.el.dataset.dmsAnchorMode = 'camera-preview'
      setArStatus({
        targetState: 'searching',
        anchorState: 'camera-preview',
        anchorPosition: vectorStatus(this.el.object3D?.position),
        message: `Preview shown. Scan marker to lock: ${this.data.targetName}`,
        hideStatus: false,
      })
    },

    matchesTarget(event) {
      const name = imageTargetNameFromEvent(event)
      return !name || name === this.data.targetName
    },

    onRelock() {
      this.hasImageEvent = false
      this.locked = false
      this.refineCount = 0
      this.el.object3D.visible = false
      this.el.dataset.dmsAnchorLocked = 'false'
      this.el.dataset.dmsAnchorMode = 'waiting'
      this.el.dataset.dmsAnchorScale = ''
      this.el.dataset.dmsTargetScale = ''
      this.startFallbackTimer()
      setArStatus({
        targetState: 'searching',
        anchorState: 'waiting',
        anchorPosition: 'n/a',
        anchorScale: Number(this.data.anchorScale) || 1,
        message: `Scan marker: ${this.data.targetName}`,
        hideStatus: false,
      })
    },

    onImagePose(event) {
      if (!this.matchesTarget(event)) return
      this.hasImageEvent = true
      this.clearFallbackTimer()
      const pose = imageTargetPoseFromEvent(event)
      if (!pose) {
        setArStatus({
          imageEventCount: arStatus.imageEventCount + 1,
          targetState: 'visible-no-pose',
          anchorState: this.locked ? 'locked' : 'waiting',
          message: `Marker seen, waiting for pose: ${this.data.targetName}`,
          hideStatus: false,
        })
        return
      }

      const refineTarget = Math.max(1, Number(this.data.refineUpdates) || ROOM_ANCHOR_REFINE_UPDATES)
      const shouldApplyPose = !this.locked || this.refineCount < refineTarget
      if (shouldApplyPose) {
        const resolvedScale = applyImageTargetPose(this.el, pose, {
          anchorScale: this.data.anchorScale,
          useTargetScale: this.data.useTargetScale,
          targetScaleMultiplier: this.data.targetScaleMultiplier,
        })
        if (!resolvedScale) {
          setArStatus({
            imageEventCount: arStatus.imageEventCount + 1,
            targetScale: pose.scale,
            targetState: 'visible-no-object3d',
            anchorState: 'waiting',
            message: 'Marker seen, but room anchor object is not ready.',
            hideStatus: false,
          })
          return
        }
        this.refineCount += 1
        this.el.dataset.dmsAnchorScale = Number(resolvedScale).toFixed(3)
        this.el.dataset.dmsTargetScale = Number(pose.scale).toFixed(3)
      }

      this.locked = true
      this.el.dataset.dmsAnchorLocked = 'true'
      this.el.dataset.dmsAnchorMode = 'image-target'

      const refining = this.refineCount < refineTarget
      setArStatus({
        imageEventCount: arStatus.imageEventCount + 1,
        targetScale: pose.scale,
        anchorScale: Number(this.el.dataset.dmsAnchorScale) || Number(this.data.anchorScale) || 1,
        anchorPosition: vectorStatus(this.el.object3D?.position),
        targetState: 'visible',
        anchorState: refining ? `refining ${this.refineCount}/${refineTarget}` : 'locked',
        message: refining ? 'Locking room anchor...' : 'Room anchor locked',
        hideStatus: !refining,
      })
    },

    onImageLost(event) {
      if (!this.matchesTarget(event)) return
      this.hasImageEvent = true
      const keepVisible = this.locked && this.data.persistent
      this.el.object3D.visible = keepVisible
      setArStatus({
        imageEventCount: arStatus.imageEventCount + 1,
        targetState: 'lost',
        anchorState: this.locked ? 'locked' : 'waiting',
        message: keepVisible ? 'Marker lost; using locked room anchor' : `Scan marker: ${this.data.targetName}`,
        hideStatus: keepVisible,
      })
    },
  })
}

function vectorSnapshot(vector) {
  if (!vector) return null
  return [vector.x, vector.y, vector.z].map(value => Number(value || 0).toFixed(3))
}

function vectorStatus(vector) {
  return vectorSnapshot(vector)?.join(', ') || 'n/a'
}

function plainVectorStatus(vector) {
  if (!vector) return 'n/a'
  return [vector.x, vector.y, vector.z].map(value => Number(value || 0).toFixed(3)).join(', ')
}

function plainVectorFrom(value) {
  if (!value) return null
  const x = Number(value.x ?? value[0])
  const y = Number(value.y ?? value[1])
  const z = Number(value.z ?? value[2])
  if (![x, y, z].every(Number.isFinite)) return null
  return { x, y, z }
}

function plainQuaternionFrom(value) {
  if (!value) return null
  const x = Number(value.x ?? value[0])
  const y = Number(value.y ?? value[1])
  const z = Number(value.z ?? value[2])
  const w = Number(value.w ?? value[3])
  if (![x, y, z, w].every(Number.isFinite)) return null
  return { x, y, z, w }
}

function plainDistance(a, b) {
  if (!a || !b) return 0
  return Math.hypot(
    Number(b.x) - Number(a.x),
    Number(b.y) - Number(a.y),
    Number(b.z) - Number(a.z),
  )
}

const dmsWorldPoseState = {
  installed: false,
  getCameraTransform: null,
  origin: null,
  latest: null,
  sampleCount: 0,
}

function publishDmsWorldPose({ position, rotation, source = 'unknown' } = {}) {
  const resolvedPosition = plainVectorFrom(position)
  const resolvedRotation = plainQuaternionFrom(rotation)
  if (!resolvedPosition || !resolvedRotation) return null

  if (!dmsWorldPoseState.origin) {
    dmsWorldPoseState.origin = { ...resolvedPosition }
  }

  dmsWorldPoseState.sampleCount += 1
  const now = performance.now()
  const travel = plainDistance(dmsWorldPoseState.origin, resolvedPosition)
  const detail = {
    source,
    position: resolvedPosition,
    rotation: resolvedRotation,
    travel,
    sampleCount: dmsWorldPoseState.sampleCount,
    timestamp: now,
  }

  dmsWorldPoseState.latest = detail
  window.__dmsXrPose = detail
  if (document.body) {
    document.body.dataset.dmsXrPoseSource = source
    document.body.dataset.dmsXrPosePosition = plainVectorStatus(resolvedPosition)
    document.body.dataset.dmsXrPoseTravel = travel.toFixed(3)
    document.body.dataset.dmsXrPoseSamples = String(dmsWorldPoseState.sampleCount)
  }
  window.dispatchEvent(new CustomEvent('dms-xr-pose', { detail }))
  return detail
}

function setupDmsWorldPoseProbe() {
  if (dmsWorldPoseState.installed) return

  const install = () => {
    if (dmsWorldPoseState.installed || !window.XR8?.addCameraPipelineModule) return
    dmsWorldPoseState.installed = true
    window.XR8.addCameraPipelineModule({
      name: 'dms-world-pose-probe',
      onAttach(args = {}) {
        dmsWorldPoseState.getCameraTransform = args.cameraApi?.getCameraTransform || dmsWorldPoseState.getCameraTransform
      },
      onStart(args = {}) {
        dmsWorldPoseState.getCameraTransform = args.cameraApi?.getCameraTransform || dmsWorldPoseState.getCameraTransform
      },
      onUpdate({ processCpuResult } = {}) {
        const reality = processCpuResult?.reality
        if (reality?.position && reality?.rotation) {
          publishDmsWorldPose({
            position: reality.position,
            rotation: reality.rotation,
            source: 'reality',
          })
          return
        }

        if (typeof dmsWorldPoseState.getCameraTransform === 'function') {
          try {
            const transform = dmsWorldPoseState.getCameraTransform()
            publishDmsWorldPose({
              position: transform?.t || transform?.position,
              rotation: transform?.r || transform?.rotation,
              source: 'camera-api',
            })
          } catch {
            // The camera transform is unavailable until the XR session is fully attached.
          }
        }
      },
      listeners: [
        {
          event: 'reality.trackingstatus',
          process(event) {
            window.dispatchEvent(new CustomEvent('dms-tracking-status', { detail: event.detail || event }))
          },
        },
      ],
    })
  }

  if (window.XR8) install()
  else window.addEventListener('xrloaded', install, { once: true })
}

function registerDmsAnchorTestRunner() {
  if (!window.AFRAME || window.AFRAME.components['dms-anchor-test-runner']) return

  window.AFRAME.registerComponent('dms-anchor-test-runner', {
    schema: {
      targetName: { default: 'video-target' },
      delayMs: { default: 1400 },
      targetScale: { default: 0.18 },
    },

    init() {
      this.timer = window.setTimeout(() => this.run(), Math.max(100, Number(this.data.delayMs) || 1400))
    },

    remove() {
      if (this.timer) window.clearTimeout(this.timer)
    },

    run() {
      const scene = this.el
      const room = document.getElementById('dms-room-anchor')
      const dms = document.getElementById('dms-installation')
      const detail = {
        name: this.data.targetName,
        type: 'PLANAR',
        position: { x: 1.2, y: 0.45, z: -2.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: Number(this.data.targetScale) || 0.18,
      }

      const result = {
        hadSceneObject: Boolean(scene?.object3D),
        hadRoomObject: Boolean(room?.object3D),
        dmsLoadedBefore: dms?.dataset.dmsLoaded || 'false',
      }

      if (!scene || !room?.object3D) {
        result.pass = false
        result.reason = 'missing-scene-or-room-object3d'
        document.body.dataset.dmsAnchorTestResult = 'fail'
        document.body.dataset.dmsAnchorTest = JSON.stringify(result)
        return
      }

      scene.dispatchEvent(new CustomEvent('xrimagefound', { detail }))
      scene.dispatchEvent(new CustomEvent('xrimageupdated', { detail }))
      room.object3D.updateMatrixWorld(true)

      result.afterFound = {
        locked: room.dataset.dmsAnchorLocked,
        visible: String(room.object3D.visible),
        anchorScale: room.dataset.dmsAnchorScale,
        targetScale: room.dataset.dmsTargetScale,
        position: vectorSnapshot(room.object3D.position),
        scale: vectorSnapshot(room.object3D.scale),
      }

      scene.dispatchEvent(new CustomEvent('xrimagelost', { detail: { name: this.data.targetName } }))

      result.afterLost = {
        locked: room.dataset.dmsAnchorLocked,
        visible: String(room.object3D.visible),
        targetState: document.body.dataset.dmsTargetState,
        anchorState: document.body.dataset.dmsAnchorState,
      }
      result.pass = result.afterFound.locked === 'true' &&
        result.afterFound.anchorScale === '1.000' &&
        result.afterFound.targetScale === Number(detail.scale).toFixed(3) &&
        result.afterLost.locked === 'true' &&
        result.afterLost.visible === 'true'

      document.body.dataset.dmsAnchorTestResult = result.pass ? 'pass' : 'fail'
      document.body.dataset.dmsAnchorTest = JSON.stringify(result)
    },
  })
}

export function registerDmsMirrorShards() {
  registerDmsWorldRoomAnchor()
  registerDmsSpatialDiagnostics()
  registerDmsWorldDebugReference()
  registerDmsImageTargetRoomAnchor()
  registerDmsAnchorTestRunner()
  if (!window.AFRAME || window.AFRAME.components['dms-mirror-shards']) return
  console.info('Registering dms-mirror-shards A-Frame component')

  window.AFRAME.registerComponent('dms-mirror-shards', {
    schema: {
      dataUrl: { default: `${DMS_ROOT}assets/shards-data.json` },
      seriesUrl: { default: `${DMS_ROOT}assets/single-liquid-series.json` },
      autoCycle: { default: false },
      panelLimit: { default: DEFAULT_PANEL_LIMIT },
      enableFracture: { default: false },
      enableGpuMotion: { default: DEFAULT_ENABLE_GPU_MOTION },
      quality: { default: 'auto' },
      faceCameraOnStart: { default: true },
      layoutScale: { default: DEFAULT_LAYOUT_SCALE },
      displayScale: { default: 1 },
      allowQueryScale: { default: false },
      queryScaleMin: { default: 0.55 },
      queryScaleMax: { default: 2.4 },
      placeFromCameraOnStart: { default: false },
      manualPlacementOnStart: { default: false },
      placementDistance: { default: 4.6 },
      placementDelayMs: { default: 1600 },
      placementGroundY: { default: 0.04 },
      autoPlacementFallbackMs: { default: AUTO_PLACEMENT_FALLBACK_MS },
      idleRotationEnabled: { default: true },
      idleRotationStrength: { default: 1 },
      shockAfterglow: { default: 1 },
      liquidShockCoupling: { default: 1 },
      textLayerEnabled: { default: false },
      textLayerText: { default: '' },
      textLayerOpacity: { default: 0.72 },
      textLayerDepth: { default: 0.026 },
      textLayerMotionMix: { default: 0.35 },
    },

    init() {
      this.group = null
      const configuredScale = Number(this.data.displayScale) || 1
      const requestedScale = this.data.allowQueryScale ? queryNumber('dmsScale', configuredScale) : configuredScale
      this.displayScale = clamp(
        requestedScale,
        Number(this.data.queryScaleMin) || 0.55,
        Number(this.data.queryScaleMax) || 2.4,
      )
      this.interactions = []
      this.interactionCount = 0
      this.lastDebugUpdate = 0
      this.motionClockStartMs = performance.now()
      this.lastMotionSeconds = 0
      this.qualityProfile = resolveQualityProfile(this.data.quality, {
        preferHigh: document.body?.dataset.previewMode === 'desktop',
      })
      this.loaded = false
      this.loadError = null
      this.hasPlacedFromCamera = false
      this.placementReady = false
      this.placementTimer = null
      this.el.dataset.dmsLoaded = 'false'
      this.el.dataset.dmsPlacedFromCamera = 'false'
      this.el.dataset.dmsPlacementMode = this.data.manualPlacementOnStart ? 'manual-tap' : 'auto'
      this.el.dataset.dmsQuality = this.qualityProfile.name
      document.body.classList.add('is-loading')
      this.sceneEl = this.el.sceneEl || document.querySelector('a-scene')

      this.onClick = this.onClick.bind(this)
      this.onPulse = this.onPulse.bind(this)
      this.onNext = this.onNext.bind(this)
      this.onReset = this.onReset.bind(this)
      this.onReplace = this.onReplace.bind(this)
      this.onRealityReady = this.onRealityReady.bind(this)
      this.onPlacementPointerDown = this.onPlacementPointerDown.bind(this)
      this.placeFromCameraOnce = this.placeFromCameraOnce.bind(this)
      this.ensurePlacedForInteraction = this.ensurePlacedForInteraction.bind(this)
      this.el.addEventListener('click', this.onClick)
      this.el.addEventListener('dms-pulse', this.onPulse)
      this.el.addEventListener('dms-next', this.onNext)
      this.el.addEventListener('dms-reset', this.onReset)
      this.el.addEventListener('dms-replace', this.onReplace)
      window.addEventListener('dms-replace-world', this.onReplace)
      window.addEventListener('realityready', this.onRealityReady)
      this.sceneEl?.addEventListener('realityready', this.onRealityReady)
      document.addEventListener('pointerdown', this.onPlacementPointerDown, true)

      this.load()
    },

    async load() {
      try {
        const THREE = getThree()
        if (!THREE) throw new Error('THREE runtime not available')
        const data = await fetchJson(this.data.dataUrl)
        const rawSeries = await fetchJson(this.data.seriesUrl).catch(() => null)
        const series = normalizeSeries(rawSeries)
        const variantData = await loadVariantData(data)
        this.group = buildMirrorGroup(THREE, data, series, variantData, {
          layoutScale: this.data.layoutScale,
          panelLimit: this.data.panelLimit,
          enableFracture: this.data.enableFracture,
          enableGpuMotion: this.data.enableGpuMotion,
          qualityProfile: this.qualityProfile,
          idleRotationEnabled: this.data.idleRotationEnabled,
          idleRotationStrength: this.data.idleRotationStrength,
          shockAfterglow: this.data.shockAfterglow,
          liquidShockCoupling: this.data.liquidShockCoupling,
          textLayerEnabled: this.data.textLayerEnabled,
          textLayerText: this.data.textLayerText,
          textLayerOpacity: this.data.textLayerOpacity,
          textLayerDepth: this.data.textLayerDepth,
          textLayerMotionMix: this.data.textLayerMotionMix,
        })
        this.group.userData.displayScale = this.displayScale
        this.el.object3D.scale.setScalar(this.displayScale)
        this.el.object3D.add(this.group)
        this.loaded = true
        document.body.classList.remove('is-loading')
        if (this.data.manualPlacementOnStart) {
          this.el.dataset.dmsPlacementReady = 'false'
          const delay = clamp(Number(this.data.autoPlacementFallbackMs) || 0, 0, 8000)
          if (delay > 0) {
            this.placementTimer = window.setTimeout(() => this.ensurePlacedForInteraction(), delay)
          }
        } else if (this.data.placeFromCameraOnStart) {
          const delay = clamp(Number(this.data.placementDelayMs) || 0, 0, 5000)
          this.placementTimer = window.setTimeout(() => this.placeFromCameraOnce(), delay)
        } else if (this.data.faceCameraOnStart) {
          window.setTimeout(() => faceEntityTowardCamera(this.el), 120)
        }
        updateDebugState(this.el, this.group, {
          dmsInteractionCount: this.interactionCount,
        })
        console.info(`DMS mirror shards loaded: ${this.group.userData.shardObjects.length} shards across ${this.group.userData.panelCount} panel(s), fracture ${this.group.userData.enableFracture ? 'on' : 'off'}, gpu motion ${this.group.userData.enableGpuMotion ? 'on' : 'off'}, quality ${this.group.userData.qualityProfile?.name || 'auto'}`)
      } catch (error) {
        this.loadError = error
        document.body.classList.remove('is-loading')
        console.error('DMS mirror shards failed to load', error)
        showRuntimeWarning(`DMS prototype could not load: ${error.message}`)
      }
    },

    remove() {
      this.el.removeEventListener('click', this.onClick)
      this.el.removeEventListener('dms-pulse', this.onPulse)
      this.el.removeEventListener('dms-next', this.onNext)
      this.el.removeEventListener('dms-reset', this.onReset)
      this.el.removeEventListener('dms-replace', this.onReplace)
      window.removeEventListener('dms-replace-world', this.onReplace)
      window.removeEventListener('realityready', this.onRealityReady)
      this.sceneEl?.removeEventListener('realityready', this.onRealityReady)
      document.removeEventListener('pointerdown', this.onPlacementPointerDown, true)
      if (this.placementTimer) window.clearTimeout(this.placementTimer)
      if (this.group) {
        disposeLiquidRenderTargets(this.group)
        disposeTextLayer(this.group)
        this.el.object3D.remove(this.group)
      }
    },

    onRealityReady() {
      if (this.data.manualPlacementOnStart) {
        this.placementReady = true
        this.el.dataset.dmsPlacementReady = 'true'
        window.setTimeout(() => this.ensurePlacedForInteraction(), 900)
      } else if (this.data.placeFromCameraOnStart) {
        this.placeFromCameraOnce()
      }
    },

    ensurePlacedForInteraction(event = null) {
      if (!this.loaded || !this.group || this.hasPlacedFromCamera) return true
      const placed = event
        ? placeEntityAtCameraGroundHit(
          this.el,
          this.data.placementDistance,
          this.data.placementGroundY,
          event,
        )
        : placeEntityInFrontOfCamera(
          this.el,
          this.data.placementDistance,
          this.data.placementGroundY,
        )
      if (!placed) return false
      this.hasPlacedFromCamera = true
      this.placementReady = true
      this.el.dataset.dmsPlacementReady = 'true'
      this.el.dataset.dmsPlacedFromCamera = 'true'
      updateDebugState(this.el, this.group)
      return true
    },

    onPlacementPointerDown(event) {
      if (!this.data.manualPlacementOnStart || !this.loaded || !this.group || this.hasPlacedFromCamera) return
      if (event.target?.closest?.('.control-bar')) return
      this.ensurePlacedForInteraction(event)
    },

    placeFromCameraOnce(attempt = 0) {
      if (!this.loaded || !this.group || this.hasPlacedFromCamera) return
      const placed = placeEntityInFrontOfCamera(
        this.el,
        this.data.placementDistance,
        this.data.placementGroundY,
      )
      if (placed) {
        this.hasPlacedFromCamera = true
        this.el.dataset.dmsPlacedFromCamera = 'true'
        updateDebugState(this.el, this.group)
        return
      }
      if (attempt < 12) {
        this.placementTimer = window.setTimeout(() => this.placeFromCameraOnce(attempt + 1), 250)
      }
    },

    onReplace(event = null) {
      if (!this.data.placeFromCameraOnStart && !this.data.manualPlacementOnStart) return
      if (!this.loaded || !this.group) return
      this.hasPlacedFromCamera = false
      this.placementReady = false
      this.el.dataset.dmsPlacementReady = 'false'
      this.el.dataset.dmsPlacedFromCamera = 'false'
      const placed = this.ensurePlacedForInteraction(event?.detail?.sourceEvent || null)
      if (placed) {
        setArStatus({
          targetState: 'world',
          anchorState: 'placed',
          anchorPosition: vectorStatus(this.el.object3D?.position),
          message: 'AR installation placed in front of camera',
          hideStatus: true,
        })
      }
    },

    motionTimeSeconds() {
      const seconds = (performance.now() - this.motionClockStartMs) / 1000
      this.lastMotionSeconds = Math.max(this.lastMotionSeconds, seconds)
      return this.lastMotionSeconds
    },

    tick() {
      if (!this.loaded || !this.group) return
      const seconds = this.motionTimeSeconds()
      updateLiquidPosterEffect(this.group, seconds)
      renderLiquidRenderTargets(this.group, this.sceneEl?.renderer, seconds)
      updateShardMotion(this.group, this.interactions, seconds)
      updateRenderPerformanceState(this.sceneEl, this.group, seconds)
      const debugInterval = isArDebugEnabled() ? 0.25 : 0.85
      if (seconds - this.lastDebugUpdate >= debugInterval) {
        this.lastDebugUpdate = seconds
        updateDebugState(this.el, this.group)
      }
    },

    addInteraction(x, y, strength = 1, panelIndex = 0, liquidMode = 'pulse') {
      if (!this.group) return false
      const target = clampInteractionTarget(this.group, { x, y, panelIndex })
      const t = this.motionTimeSeconds()
      triggerPanelStress(this.group, target.panelIndex, target.x, target.y, strength, t)
      driveLiquidPosterEffect(this.group, target.x, target.y, strength, target.panelIndex, liquidMode)
      this.interactions.push({
        x: target.x,
        y: target.y,
        strength,
        panelIndex: target.panelIndex,
        t,
      })
      updateGpuMotionUniforms(this.group, this.interactions, t)
      this.interactionCount += 1
      updateDebugState(this.el, this.group, {
        dmsInteractionCount: this.interactionCount,
        dmsLastStrength: strength.toFixed(2),
        dmsLastTargetX: target.x.toFixed(3),
        dmsLastTargetY: target.y.toFixed(3),
        dmsLastAcceptedAt: t.toFixed(3),
      })
      return true
    },

    onClick(event) {
      if (!this.group) return
      const THREE = getThree()
      const point = event.detail?.intersection?.point
      if (!THREE || !point) {
        const target = targetFromCameraCenter(this.el, this.group, event.detail)
        this.addInteraction(target.x, target.y, randomButtonStrength(), target.panelIndex)
        return
      }
      const local = this.el.object3D.worldToLocal(point.clone())
      const objectPanel = event.detail?.intersection?.object?.userData?.shardContainer?.userData?.panelIndex
      const panelIndex = objectPanel ?? nearestPanelIndexForPoint(this.group, local.x)
      this.addInteraction(local.x, local.y, event.detail?.cursorEl ? 1.18 : 1.02, panelIndex)
    },

    onPulse(event) {
      if (!this.group) return
      if (this.data.manualPlacementOnStart && !this.hasPlacedFromCamera) {
        if (!this.ensurePlacedForInteraction()) return
      }
      const detail = event.detail || {}
      const target = detail.x !== undefined && detail.y !== undefined
        ? {
          x: Number(detail.x),
          y: Number(detail.y),
          panelIndex: Number(detail.panelIndex ?? nearestPanelIndexForPoint(this.group, Number(detail.x))),
        }
        : targetFromCameraCenter(this.el, this.group, detail)
      this.addInteraction(target.x, target.y, randomButtonStrength(detail), target.panelIndex, 'blue')
    },

    onNext(event) {
      if (!this.group) return
      if (this.data.manualPlacementOnStart && !this.hasPlacedFromCamera) {
        if (!this.ensurePlacedForInteraction()) return
      }
      const detail = event.detail || {}
      const target = detail.x !== undefined && detail.y !== undefined
        ? {
          x: Number(detail.x),
          y: Number(detail.y),
          panelIndex: Number(detail.panelIndex ?? nearestPanelIndexForPoint(this.group, Number(detail.x))),
        }
        : targetFromCameraCenter(this.el, this.group, detail)
      this.addInteraction(target.x, target.y, randomButtonStrength(detail), target.panelIndex, 'orange')
    },

    onReset() {
      if (!this.group) return
      this.interactions.length = 0
      for (const state of this.group.userData.panelStates || []) {
        state.stress = 0
        state.mode = 'stable'
        state.lastHit = -Infinity
        state.breakAt = Infinity
        state.breakStart = Infinity
      }
      resetLiquidPosterEffect(this.group)
      setAllPanelsVisible(this.group)
      updateGpuMotionUniforms(this.group, this.interactions, this.motionTimeSeconds())
      updateDebugState(this.el, this.group, {
        dmsInteractionCount: this.interactionCount,
      })
      if (this.data.faceCameraOnStart && !this.data.placeFromCameraOnStart) {
        faceEntityTowardCamera(this.el)
      }
    },
  })
}

export function showRuntimeWarning(message) {
  const warning = document.getElementById('runtimeWarning')
  if (!warning) return
  warning.textContent = message
  warning.hidden = false
}

export function wireDmsControls() {
  const pulseButton = document.getElementById('pulseButton')
  const nextButton = document.getElementById('nextButton')
  const resetButton = document.getElementById('resetButton')
  const relockButton = document.getElementById('relockButton')
  const choiceButtons = [pulseButton, nextButton].filter(Boolean)
  let choiceCooldownUntil = 0
  let choiceCooldownTimer = 0

  const getInstallation = () => document.getElementById('dms-installation')

  const isInstallationReady = () => {
    const installation = getInstallation()
    return installation?.dataset?.dmsLoaded === 'true'
  }

  const emitInstallationEvent = (eventName, detail = {}) => {
    const installation = getInstallation()
    if (!installation) return false
    installation.dataset.dmsLastButtonEventAt = String(Math.round(performance.now()))
    installation.dataset.dmsLastButtonEvent = eventName
    if (typeof installation.emit === 'function') {
      installation.emit(eventName, detail)
      return true
    }
    installation.dispatchEvent(new CustomEvent(eventName, { detail }))
    return true
  }

  const bindInstantButton = (button, handler) => {
    if (!button) return
    let lastPointerAt = 0
    button.addEventListener('pointerdown', (event) => {
      lastPointerAt = performance.now()
      event.preventDefault()
      handler(event)
    }, { passive: false })
    button.addEventListener('click', (event) => {
      if (performance.now() - lastPointerAt < 600) return
      handler(event)
    })
  }

  const updateChoiceCooldown = () => {
    if (choiceCooldownTimer) {
      window.clearTimeout(choiceCooldownTimer)
      choiceCooldownTimer = 0
    }
    const remaining = Math.max(0, choiceCooldownUntil - performance.now())
    const cooling = remaining > 0
    choiceButtons.forEach((button) => {
      button.disabled = cooling
      button.classList.toggle('is-cooling', cooling)
      button.setAttribute('aria-disabled', cooling ? 'true' : 'false')
    })
    if (cooling) {
      choiceCooldownTimer = window.setTimeout(updateChoiceCooldown, Math.min(500, remaining))
    }
  }

  const startChoiceCooldown = () => {
    choiceCooldownUntil = performance.now() + CHOICE_BUTTON_COOLDOWN_MS
    updateChoiceCooldown()
  }

  const bindChoiceButton = (button, handler) => {
    bindInstantButton(button, (event) => {
      if (performance.now() < choiceCooldownUntil) {
        event?.preventDefault?.()
        return
      }
      if (!isInstallationReady()) {
        event?.preventDefault?.()
        return
      }
      if (handler(event) !== false) startChoiceCooldown()
    })
  }

  bindChoiceButton(pulseButton, () => {
    return emitInstallationEvent('dms-pulse', { mode: 'blue' })
  })
  bindChoiceButton(nextButton, () => {
    return emitInstallationEvent('dms-next', { mode: 'orange' })
  })
  bindInstantButton(resetButton, () => {
    emitInstallationEvent('dms-reset')
  })
  bindInstantButton(relockButton, () => {
    window.dispatchEvent(new CustomEvent('dms-relock-target'))
    window.dispatchEvent(new CustomEvent('dms-replace-world'))
  })
}

export function setupDmsPreviewScenePlayback() {
  if (!document.body?.matches('[data-preview-mode="desktop"]')) return

  const playPreviewScene = () => {
    const scene = document.querySelector('a-scene')
    if (!scene) return
    scene.play?.()
    scene.resize?.()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', playPreviewScene, { once: true })
  } else {
    playPreviewScene()
  }
}

let xrLifecycleConfigured = false

function setupImageTargetStatus(primaryTargetName) {
  if (!primaryTargetName || window.__dmsImageTargetStatusReady) return
  window.__dmsImageTargetStatusReady = true
  setArStatus({
    targetName: primaryTargetName,
    targetState: 'searching',
    anchorState: 'waiting',
    message: `Scan marker: ${primaryTargetName}`,
    hideStatus: false,
  })
}

function onxrloaded(options = {}) {
  console.info('XR8 loaded for Democracy Mirror Shards 8th Wall prototype')
  setArStatus({ xrLoaded: true })
  const imageTargets = Array.isArray(options.imageTargets) ? options.imageTargets.filter(Boolean) : []
  if (!imageTargets.length || xrLifecycleConfigured) return

  if (!window.XR8?.XrController?.configure) {
    setArStatus({
      imageTargetsConfigured: false,
      message: '8th Wall loaded, but marker setup is unavailable.',
      hideStatus: false,
    })
    showRuntimeWarning('8th Wall loaded, but XrController.configure was not available.')
    return
  }

  window.XR8.XrController.configure({
    imageTargetData: imageTargets,
  })
  xrLifecycleConfigured = true
  setArStatus({
    imageTargetsConfigured: true,
    message: `Scan marker: ${options.primaryTargetName || imageTargets[0]?.name || 'target'}`,
    hideStatus: false,
  })
  console.info(`Configured ${imageTargets.length} DMS marker target(s) for 8th Wall.`)
}

export function setupDmsXrLifecycle(options = {}) {
  setupImageTargetStatus(options.primaryTargetName)
  if (window.XR8) onxrloaded(options)
  else window.addEventListener('xrloaded', () => onxrloaded(options), { once: true })
}

export function setupDmsWorldLifecycle() {
  setupDmsWorldPoseProbe()
  setArStatus({
    targetName: 'world',
    targetState: 'world',
    anchorState: 'waiting-for-reality',
    imageTargetsConfigured: false,
    message: 'Starting AR world tracking...',
    hideStatus: false,
  })

  let worldReady = false
  const onWorldReady = () => {
    if (worldReady) return
    worldReady = true
    setArStatus({
      xrLoaded: true,
      targetState: 'world',
      anchorState: 'waiting-for-tracking',
      message: 'Aim center at the floor and move phone 20cm to lock a room anchor...',
      hideStatus: false,
    })
  }

  if (window.XR8) setArStatus({ xrLoaded: true })
  else window.addEventListener('xrloaded', () => setArStatus({ xrLoaded: true }), { once: true })
  window.addEventListener('realityready', onWorldReady, { once: true })

  const bindSceneRealityReady = () => {
    const scene = document.querySelector('a-scene')
    scene?.addEventListener('realityready', onWorldReady, { once: true })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSceneRealityReady, { once: true })
  } else {
    bindSceneRealityReady()
  }
}
