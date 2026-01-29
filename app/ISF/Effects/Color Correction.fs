/*{
  "DESCRIPTION": "Adjusts the red, green, and blue channels using power, multiplier, and addition values.",
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
      "NAME": "powr",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 3.0,
      "LABEL": "Power Red"
    },
    {
      "NAME": "powg",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 3.0,
      "LABEL": "Power Green"
    },
    {
      "NAME": "powb",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.1,
      "MAX": 3.0,
      "LABEL": "Power Blue"
    },
    {
      "NAME": "mulr",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 2.0,
      "LABEL": "Multiplier Red"
    },
    {
      "NAME": "mulg",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 2.0,
      "LABEL": "Multiplier Green"
    },
    {
      "NAME": "mulb",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 2.0,
      "LABEL": "Multiplier Blue"
    },
    {
      "NAME": "addr",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": -1.0,
      "MAX": 1.0,
      "LABEL": "Addition Red"
    },
    {
      "NAME": "addg",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": -1.0,
      "MAX": 1.0,
      "LABEL": "Addition Green"
    },
    {
      "NAME": "addb",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": -1.0,
      "MAX": 1.0,
      "LABEL": "Addition Blue"
    }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  vec4 originalColor = IMG_NORM_PIXEL(inputImage, uv);

  vec3 correctedColor = originalColor.rgb;

  // Use safeBase to avoid undefined behavior for non-positive bases
  float safeBaseR = max(correctedColor.r + addr, 0.0001);
  float safeBaseG = max(correctedColor.g + addg, 0.0001);
  float safeBaseB = max(correctedColor.b + addb, 0.0001);

  correctedColor = vec3(
    mulr * pow(safeBaseR, powr),
    mulg * pow(safeBaseG, powg),
    mulb * pow(safeBaseB, powb)
  );

  gl_FragColor = vec4(correctedColor, originalColor.a);
}
