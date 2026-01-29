/*{
    "CATEGORIES": [
        "Layer", "Static"
    ],
    "DESCRIPTION": "Scales uniformly or independently along X and Y axes around a customizable center point.",
    "CREDIT": "by VIDVOX",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image",
            "LABEL": "Input Image"
        },
        {
            "DEFAULT": 1,
            "MAX": 3,
            "MIN": 0.01,
            "NAME": "scale",
            "LABEL": "Scale",
            "TYPE": "float"
        },
        {
            "DEFAULT": 1,
            "MAX": 3,
            "MIN": 0.01,
            "NAME": "scaleX",
            "LABEL": "Horizontal Scale",
            "TYPE": "float"
        },
        {
            "DEFAULT": 1,
            "MAX": 3,
            "MIN": 0.01,
            "NAME": "scaleY",
            "LABEL": "Vertical Scale",
            "TYPE": "float"
        },
        {
            "DEFAULT": [
                0.5,
                0.5
            ],
            "MAX": [
                1,
                1
            ],
            "MIN": [
                0,
                0
            ],
            "NAME": "center",
            "LABEL": "Center",
            "TYPE": "point2D"
        }
    ],
    "ISFVSN": "2"
}
*/

void main() {
  vec2 loc = isf_FragNormCoord;
  vec2 modifiedCenter = center;
  
  loc.x = (loc.x - modifiedCenter.x) * (1.0 / (scale * scaleX)) + modifiedCenter.x;
  loc.y = (loc.y - modifiedCenter.y) * (1.0 / (scale * scaleY)) + modifiedCenter.y;

  if (loc.x < 0.0 || loc.y < 0.0 || loc.x > 1.0 || loc.y > 1.0) {
    gl_FragColor = vec4(0.0);
  } else {
    gl_FragColor = IMG_NORM_PIXEL(inputImage, loc);
  }
}
