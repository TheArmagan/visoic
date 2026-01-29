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
    }
  ],
  "CREDIT": "Gunnar Roth, based on work from natewave"
}*/

void main() {
    vec2 p = isf_FragNormCoord;

    vec2 block = floor(p.xy * RENDERSIZE.xy / vec2(16.0));
    vec2 uv_noise = block / vec2(64.0);
    uv_noise += floor(vec2(progress) * vec2(1200.0, 3500.0)) / vec2(64.0);

    vec2 dist = progress > 0.0 ? (fract(uv_noise) - 0.5) * 0.3 * (1.0 - progress) : vec2(0.0);

    vec2 red = p + dist * 0.2;
    vec2 green = p + dist * 0.3;
    vec2 blue = p + dist * 0.5;

    gl_FragColor = vec4(
        mix(IMG_NORM_PIXEL(startImage, red), IMG_NORM_PIXEL(endImage, red), progress).r,
        mix(IMG_NORM_PIXEL(startImage, green), IMG_NORM_PIXEL(endImage, green), progress).g,
        mix(IMG_NORM_PIXEL(startImage, blue), IMG_NORM_PIXEL(endImage, blue), progress).b,
        1.0
    );
}
