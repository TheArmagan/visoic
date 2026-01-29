/*{
  "CATEGORIES": [
    "Distortion"
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
      "NAME": "scale",
      "TYPE": "float",
      "DEFAULT": 2.0,
      "MIN": 0.5,
      "MAX": 5.0,
      "LABEL": "Scale"
    },
    {
      "NAME": "z",
      "TYPE": "float",
      "DEFAULT": 1.5,
      "MIN": 0.5,
      "MAX": 3.0,
      "LABEL": "Zoom"
    },
    {
      "NAME": "speed",
      "TYPE": "float",
      "DEFAULT": 5.0,
      "MIN": 0.1,
      "MAX": 10.0,
      "LABEL": "Speed"
    }
  ],
  "CREDIT": "Boundless"
}*/

#define PI 3.14159265358979
const float rad = 120.0;
const float deg = rad / 180.0 * PI;
float dist = scale / 10.0;

vec2 refl(vec2 p, vec2 o, vec2 n) {
    return 2.0 * o + 2.0 * n * dot(p - o, n) - p;
}

vec2 rot(vec2 p, vec2 o, float a) {
    float s = sin(a);
    float c = cos(a);
    return o + mat2(c, -s, s, c) * (p - o);
}

vec4 mainImage(vec2 uv) {
    vec2 uv0 = uv;
    uv -= 0.5;
    uv.x *= RENDERSIZE.x / RENDERSIZE.y;
    uv *= z;
    uv = rot(uv, vec2(0.0), progress * speed);

    float theta = progress * 6.0 + PI / 0.5;
    for (int iter = 0; iter < 10; iter++) {
        for (float i = 0.0; i < 2.0 * PI; i += deg) {
            float ts = sign(asin(cos(i))) == 1.0 ? 1.0 : 0.0;
            if (((ts == 1.0) && (uv.y - dist * cos(i) > tan(i) * (uv.x + dist * +sin(i)))) ||
                ((ts == 0.0) && (uv.y - dist * cos(i) < tan(i) * (uv.x + dist * +sin(i))))) {
                uv = refl(vec2(uv.x + sin(i) * dist * 2.0, uv.y - cos(i) * dist * 2.0), vec2(0.0, 0.0), vec2(cos(i), sin(i)));
            }
        }
    }

    uv += 0.5;
    uv = rot(uv, vec2(0.5), progress * -speed);
    uv -= 0.5;
    uv.x /= RENDERSIZE.x / RENDERSIZE.y;
    uv += 0.5;
    uv = 2.0 * abs(uv / 2.0 - floor(uv / 2.0 + 0.5));

    vec2 uvMix = mix(uv, uv0, cos(progress * PI * 2.0) / 2.0 + 0.5);
    vec4 color = mix(IMG_NORM_PIXEL(startImage, uvMix), IMG_NORM_PIXEL(endImage, uvMix), cos((progress - 1.0) * PI) / 2.0 + 0.5);
    return color;
}

void main() {
    vec2 uv = isf_FragNormCoord;
    gl_FragColor = mainImage(uv);
}
