/*{
  "DESCRIPTION": "Maps color tones to highlights and shadows based on luminance.",
  "CATEGORIES": ["Color", "Static"],
  "CREDIT": "Nuvotion",
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "lightColor",
      "TYPE": "color",
      "DEFAULT": [0.98039215, 0.1568627450980392, 1.0],
      "DEFAULT2": [0.0, 0.0, 0.0, 1.0],
      "LABEL": "Highlights"
    },
    {
      "NAME": "darkColor",
      "TYPE": "color",
      "DEFAULT": [0.40784313725490196, 0.7372549019607844, 0.0, 1.0],
      "LABEL": "Shadows"
    }
  ]
}*/

float luma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 col = IMG_NORM_PIXEL(inputImage, uv).rgb;
  col = clamp(col, 0.0, 1.0);
  col = mix(darkColor.rgb, lightColor.rgb, luma(col));
  vec4 cga = IMG_NORM_PIXEL(inputImage, uv);

  gl_FragColor = vec4(col, cga.a);
}
