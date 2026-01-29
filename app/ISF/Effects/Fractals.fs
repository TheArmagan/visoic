/*{
  "DESCRIPTION": "Fractal-like zoom and motion through inverse complex function transformations.",
  "CATEGORIES": ["Distortion", "Animated"],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "zoom",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 10.0,
      "LABEL": "Zoom"
    },
    {
      "NAME": "speed",
      "TYPE": "float",
      "DEFAULT": 0,
      "MIN": 0,
      "MAX": 5.0,
      "LABEL": "Speed"
    }
  ]
}*/

#define PI 3.1415926535897932384626433832795

const float TAU = 2.0 * PI;

vec3 complex_powZK(vec3 z, vec3 k) {
  float th = mod(atan(z.y, z.x), TAU) + z.z * TAU;
  return vec3(
    pow(length(z.xy), k.x) * vec2(cos(th * k.x), sin(th * k.x)),
    floor(th * k.x / TAU)
  );
}

vec3 complex_multZK(vec3 z, vec3 k) {
  float th = mod(atan(z.y, z.x), TAU) + z.z * TAU;
  float ph = mod(atan(k.y, k.x), TAU) + k.z * TAU;
  return vec3(
    length(z.xy) * length(k.xy) * vec2(cos(th + ph), sin(th + ph)),
    floor((th + ph) / TAU)
  );
}

vec3 inv_f(vec3 z, float speedTime, float zoom) {
  float RANGE = 1.0;
  z.xy /= RANGE;
  z = complex_multZK(z, vec3(zoom, zoom, 0.0));
  z = complex_multZK(z - vec3(vec2(1.0, 0.0), z.z), complex_powZK(z + vec3(vec2(1.0, 0.0), z.z), vec3(-1.0, 0.0, 0.0)));
  z.x += speedTime;
  return z;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  float speedTime = TIME * speed; // Renamed to speedTime
  vec3 z = inv_f(vec3((uv - 0.5) * 2.0, 0.0), speedTime, zoom);
  z.xy = fract(z.xy * 0.5 + 0.5);
  vec4 color = IMG_NORM_PIXEL(inputImage, z.xy);
  gl_FragColor = color;
}
