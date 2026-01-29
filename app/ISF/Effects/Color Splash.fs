/*{
  "DESCRIPTION": "Converts non-splash colors to grayscale.",
  "CATEGORIES": [
    "Color", "Static"
  ],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "VSN": "1.0",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "splashColor",
      "TYPE": "color",
      "DEFAULT": [1.0, 0.0, 0.0, 1.0],
      "LABEL": "Splash Color"
    },
    {
      "NAME": "threshold",
      "TYPE": "float",
      "DEFAULT": 0.2,
      "LABEL": "Threshold",
      "MIN": 0.0,
      "MAX": 1.0
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;

  // Sample the input image
  vec4 texel = IMG_NORM_PIXEL(inputImage, uv);
  vec3 color = texel.rgb;
  
  // Convert to grayscale
  float gray = dot(color, vec3(0.299, 0.587, 0.114));

  // Determine the difference between this color and the splash color
  float diff = distance(color, splashColor.rgb);

  // If the color is close to the splash color, keep it, otherwise, use grayscale
  color = mix(vec3(gray), color, step(diff, threshold));

  // Output the final color
  gl_FragColor = vec4(color, texel.a);
}
