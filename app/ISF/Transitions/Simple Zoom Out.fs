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
      "NAME": "progress",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 1.0,
      "LABEL": "Progress"
    },
    {
      "NAME": "zoom_quickness",
      "TYPE": "float",
      "DEFAULT": 0.8,
      "MIN": 0.2,
      "MAX": 1.0,
      "LABEL": "Zoom Quickness"
    },
    {
      "NAME": "fade",
      "TYPE": "bool",
      "DEFAULT": true,
      "LABEL": "Fade"
    }
  ],
  "CREDIT": "Tianshuo"
}*/

vec2 zoom(vec2 uv, float amount) {
    return 0.5 + ((uv - 0.5) * (1.0 - amount));    
}

void main() {
    vec2 uv = isf_FragNormCoord;
    float nQuick = clamp(zoom_quickness, 0.2, 1.0);
    
    float zoomAmount = 1.0 - smoothstep(1.0 - nQuick, 1.0, progress);
    vec2 zoomedUV = zoom(uv, zoomAmount);

    float fadeAmount = fade ? smoothstep(1.0 - nQuick, 1.0, progress) : (progress < 1.0 - nQuick ? 0.0 : 1.0);
    
    vec4 fromColor = IMG_NORM_PIXEL(startImage, uv);
    vec4 toColor = IMG_NORM_PIXEL(endImage, zoomedUV);

    gl_FragColor = mix(fromColor, toColor, fadeAmount);
}
