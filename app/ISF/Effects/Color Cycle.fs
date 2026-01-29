/*{
  "DESCRIPTION": "Cycles colors over time with speed control and smooth transitions.",
  "CATEGORIES": [
    "Color", "Animated"
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
      "NAME": "speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "LABEL": "Speed",
      "MIN": 0.0,
      "MAX": 10.0
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;

  // Calculate speed-modified time
  float speedTime = speed * TIME;

  // Access the input image
  vec4 tex = IMG_NORM_PIXEL(inputImage, uv);

  // Time varying pixel color with smoother transitions
  vec3 col = 0.5 + 0.5 * abs(cos(speedTime + uv.xyx * vec3(1.0, 1.2, 1.4) + vec3(0.0, 2.0, 4.0)));

  // Apply transformations to the color
  col = tex.rgb * 0.2 + tan(tex.rgb * vec3(3.0, 5.0, 50.0) + (speedTime / 135.0) * 100.0) * vec3(1.0, 0.1, 1.0);

  // Smoothstep for color banding
  col = smoothstep(0.0, 1.0, col);

  // Output final color
  gl_FragColor = vec4(col, tex.a);
}
