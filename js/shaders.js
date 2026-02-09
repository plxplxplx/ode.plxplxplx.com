import * as THREE from 'three';

// =====================================================
// GOD RAYS SHADER (screen-space radial blur)
// =====================================================
export const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    tOcclusion: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.5) },
    exposure: { value: 0.45 },
    decay: { value: 0.97 },
    density: { value: 0.9 },
    weight: { value: 0.8 },
    samples: { value: 80 },
    godRayColor: { value: new THREE.Vector3(1.0, 0.85, 0.55) },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tOcclusion;
    uniform vec2 lightPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform int samples;
    uniform vec3 godRayColor;
    varying vec2 vUv;
    void main(){
      vec2 texCoord = vUv;
      vec2 deltaTexCoord = (texCoord - lightPosition);
      deltaTexCoord *= 1.0 / float(samples) * density;
      vec4 col = texture2D(tDiffuse, vUv);
      float illumination = 0.0;
      float currentDecay = 1.0;
      vec2 sampleCoord = texCoord;
      for(int i = 0; i < 80; i++){
        sampleCoord -= deltaTexCoord;
        float s = texture2D(tOcclusion, sampleCoord).r;
        s *= currentDecay * weight;
        illumination += s;
        currentDecay *= decay;
      }
      illumination *= exposure;
      col.rgb += godRayColor * illumination;
      gl_FragColor = col;
    }
  `,
};

// =====================================================
// VIGNETTE SHADER
// =====================================================
export const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null }, darkness: { value: 0.8 },
    offset: { value: 1.2 }, tintColor: { value: new THREE.Vector3(0.08, 0.04, 0.02) },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;uniform float darkness;uniform float offset;uniform vec3 tintColor;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 u=(vUv-0.5)*offset;float v=1.0-dot(u,u)*darkness;
    gl_FragColor=vec4(c.rgb*v+tintColor*(1.0-v)*0.3,c.a);}`,
};

// =====================================================
// CHROMATIC ABERRATION SHADER
// =====================================================
export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.005 },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main(){
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      float offset = amount * d * d;
      float r = texture2D(tDiffuse, vUv + dir * offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * offset).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};

// =====================================================
// FILM GRAIN SHADER
// =====================================================
export const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    intensity: { value: 0.1 },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      float grain = (rand(vUv * time) - 0.5) * intensity;
      col.rgb += grain;
      gl_FragColor = col;
    }
  `,
};

// =====================================================
// COLOR GRADING SHADER (lift/gamma/gain + saturation)
// =====================================================
export const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 0.65 },
    contrast: { value: 1.2 },
    brightness: { value: 0.02 },
    tintR: { value: 1.1 },
    tintG: { value: 0.95 },
    tintB: { value: 0.78 },
  },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float contrast;
    uniform float brightness;
    uniform float tintR, tintG, tintB;
    varying vec2 vUv;
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      // Saturation
      float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
      col.rgb = mix(vec3(lum), col.rgb, saturation);
      // Contrast + brightness
      col.rgb = (col.rgb - 0.5) * contrast + 0.5 + brightness;
      // Tint
      col.rgb *= vec3(tintR, tintG, tintB);
      gl_FragColor = col;
    }
  `,
};

// =====================================================
// ORGANIC FOLDING LEAFLET SHADERS (for cards)
// =====================================================
export const leafletVert = `
  uniform float time;
  uniform float phase;
  uniform float curviness;
  uniform float bendAmount;
  varying vec2 vUv;
  varying float vDisplacement;

  // Simplex 3D noise
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);
    const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);
    vec3 l=1.0-g;
    vec3 i1=min(g.xyz,l.zxy);
    vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;
    vec3 x2=x0-i2+C.yyy;
    vec3 x3=x0-D.yyy;
    i=mod(i,289.0);
    vec4 p=permute(permute(permute(
      i.z+vec4(0.0,i1.z,i2.z,1.0))
      +i.y+vec4(0.0,i1.y,i2.y,1.0))
      +i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=1.0/7.0;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);
    vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;
    vec4 y=y_*ns.x+ns.yyyy;
    vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);
    vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;
    vec4 s1=floor(b1)*2.0+1.0;
    vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);
    vec3 p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z);
    vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main(){
    vUv = uv;
    vec3 pos = position;

    // Cylindrical bend — paper curling effect
    float bendAngle = pos.x * 3.14159 * bendAmount;
    float radius = 0.4;
    float bentZ = sin(bendAngle) * radius;
    float bentX = cos(bendAngle) * radius - radius;
    pos.z += bentZ * bendAmount;
    pos.x += bentX * bendAmount * 0.3;

    // Simplex noise displacement — organic wrinkles
    float t = time * 0.3 + phase;
    float n1 = snoise(vec3(pos.xy * 2.5, t)) * 0.08 * curviness;
    float n2 = snoise(vec3(pos.xy * 5.0, t * 0.7 + 10.0)) * 0.03 * curviness;
    pos.z += n1 + n2;

    // Gentle wave along Y axis — breathing effect
    pos.z += sin(pos.y * 4.0 + time * 0.8 + phase) * 0.02 * curviness;

    // Corner lift — slight diagonal curl
    float cornerDist = length(pos.xy - vec2(0.5, 0.5));
    pos.z += cornerDist * 0.06 * sin(time * 0.5 + phase) * curviness;

    vDisplacement = pos.z - position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const leafletFrag = `
  uniform sampler2D image;
  uniform float opacity;
  varying vec2 vUv;
  varying float vDisplacement;

  void main(){
    // Flip UV.x on back face so image reads correctly from both sides
    vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
    vec4 tex = texture2D(image, uv);
    // Subtle shading from displacement — folds catch light
    float shade = 1.0 + vDisplacement * 2.5;
    shade = clamp(shade, 0.8, 1.3);
    // Back face: slightly cooler/dimmer tint so it reads as "back of print"
    if (!gl_FrontFacing) {
      shade *= 0.92;
      tex.rgb = mix(tex.rgb, vec3(dot(tex.rgb, vec3(0.3, 0.6, 0.1))), 0.15);
    }
    gl_FragColor = vec4(tex.rgb * shade, tex.a * opacity);
  }
`;

// =====================================================
// RIBBON FLAG-WAVE SHADERS (for typography)
// =====================================================
export const ribbonVert = `
  uniform float time;
  uniform float phase;
  varying vec2 vUv;
  varying float vDisplacement;

  void main(){
    vUv = vec2(uv.x, 1.0 - uv.y); // flip V so text reads correctly
    vec3 pos = position;

    // Radial direction (outward from cylinder center)
    vec3 radial = normalize(vec3(pos.x, 0.0, pos.z));

    // Flag wave — sinusoidal waves propagating along arc (uv.x)
    float u = uv.x;
    float wave1 = sin(u * 8.0 - time * 1.2 + phase) * 0.15;
    float wave2 = sin(u * 13.0 - time * 0.7 + phase * 2.3) * 0.07;
    float wave3 = sin(u * 3.5 + time * 0.4 + phase * 0.7) * 0.18;

    // More flutter toward the free end
    float edgeFactor = u * u;

    // Vertical ripple
    float vertWave = sin(uv.y * 5.0 + time * 1.3 + phase) * 0.04;

    float totalDisp = (wave1 + wave2 + wave3) * edgeFactor + vertWave;

    // Displace outward along radial direction
    pos += radial * totalDisp;

    vDisplacement = totalDisp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const ribbonFrag = `
  uniform sampler2D map;
  uniform float opacity;
  uniform float brightness;
  varying vec2 vUv;
  varying float vDisplacement;

  void main(){
    vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
    vec4 tex = texture2D(map, uv);
    // Fold shading — highlights and shadows from displacement
    float shade = 1.0 + vDisplacement * 3.0;
    shade = clamp(shade, 0.85, 1.25);
    if (!gl_FrontFacing) {
      shade *= 0.88;
    }
    gl_FragColor = vec4(tex.rgb * shade * brightness, tex.a * opacity);
  }
`;
