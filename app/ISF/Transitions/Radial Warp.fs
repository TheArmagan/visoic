/*{
  "DESCRIPTION": "Radial Warp Transition Effect",
  "CREDIT": "Converted to ISF",
  "CATEGORIES": ["Distortion"],
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "startImage",
      "TYPE": "image"
    },
    {
      "NAME": "endImage",
      "TYPE": "image"
    },
    {
      "NAME": "progress",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 1.0
    },
    {
      "NAME": "useNoise",
      "TYPE": "bool",
      "DEFAULT": false,
      "LABEL": "Enable Noise"
    }
  ]
}*/

mat2 rotate(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

const float PI = 3.1415;
const float noiseSeed = 2.0;

float random(vec2 uv) { 
    return fract(sin(noiseSeed + dot(uv, vec2(12.9898, 4.1414))) * 43758.5453);
}

float hash(float n) { return fract(sin(n) * 1e4); }
float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }

float hnoise(vec2 x) {
    vec2 i = floor(x);
    vec2 f = fract(x);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
    vec2 uv = isf_FragNormCoord;
    
    // Generate noise-based displacement if enabled
    float hn = useNoise ? hnoise(uv * RENDERSIZE / 100.0) : 0.0;

    // Radial movement direction
    vec2 direction = normalize(vec2(0.5) - uv);
    
    // Compute offset UVs for warp effect
    vec2 uv1 = uv + direction * (progress / 5.0) * (1.0 + hn / 2.0);
    vec2 uv2 = uv - direction * ((1.0 - progress) / 5.0) * (1.0 + hn / 2.0);

    // Fetch colors from both images
    vec4 t1 = IMG_NORM_PIXEL(startImage, uv1);
    vec4 t2 = IMG_NORM_PIXEL(endImage, uv2);

    // Blend transition smoothly
    gl_FragColor = mix(t1, t2, progress);
}
