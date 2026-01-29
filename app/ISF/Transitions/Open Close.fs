/*{
  "CATEGORIES": [
    "Wipe"
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
      "NAME": "direction",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1, 2, 3],
      "LABELS": ["Vertical Open", "Vertical Close", "Horizontal Open", "Horizontal Close"],
      "LABEL": "Transition Mode"
    }
  ],
  "CREDIT": "martiniti"
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float t = progress;
    float regress = 1.0 - progress;
    float s = 0.0;

    if (direction == 0) { // Vertical Open
        s = 2.0 - abs((uv.y - 0.5) / (t - 1.0)) - 2.0 * t;
        gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), smoothstep(0.5, 0.0, s));
    }
    else if (direction == 1) { // Vertical Close
        s = 2.0 - abs((uv.y - 0.5) / (regress - 1.0)) - 2.0 * regress;
        gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), smoothstep(0.0, 0.5, s));
    }
    else if (direction == 2) { // Horizontal Open
        s = 2.0 - abs((uv.x - 0.5) / (t - 1.0)) - 2.0 * t;
        gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), smoothstep(0.5, 0.0, s));
    }
    else if (direction == 3) { // Horizontal Close
        s = 2.0 - abs((uv.x - 0.5) / (regress - 1.0)) - 2.0 * regress;
        gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), smoothstep(0.0, 0.5, s));
    }
}
