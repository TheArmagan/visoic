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
      "NAME": "displacementMap",
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
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 2.0,
      "LABEL": "Strength"
    }
  ],
  "CREDIT": "Travis Fischer, adapted from work by Robin Delaporte"
}*/

void main() {
    vec2 uv = isf_FragNormCoord;

    // Read the displacement value from the displacement map
    float displacement = IMG_NORM_PIXEL(displacementMap, uv).r * strength;

    // Compute displaced UV coordinates for both images
    vec2 uvFrom = vec2(uv.x + progress * displacement, uv.y);
    vec2 uvTo = vec2(uv.x - (1.0 - progress) * displacement, uv.y);

    // Sample images with displaced coordinates and interpolate
    gl_FragColor = mix(
        IMG_NORM_PIXEL(startImage, uvFrom),
        IMG_NORM_PIXEL(endImage, uvTo),
        progress
    );
}
