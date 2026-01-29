/*{
  "DESCRIPTION": "Bayer and cluster dithering extended with additional dithering techniques (2x2, 4x4 Bayer, random noise, blue noise) including RGB modes and customizable scale.",
  "CATEGORIES": [
    "Texture", "Static"
  ],
  "CREDIT": "Nuvotion (extended by ChatGPT)",
  "ISFVSN": "2",
  "VSN": "1.1",
  "INPUTS": [
    {
      "NAME": "inputImage",
      "TYPE": "image",
      "LABEL": "Input Image"
    },
    {
      "NAME": "ditherMode",
      "TYPE": "long",
      "DEFAULT": 0,
      "LABEL": "Dither Mode",
      "VALUES": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      "LABELS": [
        "Bayer 8x8",
        "Cluster 8x8",
        "RGB Bayer 8x8",
        "RGB Cluster 8x8",
        "Bayer 2x2",
        "RGB Bayer 2x2",
        "Bayer 4x4",
        "RGB Bayer 4x4",
        "Random",
        "RGB Random",
        "Blue Noise 8x8",
        "RGB Blue Noise 8x8"
      ]
    },
    {
      "NAME": "scale",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "LABEL": "Scale",
      "MIN": 1.0,
      "MAX": 8.0
    }
  ]
}*/

float rand(vec2 co) {
    // Pseudorandom generator using a dot product and sine (white noise per coordinate)
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// 2x2 Bayer threshold matrix (values 0–3)
float dither2x2(int x, int y, float luma) {
    const int dither2x2Matrix[4] = int[](0, 3,   // row0: 0,3
                                         2, 1);  // row1: 2,1
    int index = x + y * 2;
    // Normalize threshold: (value+1) / (max_value+1) where max_value = 3
    float limit = (float(dither2x2Matrix[index]) + 1.0) / 4.0;
    return (luma < limit ? 0.0 : 1.0);
}

// 4x4 Bayer threshold matrix (values 0–15)
float dither4x4(int x, int y, float luma) {
    const int dither4x4Matrix[16] = int[](
        0,  8,  2, 10,   // row0
        12, 4, 14, 6,    // row1
        3, 11, 1,  9,    // row2
        15, 7, 13, 5     // row3
    );
    int index = x + y * 4;
    float limit = (float(dither4x4Matrix[index]) + 1.0) / 17.0;  // max_value = 15 -> 15+1=16, so 1+max=17
    return (luma < limit ? 0.0 : 1.0);
}

// 8x8 Bayer threshold matrix (values 0–63)
float dither8x8(int x, int y, float luma) {
    const int dither8x8Matrix[64] = int[](
        // 8x8 Bayer matrix, row-major order:
        0, 32,  8, 40,  2, 34, 10, 42,
        48,16, 56, 24, 50, 18, 58, 26,
        12,44,  4, 36, 14, 46,  6, 38,
        60,28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43,  1, 33,  9, 41,
        51,19, 59, 27, 49, 17, 57, 25,
        15,47,  7, 39, 13, 45,  5, 37,
        63,31, 55, 23, 61, 29, 53, 21
    );
    int index = x + y * 8;
    float limit = (float(dither8x8Matrix[index]) + 1.0) / 65.0;  // note: using 1/(63+2)=1/65
    return (luma < limit ? 0.0 : 1.0);
}

// 8x8 Clustered-dot (halftone) matrix (values 0–63)
float dither8x8cluster(int x, int y, float luma) {
    const int cluster8x8Matrix[64] = int[](
        // 8x8 clustered halftone matrix, row-major (from 0 to 63):
        24, 10, 12, 26, 35, 47, 49, 37,
         8,  0,  2, 14, 45, 59, 61, 51,
        22,  6,  4, 16, 43, 57, 63, 53,
        30, 20, 18, 28, 33, 41, 55, 39,
        34, 46, 48, 36, 25, 11, 13, 27,
        44, 58, 60, 50,  9,  1,  3, 15,
        42, 56, 62, 52, 23,  7,  5, 17,
        32, 40, 54, 38, 31, 21, 19, 29
    );
    int index = x + y * 8;
    float limit = (float(cluster8x8Matrix[index]) + 1.0) / 65.0;
    return (luma < limit ? 0.0 : 1.0);
}

// 8x8 Blue-noise threshold matrix (values 0–63), generated via void-and-cluster approximation
float dither8x8Blue(int x, int y, float luma) {
    const int blueNoise8x8Matrix[64] = int[](
        // 8x8 blue noise matrix, row-major:
         8, 32,  4, 33,  9, 34,  5, 35,
        36, 16, 37, 17, 38, 18, 39, 19,
         0, 40, 10, 41,  2, 42, 11, 43,
        44, 20, 45, 21, 46, 22, 47, 23,
        12, 48,  6, 49, 13, 50,  7, 51,
        52, 24, 53, 25, 54, 26, 55, 27,
         3, 56, 14, 57,  1, 58, 15, 59,
        60, 28, 61, 29, 62, 30, 63, 31
    );
    int index = x + y * 8;
    float limit = (float(blueNoise8x8Matrix[index]) + 1.0) / 65.0;
    return (luma < limit ? 0.0 : 1.0);
}

void main() {
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, isf_FragNormCoord);
    // Compute luminance (grayscale) of the input color
    vec3 lumacoef = vec3(0.299, 0.587, 0.114);
    float grayscale = dot(originalColor.rgb, lumacoef);

    // Determine current pixel’s position within the dither pattern tile
    // Using 'scale' to enlarge or repeat the pattern over larger pixel blocks
    int x8 = int(mod(gl_FragCoord.x / scale, 8.0));
    int y8 = int(mod(gl_FragCoord.y / scale, 8.0));
    int x4 = int(mod(gl_FragCoord.x / scale, 4.0));
    int y4 = int(mod(gl_FragCoord.y / scale, 4.0));
    int x2 = int(mod(gl_FragCoord.x / scale, 2.0));
    int y2 = int(mod(gl_FragCoord.y / scale, 2.0));

    vec3 affectedColor;

    if (ditherMode == 0) {
        // 8x8 Bayer ordered dithering (grayscale)
        float d = dither8x8(x8, y8, grayscale);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 1) {
        // 8x8 clustered (halftone) dithering (grayscale)
        float d = dither8x8cluster(x8, y8, grayscale);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 2) {
        // 8x8 Bayer ordered dithering (RGB channels independently)
        float dr = dither8x8(x8, y8, originalColor.r);
        float dg = dither8x8(x8, y8, originalColor.g);
        float db = dither8x8(x8, y8, originalColor.b);
        affectedColor = vec3(dr, dg, db);
    }
    else if (ditherMode == 3) {
        // 8x8 clustered dithering (RGB channels)
        float dr = dither8x8cluster(x8, y8, originalColor.r);
        float dg = dither8x8cluster(x8, y8, originalColor.g);
        float db = dither8x8cluster(x8, y8, originalColor.b);
        affectedColor = vec3(dr, dg, db);
    }
    else if (ditherMode == 4) {
        // 2x2 Bayer ordered dithering (grayscale)
        float d = dither2x2(x2, y2, grayscale);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 5) {
        // 2x2 Bayer ordered dithering (RGB channels)
        float dr = dither2x2(x2, y2, originalColor.r);
        float dg = dither2x2(x2, y2, originalColor.g);
        float db = dither2x2(x2, y2, originalColor.b);
        affectedColor = vec3(dr, dg, db);
    }
    else if (ditherMode == 6) {
        // 4x4 Bayer ordered dithering (grayscale)
        float d = dither4x4(x4, y4, grayscale);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 7) {
        // 4x4 Bayer ordered dithering (RGB channels)
        float dr = dither4x4(x4, y4, originalColor.r);
        float dg = dither4x4(x4, y4, originalColor.g);
        float db = dither4x4(x4, y4, originalColor.b);
        affectedColor = vec3(dr, dg, db);
    }
    else if (ditherMode == 8) {
        // Random (white-noise) dithering (grayscale)
        // Use one random threshold per 'scale'-sized block for stability
        int xR = int(floor(gl_FragCoord.x / scale));
        int yR = int(floor(gl_FragCoord.y / scale));
        float thresh = rand(vec2(xR, yR));
        float d = (grayscale < thresh ? 0.0 : 1.0);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 9) {
        // Random dithering (RGB channels)
        int xR = int(floor(gl_FragCoord.x / scale));
        int yR = int(floor(gl_FragCoord.y / scale));
        float thresh = rand(vec2(xR, yR));
        float dr = (originalColor.r < thresh ? 0.0 : 1.0);
        float dg = (originalColor.g < thresh ? 0.0 : 1.0);
        float db = (originalColor.b < thresh ? 0.0 : 1.0);
        affectedColor = vec3(dr, dg, db);
    }
    else if (ditherMode == 10) {
        // Blue-noise ordered dithering (grayscale)
        float d = dither8x8Blue(x8, y8, grayscale);
        affectedColor = vec3(d);
    }
    else if (ditherMode == 11) {
        // Blue-noise ordered dithering (RGB channels)
        float dr = dither8x8Blue(x8, y8, originalColor.r);
        float dg = dither8x8Blue(x8, y8, originalColor.g);
        float db = dither8x8Blue(x8, y8, originalColor.b);
        affectedColor = vec3(dr, dg, db);
    }

    // Output the final color (for grayscale dithers, R=G=B either 0 or 1; alpha preserved)
    gl_FragColor = vec4(affectedColor, originalColor.a);
}
