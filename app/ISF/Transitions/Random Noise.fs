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
  "CREDIT": "towrabbit"
}*/

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Get pixel colors from both images
    vec4 leftSide = IMG_NORM_PIXEL(startImage, uv);
    vec4 rightSide = IMG_NORM_PIXEL(endImage, uv);

    // Generate randomized pixel-based transition
    float uvz = floor(random(uv) + progress);
    float p = progress * 2.0;

    vec4 mixedTransition = mix(leftSide, rightSide, uvz);
    vec4 wipeTransition = leftSide * ceil(uv.x * 2.0 - p) + rightSide * ceil(-uv.x * 2.0 + p);

    // Use the randomized pixel shuffle transition
    gl_FragColor = mixedTransition;
}
