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
      "NAME": "FadeInSecond",
      "TYPE": "bool",
      "DEFAULT": true,
      "LABEL": "Fade In Second"
    },
    {
      "NAME": "ReverseEffect",
      "TYPE": "bool",
      "DEFAULT": false,
      "LABEL": "Reverse Effect"
    },
    {
      "NAME": "ReverseRotation",
      "TYPE": "bool",
      "DEFAULT": false,
      "LABEL": "Reverse Rotation"
    }
  ],
  "CREDIT": "Mark Craig"
}*/

#define M_PI 3.14159265358979323846
#define _TWOPI 6.283185307179586476925286766559

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 resolution = vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);

    float t = ReverseEffect ? 1.0 - progress : progress;
    float theta = ReverseRotation ? _TWOPI * t : -_TWOPI * t;
    float c1 = cos(theta);
    float s1 = sin(theta);
    float rad = max(0.00001, 1.0 - t);

    float xc1 = (uv.x - 0.5) * resolution.x;
    float yc1 = (uv.y - 0.5) * resolution.y;
    float xc2 = (xc1 * c1 - yc1 * s1) / rad;
    float yc2 = (xc1 * s1 + yc1 * c1) / rad;
    vec2 uv2 = vec2(xc2 + resolution.x / 2.0, yc2 + resolution.y / 2.0);

    vec4 col3;
    vec4 ColorTo = ReverseEffect ? IMG_NORM_PIXEL(startImage, uv) : IMG_NORM_PIXEL(endImage, uv);

    if ((uv2.x >= 0.0) && (uv2.x <= resolution.x) && (uv2.y >= 0.0) && (uv2.y <= resolution.y)) {
        uv2 /= resolution;
        col3 = ReverseEffect ? IMG_NORM_PIXEL(endImage, uv2) : IMG_NORM_PIXEL(startImage, uv2);
    } else {
        col3 = FadeInSecond ? vec4(0.0, 0.0, 0.0, 1.0) : ColorTo;
    }

    gl_FragColor = mix(col3, ColorTo, t);
}
