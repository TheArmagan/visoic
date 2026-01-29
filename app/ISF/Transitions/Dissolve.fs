/*{
  "CATEGORIES": [
    "Dissolve"
  ],
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
      "MAX": 1.0,
      "LABEL": "Progress"
    },
    {
      "NAME": "uLineWidth",
      "TYPE": "float",
      "DEFAULT": 0.1,
      "MIN": 0.01,
      "MAX": 0.5,
      "LABEL": "Line Width"
    },
    {
      "NAME": "uSpreadClr",
      "TYPE": "color",
      "DEFAULT": [1.0, 0.0, 0.0, 1.0],
      "LABEL": "Spread Color"
    },
    {
      "NAME": "uHotClr",
      "TYPE": "color",
      "DEFAULT": [0.9, 0.9, 0.2, 1.0],
      "LABEL": "Hot Color"
    },
    {
      "NAME": "uPow",
      "TYPE": "float",
      "DEFAULT": 5.0,
      "MIN": 1.0,
      "MAX": 10.0,
      "LABEL": "Power"
    },
    {
      "NAME": "uIntensity",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 5.0,
      "LABEL": "Intensity"
    }
  ],
  "CREDIT": "hjm1fb"
}*/

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(in vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;

    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec4 from = IMG_NORM_PIXEL(startImage, uv);
    vec4 to = IMG_NORM_PIXEL(endImage, uv);
    vec4 outColor;
    float burn = 0.5 + 0.5 * (0.299 * from.r + 0.587 * from.g + 0.114 * from.b);

    float show = burn - progress;
    if (show < 0.001) {
        outColor = to;
    } else {
        float factor = 1.0 - smoothstep(0.0, uLineWidth, show);
        vec3 burnColor = mix(uSpreadClr.rgb, uHotClr.rgb, factor);
        burnColor = pow(burnColor, vec3(uPow)) * uIntensity;
        vec3 finalRGB = mix(from.rgb, burnColor, factor * step(0.0001, progress));
        outColor = vec4(finalRGB * from.a, from.a);
    }
    
    gl_FragColor = outColor;
}
