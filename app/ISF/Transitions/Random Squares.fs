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
      "NAME": "size",
      "TYPE": "point2D",
      "DEFAULT": [10.0, 10.0],
      "MIN": [2.0, 2.0],
      "MAX": [50.0, 50.0],
      "LABEL": "Block Size"
    },
    {
      "NAME": "smoothness",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 1.0,
      "LABEL": "Smoothness"
    }
  ],
  "CREDIT": "gre"
}*/

float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    
    // Generate a random value for each grid-based block
    float r = rand(floor(size * uv));
    
    // Apply smoothstep-based transition effect
    float m = smoothstep(0.0, -smoothness, r - (progress * (1.0 + smoothness)));
    
    // Blend images based on randomized block pattern
    gl_FragColor = mix(IMG_NORM_PIXEL(startImage, uv), IMG_NORM_PIXEL(endImage, uv), m);
}
