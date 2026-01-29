/*{
  "CATEGORIES": [
    "Wipe"
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
      "NAME": "progress",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 1.0,
      "LABEL": "Progress"
    },
    {
      "NAME": "type",
      "TYPE": "long",
      "DEFAULT": 0,
      "VALUES": [0, 1, 2, 3, 4, 5, 6, 7, 8],
      "LABELS": ["Top", "Right", "Bottom", "Left", "Top Right", "Bottom Right", "Bottom Left", "Top Left", "Center"],
      "LABEL": "Slide Direction"
    },
    {
      "NAME": "In",
      "TYPE": "bool",
      "DEFAULT": false,
      "LABEL": "Slide In"
    }
  ],
  "CREDIT": "Mark Craig"
}*/

#define rad2 rad / 2.0

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 uv0 = uv;
    
    float rad = In ? progress : 1.0 - progress;
    float xc1, yc1;

    if (type == 0) { xc1 = 0.5 - rad2; yc1 = 0.0; }
    else if (type == 1) { xc1 = 1.0 - rad; yc1 = 0.5 - rad2; }
    else if (type == 2) { xc1 = 0.5 - rad2; yc1 = 1.0 - rad; }
    else if (type == 3) { xc1 = 0.0; yc1 = 0.5 - rad2; }
    else if (type == 4) { xc1 = 1.0 - rad; yc1 = 0.0; }
    else if (type == 5) { xc1 = 1.0 - rad; yc1 = 1.0 - rad; }
    else if (type == 6) { xc1 = 0.0; yc1 = 1.0 - rad; }
    else if (type == 7) { xc1 = 0.0; yc1 = 0.0; }
    else if (type == 8) { xc1 = 0.5 - rad2; yc1 = 0.5 - rad2; }
    
    uv.y = 1.0 - uv.y;
    vec2 uv2;

    if ((uv.x >= xc1) && (uv.x <= xc1 + rad) && (uv.y >= yc1) && (uv.y <= yc1 + rad)) {
        uv2 = vec2((uv.x - xc1) / rad, 1.0 - (uv.y - yc1) / rad);
        gl_FragColor = In ? IMG_NORM_PIXEL(endImage, uv2) : IMG_NORM_PIXEL(startImage, uv2);
    } else {
        gl_FragColor = In ? IMG_NORM_PIXEL(startImage, uv0) : IMG_NORM_PIXEL(endImage, uv0);
    }
}
