/*{
  "DESCRIPTION": "Zoom Transition Effect",
  "CREDIT": "Converted to ISF",
  "CATEGORIES": ["Wipe"],
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
  ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float x = progress;

    // Compute zoomed coordinates
    vec2 zoomFrom = (uv - 0.5) * (1.0 - x) + 0.5;
    vec2 zoomTo = (uv - 0.5) * x + 0.5;

    // Sample images and blend
    gl_FragColor = mix(
        IMG_NORM_PIXEL(startImage, zoomFrom),
        IMG_NORM_PIXEL(endImage, zoomTo),
        x
    );
}
