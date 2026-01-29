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
    }
  ],
  "CREDIT": "haiyoucuv"
}*/

#define PI 3.1415926

vec2 rotate2D(vec2 uv, float angle) {
    return uv * mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Rotate around center
    vec2 p = fract(rotate2D(uv - 0.5, progress * PI * 2.0) + 0.5);

    // Blend between the two images
    gl_FragColor = mix(
        IMG_NORM_PIXEL(startImage, p),
        IMG_NORM_PIXEL(endImage, p),
        progress
    );
}
