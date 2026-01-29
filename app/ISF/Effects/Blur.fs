/*{
  "DESCRIPTION": "Gaussian-like blur with adjustable strength.",
  "CATEGORIES": [
    "Texture", "Static"
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
      "NAME": "blur",
      "TYPE": "float",
      "DEFAULT": 0.005,
      "MIN": 0.0,
      "MAX": 0.02,
      "LABEL": "Blur Strength"
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 sum = vec4(0.0);
  
  // Create a Gaussian-like blur using multiple samples
  const int passes = 20; 
  for (int xi = 0; xi < passes; xi++) {
    float x = float(xi) / float(passes) - 0.5;
    for (int yi = 0; yi < passes; yi++) {
      float y = float(yi) / float(passes) - 0.5;
      vec2 offset = vec2(x, y) * blur;
      sum += IMG_NORM_PIXEL(inputImage, uv + offset);
    }
  }

  // Average the color value
  sum /= float(passes * passes);
  
  gl_FragColor = sum;
}
