/*{
  "DESCRIPTION": "Excludes or copies red, green, or blue color channels.",
  "CATEGORIES": [
    "Color", "Static"
  ],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "excludeMode",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1, 2, 3, 4, 5],
      "LABELS": ["Exclude Red", "Exclude Green", "Exclude Blue", "Copy Red", "Copy Green", "Copy Blue"],
      "LABEL": "Exclude Mode"
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);
  vec3 affectedColor = originalColor.rgb;
  
  // Exclude or Copy Color Channels Based on Mode
  if (excludeMode == 0) {
    affectedColor.r = 0.0; // Exclude Red
  } else if (excludeMode == 1) {
    affectedColor.g = 0.0; // Exclude Green
  } else if (excludeMode == 2) {
    affectedColor.b = 0.0; // Exclude Blue
  } else if (excludeMode == 3) {
    affectedColor.g = 0.0;
    affectedColor.b = 0.0; // Copy Red
  } else if (excludeMode == 4) {
    affectedColor.r = 0.0;
    affectedColor.b = 0.0; // Copy Green
  } else if (excludeMode == 5) {
    affectedColor.r = 0.0;
    affectedColor.g = 0.0; // Copy Blue
  }
  
  gl_FragColor = vec4(affectedColor, originalColor.a);
}
