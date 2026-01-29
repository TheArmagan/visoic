/*{
  "DESCRIPTION": "Ripple Transition Effect",
  "CREDIT": "Converted to ISF",
  "CATEGORIES": ["Distortion"],
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
      "NAME": "displacement",
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
      "NAME": "width",
      "TYPE": "float",
      "DEFAULT": 0.2,
      "MIN": 0.01,
      "MAX": 0.5,
      "LABEL": "Ripple Width"
    },
    {
      "NAME": "radius",
      "TYPE": "float",
      "DEFAULT": 0.6,
      "MIN": 0.1,
      "MAX": 0.75,
      "LABEL": "Ripple Radius"
    }
  ]
}*/

float parabola(float x, float k) {
    return pow(4.0 * x * (1.0 - x), k);
}

void main() {
    vec2 uv = isf_FragNormCoord;

    // Normalize aspect ratio
    vec2 aspect = vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
    vec2 start = vec2(0.5, 0.5);

    // Parabola-based interpolation for smooth ripple effect
    float dt = parabola(progress, 1.0);

    // Fetch noise from displacement map
    vec4 noise = IMG_NORM_PIXEL(displacement, fract(uv + 0.0 * 0.04));
    float prog = progress * 0.66 + noise.g * 0.04;

    // Generate circular ripple effect
    float circ = 1.0 - smoothstep(-width, 0.0, radius * distance(start * aspect, uv * aspect) - prog * (1.0 + width));
    float intpl = pow(abs(circ), 1.0);

    // Apply ripple effect to image transition
    vec4 t1 = IMG_NORM_PIXEL(startImage, (uv - 0.5) * (1.0 - intpl) + 0.5);
    vec4 t2 = IMG_NORM_PIXEL(endImage, (uv - 0.5) * intpl + 0.5);

    gl_FragColor = mix(t1, t2, intpl);
}
