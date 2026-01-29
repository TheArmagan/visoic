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
      "NAME": "bgcolor",
      "TYPE": "color",
      "DEFAULT": [0.0, 0.0, 0.0, 1.0],
      "LABEL": "Background Color"
    }
  ],
  "CREDIT": "martiniti"
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    float s = pow(2.0 * abs(progress - 0.5), 3.0);
    
    vec2 q = uv.xy;
    
    // bottom-left transition mask
    vec2 bl = step(vec2(1.0 - 2.0 * abs(progress - 0.5)), q + 0.25);
    
    // top-right transition mask
    vec2 tr = step(vec2(1.0 - 2.0 * abs(progress - 0.5)), 1.25 - q);
    
    float dist = length(1.0 - bl.x * bl.y * tr.x * tr.y);
    
    vec4 fromColor = IMG_NORM_PIXEL(startImage, uv);
    vec4 toColor = IMG_NORM_PIXEL(endImage, uv);
    
    gl_FragColor = mix(
        progress < 0.5 ? fromColor : toColor,
        bgcolor,
        step(s, dist)
    );
}
