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
    }
  ],
  "CREDIT": "zhmy"
}*/

const vec4 black = vec4(0.0, 0.0, 0.0, 1.0);
const vec2 boundMin = vec2(0.0, 0.0);
const vec2 boundMax = vec2(1.0, 1.0);

bool inBounds(vec2 p) {
    return all(lessThan(boundMin, p)) && all(lessThan(p, boundMax));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 spfr, spto;

    float size = mix(1.0, 3.0, progress * 0.2);
    spto = (uv + vec2(-0.5, -0.5)) * vec2(size, size) + vec2(0.5, 0.5);
    spfr = (uv - vec2(1.0 - progress, 0.0));

    if (inBounds(spfr)) {
        gl_FragColor = IMG_NORM_PIXEL(endImage, spfr);
    } else if (inBounds(spto)) {
        gl_FragColor = IMG_NORM_PIXEL(startImage, spto) * (1.0 - progress);
    } else {
        gl_FragColor = black;
    }
}
