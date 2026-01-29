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
      "NAME": "strength",
      "TYPE": "float",
      "DEFAULT": 0.6,
      "MIN": 0.0,
      "MAX": 2.0,
      "LABEL": "Strength"
    }
  ],
  "CREDIT": "Ben Zhang"
}*/

#define PI 3.141592653589793

void main() {
    vec2 uv = isf_FragNormCoord;

    vec4 from = IMG_NORM_PIXEL(startImage, uv);
    vec4 to = IMG_NORM_PIXEL(endImage, uv);

    // Multipliers for transition effect
    float from_m = 1.0 - progress + sin(PI * progress) * strength;
    float to_m = progress + sin(PI * progress) * strength;

    gl_FragColor = vec4(
        from.r * from.a * from_m + to.r * to.a * to_m,
        from.g * from.a * from_m + to.g * to.a * to_m,
        from.b * from.a * from_m + to.b * to.a * to_m,
        mix(from.a, to.a, progress)
    );
}
