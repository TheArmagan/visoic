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
      "NAME": "luma",
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
  "CREDIT": "gre"
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    
    // Fetch grayscale luma value from the luma map
    float lumaValue = IMG_NORM_PIXEL(luma, uv).r;

    // Compute the transition using the luma value as a mask
    gl_FragColor = mix(
        IMG_NORM_PIXEL(endImage, uv),
        IMG_NORM_PIXEL(startImage, uv),
        step(progress, lumaValue)
    );
}
