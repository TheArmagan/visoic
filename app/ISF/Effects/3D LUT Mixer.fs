/*
{
  "CATEGORIES": [
    "Color"
  ],
  "DESCRIPTION": "Applies a LUT to an image",
  "ISFVSN": "2",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image"
    },
    {
      "NAME": "lutA",
      "LABEL": "LUT A",
      "TYPE": "image"
    },
    {
      "NAME": "lutB",
      "LABEL": "LUT B",
      "TYPE": "image"
    },
    {
      "NAME": "progress",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 1.0
    },
    {
      "NAME": "lutSizeA",
      "LABEL": "LUT Size A",
      "TYPE": "float",
      "DEFAULT": 33.0,
      "MIN": 0.0,
      "MAX": 256.0
    },
    {
      "NAME": "lutSizeB",
      "LABEL": "LUT Size B", 
      "TYPE": "float",
      "DEFAULT": 33.0,
      "MIN": 0.0,
      "MAX": 256.0
    }
  ],
  "CREDIT": "Nuvotion"
}
*/

vec3 lutLookup(sampler2D tex, float size, vec3 rgb) {
  // Add small epsilon to avoid edge sampling issues on different hardware
  const float epsilon = 0.5 / 1024.0;  // Half pixel at 1024 resolution
  
  float sliceHeight = 1.0 / size;
  float yPixelHeight = 1.0 / (size * size);

  float slice = rgb.b * (size - 1.0);  // Use size-1 for better edge handling
  float interp = fract(slice);
  float slice0 = floor(slice);
  float slice1 = min(slice0 + 1.0, size - 1.0);  // Clamp to valid range

  // Add epsilon padding to UV coordinates
  float uMin = epsilon;
  float uMax = 1.0 - epsilon;
  float vMin = epsilon;
  float vMax = 1.0 - epsilon;
  
  float u = clamp(rgb.r, uMin, uMax);
  float greenOffset = clamp(rgb.g * sliceHeight, yPixelHeight * 0.5 + vMin, sliceHeight - yPixelHeight * 0.5 - vMin);

  vec2 uv0 = vec2(u, clamp(slice0 * sliceHeight + greenOffset, vMin, vMax));
  vec2 uv1 = vec2(u, clamp(slice1 * sliceHeight + greenOffset, vMin, vMax));

  vec3 sample0 = texture2D(tex, uv0).rgb;
  vec3 sample1 = texture2D(tex, uv1).rgb;

  return mix(sample0, sample1, interp);
}

void main() {
  vec4 val = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
  
  // Use the input RGB values directly with proper clamping
  vec3 inputRGB = clamp(val.rgb, 0.0, 1.0);

  vec3 finalColor;
  
  if (progress <= 0.0) {
    // Only use lutA
    finalColor = lutLookup(lutA, lutSizeA, inputRGB);
  } 
  else if (progress >= 1.0) {
    // Only use lutB
    finalColor = lutLookup(lutB, lutSizeB, inputRGB);
  } 
  else {
    // Blend between both LUTs
    vec3 lutColorA = lutLookup(lutA, lutSizeA, inputRGB);
    vec3 lutColorB = lutLookup(lutB, lutSizeB, inputRGB);
    finalColor = mix(lutColorA, lutColorB, progress);
  }
  
  gl_FragColor = vec4(finalColor, val.a);
}