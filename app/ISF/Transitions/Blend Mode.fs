/*{
    "DESCRIPTION": "Transitions between images using various blend modes",
    "CREDIT": "Nuvotion",
    "CATEGORIES": [
        "Dissolve"
    ],
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
            "MIN": 0.0,
            "MAX": 1.0,
            "DEFAULT": 0.0
        },
    	{
		    "NAME": "blendMode",
		    "LABEL": "Blend Mode",
		    "TYPE": "long",
		    "VALUES": [
		        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
		        20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
		        38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
		        56, 57, 58, 59
		    ],
		    "LABELS": [
		        "Normal", "Add", "Subtract", "Multiply", "Darken", "Color Burn", "Linear Burn",
		        "Lighten", "Screen", "Color Dodge", "Linear Dodge", "Overlay", "Soft Light",
		        "Hard Light", "Vivid Light", "Linear Light", "Pin Light", "Difference",
		        "Exclusion", "Dissolve", "Darker Color", "Lighter Color", "Hard Mix", "Divide",
		        "Hue", "Saturation", "Color", "Luminosity", "Reflect", "Glow", "Phoenix",
		        "Average", "Negation", "Copy Red", "Copy Green", "Copy Blue", "Interpolation",
		        "Interpolation 2X", "Gamma Light", "Exclude Red", "Exclude Green", "Exclude Blue",
		        "Hard Overlay", "Fog Lighten IFS Illusions (Bright)", "Fog Darken IFS Illusions (Dark)",
		        "Super Light", "Modulo Shift", "Divisive Modulo", "Divisive Modulo - Continuous",
		        "Modulo", "Modulo - Continuous", "Additive Subtractive", "Arc Tangent",
		        "Gamma Dark", "Shade", "Gamma Illumination", "Penumbra", "Parallel",
		        "Color Erase", "Behind"
		    ],
		    "DEFAULT": 17
		}
    ],
    "ISFVSN": "2.0"
}*/

const float EPSILON = 0.0001;
const float PI = 3.14159265359;

float HueToRGB(float f1, float f2, float hue) {
  if (hue < 0.0) {
    hue += 1.0;
  }
  else if (hue > 1.0) {
    hue -= 1.0;
  }
  float res;
  if ((6.0 * hue) < 1.0) {
    res = f1 + (f2 - f1) * 6.0 * hue;
  }
  else if ((2.0 * hue) < 1.0) {
    res = f2;
  }
  else if ((3.0 * hue) < 2.0) {
    res = f1 + (f2 - f1) * ((2.0 / 3.0) - hue) * 6.0;
  }
  else {
    res = f1;
  }

  return res;
}

vec3 HSLToRGB(vec3 hsl) {
  vec3 rgb;
  
  if (hsl.y == 0.0) {
    rgb = vec3(hsl.z); // Luminance
  }
  else {
    float f2;
    
    if (hsl.z < 0.5) {
      f2 = hsl.z * (1.0 + hsl.y);
    }
    else {
      f2 = (hsl.z + hsl.y) - (hsl.y * hsl.z);
    }
      
    float f1 = 2.0 * hsl.z - f2;
    
    rgb.r = HueToRGB(f1, f2, hsl.x + (1.0/3.0));
    rgb.g = HueToRGB(f1, f2, hsl.x);
    rgb.b= HueToRGB(f1, f2, hsl.x - (1.0/3.0));
  }
  
  return rgb;
}

vec3 RGBToHSL(vec3 color) {
  vec3 hsl;

  float fmin = min(min(color.r, color.g), color.b);  // Min. value of RGB
  float fmax = max(max(color.r, color.g), color.b);  // Max. value of RGB
  float delta = fmax - fmin;                         // Delta RGB value

  hsl.z = (fmax + fmin) / 2.0; // Luminance

  // no chroma
  if (delta == 0.0)	{
    hsl.x = 0.0;	// Hue
    hsl.y = 0.0;	// Saturation
  }
  // chroma
  else {
    if (hsl.z < 0.5) {
      hsl.y = delta / (fmax + fmin); // Saturation
    }
    else {
      hsl.y = delta / (2.0 - fmax - fmin); // Saturation
    }
    
    float deltaR = (((fmax - color.r) / 6.0) + (delta / 2.0)) / delta;
    float deltaG = (((fmax - color.g) / 6.0) + (delta / 2.0)) / delta;
    float deltaB = (((fmax - color.b) / 6.0) + (delta / 2.0)) / delta;

    if (color.r == fmax ) {
      hsl.x = deltaB - deltaG; // Hue
    }
    else if (color.g == fmax) {
      hsl.x = (1.0 / 3.0) + deltaR - deltaB; // Hue
    }
    else if (color.b == fmax) {
      hsl.x = (2.0 / 3.0) + deltaG - deltaR; // Hue
    }
    if (hsl.x < 0.0) {
      hsl.x += 1.0; // Hue
    }
    else if (hsl.x > 1.0) {
      hsl.x -= 1.0; // Hue
    }
  }

  return hsl;
}

vec3 permute(vec3 x) { 
  return mod(((x*34.0)+1.0)*x, 289.0); 
}

float simplex2DNoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy) );
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec4 blend(vec4 sourceColor, vec4 destinationColor, int blendMode, float blendOpacity) {
  vec3 sourceRGB = sourceColor.rgb;
  vec3 destinationRGB = destinationColor.rgb;
  
  float sourceA = sourceColor.a;
  float destinationA = destinationColor.a;

  vec4 blendedColor;

  // Normal
  if (blendMode == 0) {
    blendedColor.rgb = sourceRGB;
  }

  // Add 
  else if (blendMode == 1) {
    blendedColor.rgb = sourceRGB + destinationRGB;
  }

  // Subtract
  else if (blendMode == 2) {
    blendedColor.rgb = destinationRGB - sourceRGB;
  }

  // Multiply
  else if (blendMode == 3) {
    blendedColor.rgb = sourceRGB * destinationRGB;
  }

  // Darken
  else if (blendMode == 4) {
    blendedColor.rgb = min(sourceRGB, destinationRGB);
  }

  // Color Burn
  else if (blendMode == 5) {
    blendedColor.rgb = vec3(
      (sourceRGB.r == 0.0) ? 0.0 : (1.0 - ((1.0 - destinationRGB.r) / sourceRGB.r)),
      (sourceRGB.g == 0.0) ? 0.0 : (1.0 - ((1.0 - destinationRGB.g) / sourceRGB.g)),
      (sourceRGB.b == 0.0) ? 0.0 : (1.0 - ((1.0 - destinationRGB.b) / sourceRGB.b))  
    );
  }

  // Linear Burn
  else if (blendMode == 6) {
    blendedColor.rgb = sourceRGB + destinationRGB - 1.0;
    blendedColor.rgb = clamp(blendedColor.rgb, 0.0, 1.0);
  }

  // Lighten
  else if (blendMode == 7) {
    blendedColor.rgb = max(sourceRGB, destinationRGB);
  }

  // Screen  
  else if (blendMode == 8) {
    blendedColor.rgb = sourceRGB + destinationRGB - sourceRGB * destinationRGB;
  }

  // Color Dodge
  else if (blendMode == 9) {
    blendedColor.rgb = vec3(
      (sourceRGB.r == 1.0) ? 1.0 : min(1.0, destinationRGB.r / (1.0 - sourceRGB.r)),
      (sourceRGB.g == 1.0) ? 1.0 : min(1.0, destinationRGB.g / (1.0 - sourceRGB.g)),
      (sourceRGB.b == 1.0) ? 1.0 : min(1.0, destinationRGB.b / (1.0 - sourceRGB.b))
    );
  }  

  // Linear Dodge
  else if (blendMode == 10) {
    blendedColor.rgb = sourceRGB + destinationRGB;
  }

  // Overlay
  else if (blendMode == 11) {
    blendedColor.rgb = vec3(
      (destinationRGB.r <= 0.5) ? (2.0 * sourceRGB.r * destinationRGB.r) : (1.0 - 2.0 * (1.0 - destinationRGB.r) * (1.0 - sourceRGB.r)),
      (destinationRGB.g <= 0.5) ? (2.0 * sourceRGB.g * destinationRGB.g) : (1.0 - 2.0 * (1.0 - destinationRGB.g) * (1.0 - sourceRGB.g)),
      (destinationRGB.b <= 0.5) ? (2.0 * sourceRGB.b * destinationRGB.b) : (1.0 - 2.0 * (1.0 - destinationRGB.b) * (1.0 - sourceRGB.b))
    );
  }

  // Soft Light
  else if (blendMode == 12) {
    blendedColor.rgb = vec3(
      (sourceRGB.r <= 0.5) ? (destinationRGB.r - (1.0 - 2.0 * sourceRGB.r) * destinationRGB.r * (1.0 - destinationRGB.r)) : (((sourceRGB.r > 0.5) && (destinationRGB.r <= 0.25)) ? (destinationRGB.r + (2.0 * sourceRGB.r - 1.0) * (4.0 * destinationRGB.r * (4.0 * destinationRGB.r + 1.0) * (destinationRGB.r - 1.0) + 7.0 * destinationRGB.r)) : (destinationRGB.r + (2.0 * sourceRGB.r - 1.0) * (sqrt(destinationRGB.r) - destinationRGB.r))),
      (sourceRGB.g <= 0.5) ? (destinationRGB.g - (1.0 - 2.0 * sourceRGB.g) * destinationRGB.g * (1.0 - destinationRGB.g)) : (((sourceRGB.g > 0.5) && (destinationRGB.g <= 0.25)) ? (destinationRGB.g + (2.0 * sourceRGB.g - 1.0) * (4.0 * destinationRGB.g * (4.0 * destinationRGB.g + 1.0) * (destinationRGB.g - 1.0) + 7.0 * destinationRGB.g)) : (destinationRGB.g + (2.0 * sourceRGB.g - 1.0) * (sqrt(destinationRGB.g) - destinationRGB.g))),
      (sourceRGB.b <= 0.5) ? (destinationRGB.b - (1.0 - 2.0 * sourceRGB.b) * destinationRGB.b * (1.0 - destinationRGB.b)) : (((sourceRGB.b > 0.5) && (destinationRGB.b <= 0.25)) ? (destinationRGB.b + (2.0 * sourceRGB.b - 1.0) * (4.0 * destinationRGB.b * (4.0 * destinationRGB.b + 1.0) * (destinationRGB.b - 1.0) + 7.0 * destinationRGB.b)) : (destinationRGB.b + (2.0 * sourceRGB.b - 1.0) * (sqrt(destinationRGB.b) - destinationRGB.b)))
    );
  }

  // Hard Light
  else if (blendMode == 13) {
    blendedColor.rgb = vec3(
      (sourceRGB.r <= 0.5) ? (2.0 * sourceRGB.r * destinationRGB.r) : (1.0 - 2.0 * (1.0 - sourceRGB.r) * (1.0 - destinationRGB.r)),
      (sourceRGB.g <= 0.5) ? (2.0 * sourceRGB.g * destinationRGB.g) : (1.0 - 2.0 * (1.0 - sourceRGB.g) * (1.0 - destinationRGB.g)),
      (sourceRGB.b <= 0.5) ? (2.0 * sourceRGB.b * destinationRGB.b) : (1.0 - 2.0 * (1.0 - sourceRGB.b) * (1.0 - destinationRGB.b))
    );
  }

  // Vivid Light
  else if (blendMode == 14) {
    blendedColor.rgb = vec3(
      (sourceRGB.r <= 0.5) ? (1.0 - (1.0 - destinationRGB.r) / (2.0 * sourceRGB.r + EPSILON)) : (destinationRGB.r / (2.0 * (1.0 - sourceRGB.r) + EPSILON)),
      (sourceRGB.g <= 0.5) ? (1.0 - (1.0 - destinationRGB.g) / (2.0 * sourceRGB.g + EPSILON)) : (destinationRGB.g / (2.0 * (1.0 - sourceRGB.g) + EPSILON)),
      (sourceRGB.b <= 0.5) ? (1.0 - (1.0 - destinationRGB.b) / (2.0 * sourceRGB.b + EPSILON)) : (destinationRGB.b / (2.0 * (1.0 - sourceRGB.b) + EPSILON))
    );
  }


  // Linear Light
  else if (blendMode == 15) {
    blendedColor.rgb = 2.0 * sourceRGB + destinationRGB - vec3(1.0);
  }

  // Pin Light
  else if (blendMode == 16) {
    blendedColor.rgb = vec3(
      (sourceRGB.r > 0.5) ? max(destinationRGB.r, 2.0 * (sourceRGB.r - 0.5)) : min(destinationRGB.r, 2.0 * sourceRGB.r),
      (sourceRGB.g > 0.5) ? max(destinationRGB.g, 2.0 * (sourceRGB.g - 0.5)) : min(destinationRGB.g, 2.0 * sourceRGB.g),
      (sourceRGB.b > 0.5) ? max(destinationRGB.b, 2.0 * (sourceRGB.b - 0.5)) : min(destinationRGB.b, 2.0 * sourceRGB.b)
    );
  }

  // Difference
  else if (blendMode == 17) {
    blendedColor.rgb = abs(destinationRGB - sourceRGB);
  }

  // Exclusion
  else if (blendMode == 18) {
    blendedColor.rgb = destinationRGB + sourceRGB - 2.0 * destinationRGB * sourceRGB;
  }

  // Dissolve
  if (blendMode == 19) {
    // Create a random offset using gl_FragCoord
    vec2 randomOffset = fract(sin(vec2(gl_FragCoord.x, gl_FragCoord.y) * 12.9898) * 43758.5453);
    
    // Apply the random offset to the coordinates
    float noiseValue = simplex2DNoise(gl_FragCoord.xy + randomOffset);

    // Mix the colors based on the noise value
    blendedColor.rgb = mix(destinationRGB, sourceRGB, step(noiseValue, blendOpacity));
  }
  
  // Darker Color
  else if (blendMode == 20) {
    float sourceBrightness = sourceRGB.r + sourceRGB.g + sourceRGB.b;
    float destinationBrightness = destinationRGB.r + destinationRGB.g + destinationRGB.b;
    if (sourceBrightness < destinationBrightness) {
      blendedColor.rgb = sourceRGB;
    }
    else {
      blendedColor.rgb = destinationRGB;
    }
  }
  
  // Lighter Color
  else if (blendMode == 21) {
    float sourceBrightness = sourceRGB.r + sourceRGB.g + sourceRGB.b;
    float destinationBrightness = destinationRGB.r + destinationRGB.g + destinationRGB.b;
    if (sourceBrightness > destinationBrightness) {
      blendedColor.rgb = sourceRGB;
    }
    else {
      blendedColor.rgb = destinationRGB;
    }
  }

  // Hard Mix
  else if (blendMode == 22) {
    blendedColor.rgb = vec3(
      ((destinationRGB.r < 0.5) ? ((destinationRGB.r == 0.0) ? destinationRGB.r : max((1.0 - ((1.0 - sourceRGB.r) / (2.0 * destinationRGB.r))), 0.0)) : ((destinationRGB.r == 1.0) ? destinationRGB.r : min(sourceRGB.r / (1.0 - (2.0 * (destinationRGB.r - 0.5))), 1.0))) < 0.5 ? 0.0 : 1.0,
      ((destinationRGB.g < 0.5) ? ((destinationRGB.g == 0.0) ? destinationRGB.g : max((1.0 - ((1.0 - sourceRGB.g) / (2.0 * destinationRGB.g))), 0.0)) : ((destinationRGB.g == 1.0) ? destinationRGB.g : min(sourceRGB.g / (1.0 - (2.0 * (destinationRGB.g - 0.5))), 1.0))) < 0.5 ? 0.0 : 1.0,
      ((destinationRGB.b < 0.5) ? ((destinationRGB.b == 0.0) ? destinationRGB.b : max((1.0 - ((1.0 - sourceRGB.b) / (2.0 * destinationRGB.b))), 0.0)) : ((destinationRGB.b == 1.0) ? destinationRGB.b : min(sourceRGB.b / (1.0 - (2.0 * (destinationRGB.b - 0.5))), 1.0))) < 0.5 ? 0.0 : 1.0
    );
  }
  
  // Divide
  else if (blendMode == 23) {
    blendedColor.rgb = destinationRGB / (sourceRGB + EPSILON);
  }

  // Hue
  else if (blendMode == 24) {
    vec3 sourceHSL = RGBToHSL(sourceRGB);
    vec3 destinationHSL = RGBToHSL(destinationRGB);
    blendedColor.rgb = HSLToRGB(vec3(sourceHSL.x, destinationHSL.y, destinationHSL.z));
  }

  // Saturation
  else if (blendMode == 25) {
    vec3 sourceHSL = RGBToHSL(sourceRGB);
    vec3 destinationHSL = RGBToHSL(destinationRGB);
    blendedColor.rgb = HSLToRGB(vec3(destinationHSL.x, sourceHSL.y, destinationHSL.z));
  }

  // Color
  else if (blendMode == 26) {
    vec3 sourceHSL = RGBToHSL(sourceRGB);
    vec3 destinationHSL = RGBToHSL(destinationRGB);
    blendedColor.rgb = HSLToRGB(vec3(sourceHSL.x, sourceHSL.y, destinationHSL.z));
  }

  // Luminosity
  else if (blendMode == 27) {
    vec3 sourceHSL = RGBToHSL(destinationRGB); // using destinationRGB for the hue and saturation
    vec3 blendHSL = RGBToHSL(sourceRGB); // using sourceRGB for the luminance
    blendedColor.rgb = HSLToRGB(vec3(sourceHSL.r, sourceHSL.g, blendHSL.b)); // Combining hue, saturation, and luminance
  }

  // Reflect
  else if (blendMode == 28) {
    blendedColor.rgb = vec3((sourceRGB.r == 1.0) ? sourceRGB.r : min(destinationRGB.r * destinationRGB.r / (1.0 - sourceRGB.r), 1.0),
                          (sourceRGB.g == 1.0) ? sourceRGB.g : min(destinationRGB.g * destinationRGB.g / (1.0 - sourceRGB.g), 1.0),
                          (sourceRGB.b == 1.0) ? sourceRGB.b : min(destinationRGB.b * destinationRGB.b / (1.0 - sourceRGB.b), 1.0));
  }

  // Glow
  else if (blendMode == 29) {
    blendedColor.rgb = vec3((destinationRGB.r == 1.0) ? destinationRGB.r : min(sourceRGB.r * sourceRGB.r / (1.0 - destinationRGB.r), 1.0),
                          (destinationRGB.g == 1.0) ? destinationRGB.g : min(sourceRGB.g * sourceRGB.g / (1.0 - destinationRGB.g), 1.0),
                          (destinationRGB.b == 1.0) ? destinationRGB.b : min(sourceRGB.b * sourceRGB.b / (1.0 - destinationRGB.b), 1.0));
  }

  // Phoenix
  else if (blendMode == 30) {
    blendedColor.rgb = vec3(min(sourceRGB.r, destinationRGB.r) - max(sourceRGB.r, destinationRGB.r) + 1.0,
                          min(sourceRGB.g, destinationRGB.g) - max(sourceRGB.g, destinationRGB.g) + 1.0,
                          min(sourceRGB.b, destinationRGB.b) - max(sourceRGB.b, destinationRGB.b) + 1.0);
  }

  // Average
  else if (blendMode == 31) {
    blendedColor.rgb = (sourceRGB + destinationRGB) / 2.0;
  }

  // Negation
  else if (blendMode == 32) {
    blendedColor.rgb = vec3(1.0 - abs(1.0 - sourceRGB.r - destinationRGB.r),
                          1.0 - abs(1.0 - sourceRGB.g - destinationRGB.g),
                          1.0 - abs(1.0 - sourceRGB.b - destinationRGB.b));
  }

  // Copy Red
  else if (blendMode == 33) {
    blendedColor.rgb = vec3(sourceRGB.r, destinationRGB.g, destinationRGB.b);
  }

  // Copy Green
  else if (blendMode == 34) {
    blendedColor.rgb = vec3(destinationRGB.r, sourceRGB.g, destinationRGB.b);
  }

  // Copy Blue
  else if (blendMode == 35) {
    blendedColor.rgb = vec3(destinationRGB.r, destinationRGB.g, sourceRGB.b);
  }

  // Interpolation
  else if (blendMode == 36) {
    vec3 baseCos = cos(PI * destinationRGB);
    vec3 blendCos = cos(PI * sourceRGB);
    blendedColor.rgb = 0.5 - 0.25 * blendCos - 0.25 * baseCos;
  }

  // Interpolation 2X
  else if (blendMode == 37) { // Adjust the value according to the correct blend mode number
    vec3 baseCos1 = cos(PI * destinationRGB);
    vec3 blendCos1 = cos(PI * sourceRGB);
    vec3 result1 = 0.5 - 0.25 * blendCos1 - 0.25 * baseCos1;

    vec3 baseCos2 = cos(PI * result1);
    vec3 blendCos2 = cos(PI * result1);
    blendedColor.rgb = 0.5 - 0.25 * blendCos2 - 0.25 * baseCos2;
  }

  // Gamma Light
  else if (blendMode == 38) {
    blendedColor.rgb = pow(sourceRGB, destinationRGB);
  }

  // Exclude Red
  else if (blendMode == 39) {
    blendedColor.rgb = vec3(destinationRGB.r, sourceRGB.g, sourceRGB.b);
  }

  // Exclude Green
  else if (blendMode == 40) {
    blendedColor.rgb = vec3(sourceRGB.r, destinationRGB.g, sourceRGB.b);
  }

  // Exclude Blue
  else if (blendMode == 41) {
    blendedColor.rgb = vec3(sourceRGB.r, sourceRGB.g, destinationRGB.b);
  }

  // Hard Overlay
  else if (blendMode == 42) {
    blendedColor.rgb = vec3(
      (sourceRGB.r <= 0.5) ? (2.0 * sourceRGB.r * destinationRGB.r) : (1.0 - (2.0 * (1.0 - sourceRGB.r) / (1.0 - destinationRGB.r + EPSILON))),
      (sourceRGB.g <= 0.5) ? (2.0 * sourceRGB.g * destinationRGB.g) : (1.0 - (2.0 * (1.0 - sourceRGB.g) / (1.0 - destinationRGB.g + EPSILON))),
      (sourceRGB.b <= 0.5) ? (2.0 * sourceRGB.b * destinationRGB.b) : (1.0 - (2.0 * (1.0 - sourceRGB.b) / (1.0 - destinationRGB.b + EPSILON)))
    );
  }

  // Fog Lighten IFS Illusions (Bright)
  else if (blendMode == 43) {
    blendedColor.rgb = vec3(
      (sourceRGB.r != 0.0 && destinationRGB.r != 0.0) ? ((sourceRGB.r < 0.5) ? (1.0 / (1.0 / sourceRGB.r * sourceRGB.r) - 1.0 / (destinationRGB.r * 1.0 / sourceRGB.r)) : (sourceRGB.r - 1.0 / (destinationRGB.r * 1.0 / sourceRGB.r) + pow(1.0 / sourceRGB.r, 2.0))) : 0.0,
      (sourceRGB.g != 0.0 && destinationRGB.g != 0.0) ? ((sourceRGB.g < 0.5) ? (1.0 / (1.0 / sourceRGB.g * sourceRGB.g) - 1.0 / (destinationRGB.g * 1.0 / sourceRGB.g)) : (sourceRGB.g - 1.0 / (destinationRGB.g * 1.0 / sourceRGB.g) + pow(1.0 / sourceRGB.g, 2.0))) : 0.0,
      (sourceRGB.b != 0.0 && destinationRGB.b != 0.0) ? ((sourceRGB.b < 0.5) ? (1.0 / (1.0 / sourceRGB.b * sourceRGB.b) - 1.0 / (destinationRGB.b * 1.0 / sourceRGB.b)) : (sourceRGB.b - 1.0 / (destinationRGB.b * 1.0 / sourceRGB.b) + pow(1.0 / sourceRGB.b, 2.0))) : 0.0
    );
  }
  
  // Fog Darken IFS Illusions (Dark)
  else if (blendMode == 44) {
    blendedColor.rgb = vec3(
      (sourceRGB.r != 0.0) ? ((sourceRGB.r < 0.5) ? ((1.0 / sourceRGB.r) * sourceRGB.r + sourceRGB.r * destinationRGB.r) : (sourceRGB.r * destinationRGB.r + sourceRGB.r - pow(sourceRGB.r, 2.0))) : 0.0,
      (sourceRGB.g != 0.0) ? ((sourceRGB.g < 0.5) ? ((1.0 / sourceRGB.g) * sourceRGB.g + sourceRGB.g * destinationRGB.g) : (sourceRGB.g * destinationRGB.g + sourceRGB.g - pow(sourceRGB.g, 2.0))) : 0.0,
      (sourceRGB.b != 0.0) ? ((sourceRGB.b < 0.5) ? ((1.0 / sourceRGB.b) * sourceRGB.b + sourceRGB.b * destinationRGB.b) : (sourceRGB.b * destinationRGB.b + sourceRGB.b - pow(sourceRGB.b, 2.0))) : 0.0
    );
  }      

  // Super Light
  else if (blendMode == 45) {
    blendedColor.rgb = vec3(
      (sourceRGB.r < 0.5) ? (1.0 / pow(max(pow(1.0 / destinationRGB.r, 2.875) + pow(1.0 / (2.0 * sourceRGB.r), 2.875), 0.0001), 1.0 / 2.875)) : (pow(max(pow(destinationRGB.r, 2.875) + pow(2.0 * sourceRGB.r - 1.0, 2.875), 0.0001), 1.0 / 2.875)),
      (sourceRGB.g < 0.5) ? (1.0 / pow(max(pow(1.0 / destinationRGB.g, 2.875) + pow(1.0 / (2.0 * sourceRGB.g), 2.875), 0.0001), 1.0 / 2.875)) : (pow(max(pow(destinationRGB.g, 2.875) + pow(2.0 * sourceRGB.g - 1.0, 2.875), 0.0001), 1.0 / 2.875)),
      (sourceRGB.b < 0.5) ? (1.0 / pow(max(pow(1.0 / destinationRGB.b, 2.875) + pow(1.0 / (2.0 * sourceRGB.b), 2.875), 0.0001), 1.0 / 2.875)) : (pow(max(pow(destinationRGB.b, 2.875) + pow(2.0 * sourceRGB.b - 1.0, 2.875), 0.0001), 1.0 / 2.875))
    );
  }

  // Modulo Shift
  else if (blendMode == 46) { // Assuming 49 is the blend mode for cfModuloShift
    blendedColor.rgb = vec3(
      mod((destinationRGB.r + sourceRGB.r), 1.0),
      mod((destinationRGB.g + sourceRGB.g), 1.0),
      mod((destinationRGB.b + sourceRGB.b), 1.0)
    );
  
    if (sourceRGB.r == 1.0 && destinationRGB.r == 0.0) blendedColor.r = 0.0;
    if (sourceRGB.g == 1.0 && destinationRGB.g == 0.0) blendedColor.g = 0.0;
    if (sourceRGB.b == 1.0 && destinationRGB.b == 0.0) blendedColor.b = 0.0;
  }

  // Divisive Modulo
  else if (blendMode == 47) {
    blendedColor.rgb = vec3(
      (sourceRGB.r != 0.0) ? mod(destinationRGB.r / sourceRGB.r, 1.0) : mod(destinationRGB.r / 0.0000001, 1.0),
      (sourceRGB.g != 0.0) ? mod(destinationRGB.g / sourceRGB.g, 1.0) : mod(destinationRGB.g / 0.0000001, 1.0),
      (sourceRGB.b != 0.0) ? mod(destinationRGB.b / sourceRGB.b, 1.0) : mod(destinationRGB.b / 0.0000001, 1.0)
    );
  }
  
  // Divisive Modulo - Continuous
  else if (blendMode == 48) {
    blendedColor.rgb = vec3(
      (sourceRGB.r != 0.0) ? (mod(ceil(destinationRGB.r / sourceRGB.r), 2.0) != 0.0 ? mod(destinationRGB.r / sourceRGB.r, 1.0) : 1.0 - mod(destinationRGB.r / sourceRGB.r, 1.0)) : mod(destinationRGB.r / 0.0000001, 1.0),
      (sourceRGB.g != 0.0) ? (mod(ceil(destinationRGB.g / sourceRGB.g), 2.0) != 0.0 ? mod(destinationRGB.g / sourceRGB.g, 1.0) : 1.0 - mod(destinationRGB.g / sourceRGB.g, 1.0)) : mod(destinationRGB.g / 0.0000001, 1.0),
      (sourceRGB.b != 0.0) ? (mod(ceil(destinationRGB.b / sourceRGB.b), 2.0) != 0.0 ? mod(destinationRGB.b / sourceRGB.b, 1.0) : 1.0 - mod(destinationRGB.b / sourceRGB.b, 1.0)) : mod(destinationRGB.b / 0.0000001, 1.0)
    );
  }
  
  // Modulo
  else if (blendMode == 49) {
    blendedColor.rgb = vec3(
      (sourceRGB.r != 0.0) ? mod(destinationRGB.r, sourceRGB.r) : destinationRGB.r,
      (sourceRGB.g != 0.0) ? mod(destinationRGB.g, sourceRGB.g) : destinationRGB.g,
      (sourceRGB.b != 0.0) ? mod(destinationRGB.b, sourceRGB.b) : destinationRGB.b
    );
  }
  

  // Modulo - Continuous
  else if (blendMode == 50) {
    blendedColor.rgb = vec3(
      (sourceRGB.r == 0.0) ? 0.0 : (mod(ceil(destinationRGB.r / sourceRGB.r), 2.0) != 0.0 ? mod(destinationRGB.r, sourceRGB.r) : 1.0 - mod(destinationRGB.r, sourceRGB.r)) * sourceRGB.r,
      (sourceRGB.g == 0.0) ? 0.0 : (mod(ceil(destinationRGB.g / sourceRGB.g), 2.0) != 0.0 ? mod(destinationRGB.g, sourceRGB.g) : 1.0 - mod(destinationRGB.g, sourceRGB.g)) * sourceRGB.g,
      (sourceRGB.b == 0.0) ? 0.0 : (mod(ceil(destinationRGB.b / sourceRGB.b), 2.0) != 0.0 ? mod(destinationRGB.b, sourceRGB.b) : 1.0 - mod(destinationRGB.b, sourceRGB.b)) * sourceRGB.b
    );
  }

  // Additive Subtractive
  else if (blendMode == 51) {
    blendedColor.rgb = vec3(
      clamp(abs(sqrt(destinationRGB.r) - sqrt(sourceRGB.r)), 0.0, 1.0),
      clamp(abs(sqrt(destinationRGB.g) - sqrt(sourceRGB.g)), 0.0, 1.0),
      clamp(abs(sqrt(destinationRGB.b) - sqrt(sourceRGB.b)), 0.0, 1.0)
    );
  }

  // Arc Tangent
  else if (blendMode == 52) {
    blendedColor.rgb = vec3(
      (destinationRGB.r == 0.0) ? (sourceRGB.r == 0.0 ? 0.0 : 1.0) : (2.0 * atan(sourceRGB.r / destinationRGB.r) / 3.14159265),
      (destinationRGB.g == 0.0) ? (sourceRGB.g == 0.0 ? 0.0 : 1.0) : (2.0 * atan(sourceRGB.g / destinationRGB.g) / 3.14159265),
      (destinationRGB.b == 0.0) ? (sourceRGB.b == 0.0 ? 0.0 : 1.0) : (2.0 * atan(sourceRGB.b / destinationRGB.b) / 3.14159265)
    );
  }

  // Gamma Dark
  else if (blendMode == 53) { // Assuming the blend mode value for "Gamma Dark"
    blendedColor.rgb = vec3(
      (sourceRGB.r == 0.0) ? 0.0 : pow(destinationRGB.r, 1.0 / sourceRGB.r),
      (sourceRGB.g == 0.0) ? 0.0 : pow(destinationRGB.g, 1.0 / sourceRGB.g),
      (sourceRGB.b == 0.0) ? 0.0 : pow(destinationRGB.b, 1.0 / sourceRGB.b)
    );
  }

  // Shade
  else if (blendMode == 54) { // Assuming the blend mode value for "Shade"
    blendedColor.rgb = vec3(
      1.0 / ((1.0 / destinationRGB.r * sourceRGB.r) + sqrt(1.0 / sourceRGB.r)),
      1.0 / ((1.0 / destinationRGB.g * sourceRGB.g) + sqrt(1.0 / sourceRGB.g)),
      1.0 / ((1.0 / destinationRGB.b * sourceRGB.b) + sqrt(1.0 / sourceRGB.b))
    );
  }

  // Gamma Illumination
  else if (blendMode == 55) { 
    blendedColor.rgb = vec3(
      1.0 / pow(1.0 / destinationRGB.r, 1.0 / (1.0 / sourceRGB.r)),
      1.0 / pow(1.0 / destinationRGB.g, 1.0 / (1.0 / sourceRGB.g)),
      1.0 / pow(1.0 / destinationRGB.b, 1.0 / (1.0 / sourceRGB.b))
    );
  }

  // Penumbra
  else if (blendMode == 56) { 
    blendedColor.rgb = vec3(
      (destinationRGB.r == 1.0) ? 1.0 : (destinationRGB.r + sourceRGB.r < 1.0) ? (min(1.0, destinationRGB.r / (1.0 - sourceRGB.r)) / 2.0) : (sourceRGB.r == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.r, 0.0, 1.0) / sourceRGB.r / 2.0,
      (destinationRGB.g == 1.0) ? 1.0 : (destinationRGB.g + sourceRGB.g < 1.0) ? (min(1.0, destinationRGB.g / (1.0 - sourceRGB.g)) / 2.0) : (sourceRGB.g == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.g, 0.0, 1.0) / sourceRGB.g / 2.0,
      (destinationRGB.b == 1.0) ? 1.0 : (destinationRGB.b + sourceRGB.b < 1.0) ? (min(1.0, destinationRGB.b / (1.0 - sourceRGB.b)) / 2.0) : (sourceRGB.b == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.b, 0.0, 1.0) / sourceRGB.b / 2.0
    );
  }

  // Parallel
  else if (blendMode == 57) { 
    blendedColor.rgb = vec3(
      (sourceRGB.r == 0.0 || destinationRGB.r == 0.0) ? 0.0 : clamp(2.0 / (1.0 / destinationRGB.r + 1.0 / sourceRGB.r), 0.0, 1.0),
      (sourceRGB.g == 0.0 || destinationRGB.g == 0.0) ? 0.0 : clamp(2.0 / (1.0 / destinationRGB.g + 1.0 / sourceRGB.g), 0.0, 1.0),
      (sourceRGB.b == 0.0 || destinationRGB.b == 0.0) ? 0.0 : clamp(2.0 / (1.0 / destinationRGB.b + 1.0 / sourceRGB.b), 0.0, 1.0)
    );
  }

  // Color Erase
  else if (blendMode == 58) { 
    blendedColor.rgb = vec3(
      (sourceRGB.r == 0.0) ? 0.0 : (sourceRGB.r == 1.0) ? destinationRGB.r : max(0.0, min(1.0, destinationRGB.r - sourceRGB.r)),
      (sourceRGB.g == 0.0) ? 0.0 : (sourceRGB.g == 1.0) ? destinationRGB.g : max(0.0, min(1.0, destinationRGB.g - sourceRGB.g)),
      (sourceRGB.b == 0.0) ? 0.0 : (sourceRGB.b == 1.0) ? destinationRGB.b : max(0.0, min(1.0, destinationRGB.b - sourceRGB.b))
    );
  }

  // Behind
  else if (blendMode == 59) {
    blendedColor.rgb = destinationRGB;
  }

  if (blendMode != 19 && blendMode != 59) { // Not Dissolve or Behind, which handle alpha differently
    blendedColor.rgb = mix(sourceRGB, blendedColor.rgb, blendOpacity);
  }
  else if (blendMode == 59) { // Behind
    blendedColor.rgb = mix(destinationRGB, blendedColor.rgb, blendOpacity);
  }

  // Set alpha
  blendedColor.a = mix(sourceA, destinationA, blendOpacity);

  return blendedColor;
}

void main() {
    vec2 uv = gl_FragCoord.xy / RENDERSIZE;
    vec4 sourceColor = IMG_NORM_PIXEL(startImage, uv);
    vec4 destinationColor = IMG_NORM_PIXEL(endImage, uv);
    
    // Compute the blended color using the specified blend mode
    vec4 blendedColor = blend(sourceColor, destinationColor, blendMode, 1.0);
    
    // Two-stage transition
    vec4 transitionColor1 = mix(sourceColor, blendedColor, progress * 2.0);
    vec4 transitionColor2 = mix(blendedColor, destinationColor, (progress - 0.5) * 2.0);
    
    // Choose the appropriate color based on the progress
    gl_FragColor = progress <= 0.5 ? transitionColor1 : transitionColor2;
}