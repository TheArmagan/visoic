/*{
  "CATEGORIES": [
    "Dissolve"
  ],
  "CREDIT": "Harmony",
  "DESCRIPTION": "Fades to black in the middle third of the transition.",
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
      "DEFAULT": 0,
      "MAX": 1,
      "MIN": 0,
      "NAME": "progress",
      "TYPE": "float"
    }
  ],
  "ISFVSN": "2"
}*/


vec4 getFromColor(vec2 uv) {
  return IMG_NORM_PIXEL(startImage, uv);
}

vec4 getToColor(vec2 uv) {
  return IMG_NORM_PIXEL(endImage, uv);
}

vec4 transition(vec2 uv) {
  if (progress < 0.33) {
    // Fade from startImage to black
    float p = smoothstep(0.0, 0.33, progress);
    return mix(getFromColor(uv), vec4(0.0, 0.0, 0.0, 1.0), p);
  } else if (progress < 0.66) {
    // Hold full black in the middle third
    return vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    // Fade from black to endImage
    float p = smoothstep(0.66, 1.0, progress);
    return mix(vec4(0.0, 0.0, 0.0, 1.0), getToColor(uv), p);
  }
}

void main() {
  gl_FragColor = transition(isf_FragNormCoord.xy);
}
