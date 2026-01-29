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
      "NAME": "n_noise_pixels",
      "TYPE": "float",
      "DEFAULT": 200.0,
      "MIN": 50.0,
      "MAX": 500.0,
      "LABEL": "Noise Density"
    },
    {
      "NAME": "static_luminosity",
      "TYPE": "float",
      "DEFAULT": 0.8,
      "MIN": 0.0,
      "MAX": 1.0,
      "LABEL": "Static Luminosity"
    }
  ],
  "CREDIT": "Ben Lucas"
}*/

float rnd(vec2 st) {
    return fract(sin(dot(st.xy, vec2(10.5302340293, 70.23492931))) * 12345.5453123);
}

vec4 staticNoise(vec2 st, float offset, float luminosity) {
    float staticR = luminosity * rnd(st * vec2(offset * 2.0, offset * 3.0));
    float staticG = luminosity * rnd(st * vec2(offset * 3.0, offset * 5.0));
    float staticB = luminosity * rnd(st * vec2(offset * 5.0, offset * 7.0));
    return vec4(staticR, staticG, staticB, 1.0);
}

float staticIntensity(float t) {
    float transitionProgress = abs(2.0 * (t - 0.5));
    float transformedThreshold = 1.2 * (1.0 - transitionProgress) - 0.1;
    return min(1.0, transformedThreshold);
}

void main() {
    vec2 uv = isf_FragNormCoord;

    float baseMix = step(0.5, progress);
    vec4 transitionMix = mix(
        IMG_NORM_PIXEL(startImage, uv),
        IMG_NORM_PIXEL(endImage, uv),
        baseMix
    );

    vec2 uvStatic = floor(uv * n_noise_pixels) / n_noise_pixels;
    vec4 staticColor = staticNoise(uvStatic, progress, static_luminosity);

    float staticThresh = staticIntensity(progress);
    float staticMix = step(rnd(uvStatic), staticThresh);

    gl_FragColor = mix(transitionMix, staticColor, staticMix);
}
