/*
{
  "CATEGORIES" : [
    "Distortion"
  ],
  "DESCRIPTION": "Transitions between images using hue spin feedback effects with configurable displacement",
  "INPUTS" : [
    {
      "NAME" : "startImage",
      "TYPE" : "image"
    },
    {
      "NAME" : "endImage",
      "TYPE" : "image"
    },
    {
      "NAME" : "progress",
      "TYPE" : "float",
      "MIN" : 0.0,
      "MAX" : 1.0,
      "DEFAULT": 0.0
    },
    {
      "NAME" : "displaceAmount",
      "TYPE" : "float",
      "MIN" : 0.0,
      "MAX" : 1.0,
      "DEFAULT": 0.15
    },
    {
      "LABELS" : [
        "Luma",
        "R",
        "G",
        "B",
        "R+G",
        "B+G"
      ],
      "NAME" : "xComponent",
      "TYPE" : "long",
      "DEFAULT" : 4,
      "VALUES" : [
        0,
        1,
        2,
        3,
        4,
        5
      ]
    },
    {
      "LABELS" : [
        "Luma",
        "R",
        "G",
        "B",
        "R+G",
        "B+G"
      ],
      "NAME" : "yComponent",
      "TYPE" : "long",
      "DEFAULT" : 5,
      "VALUES" : [
        0,
        1,
        2,
        3,
        4,
        5
      ]
    },
    {
      "NAME" : "relativeShift",
      "TYPE" : "bool",
      "DEFAULT" : 1
    },
    {
      "NAME" : "spin",
      "TYPE" : "float",
      "DEFAULT": 0.35,
      "MIN": 0.0,
      "MAX": 1.0
    },
    {
      "NAME" : "feedback",
      "TYPE" : "float",
      "DEFAULT": 0.9,
      "MIN": 0.0,
      "MAX": 1.0
    },
    {
      "NAME" : "saturation",
      "TYPE" : "float",
      "DEFAULT": 0.25,
      "MIN": 0.0,
      "MAX": 1.0
    },
    {
      "NAME" : "hueShift",
      "TYPE" : "float",
      "DEFAULT": 0.15,
      "MIN": 0.0,
      "MAX": 1.0
    }
  ],
  "PASSES" : [
    {
      "TARGET" : "BufferA",
      "PERSISTENT" : true
    },
    {

    }
  ],
  "ISFVSN" : "2"
}
*/

#define NOISEVEC vec3(443.8975,397.2973, 491.1871)

float noise(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * NOISEVEC);
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Get the displacement value based on component selection
float getDisplaceComponent(vec4 pixel, int component) {
    float r = pixel.r;
    float g = pixel.g;
    float b = pixel.b;
    float avg = (r + g + b) / 3.0; // luminance
    
    if (component == 0) return avg;
    else if (component == 1) return r;
    else if (component == 2) return g;
    else if (component == 3) return b;
    else if (component == 4) return (r + g) * 0.5;
    else if (component == 5) return (b + g) * 0.5;
    
    return avg; // default fallback
}

void main() {
    if (PASSINDEX == 0) {
        vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
        
        // Calculate displacement using the end image
        vec4 displacePixel = IMG_NORM_PIXEL(endImage, uv);
        
        // Get displacement values based on selected components
        float xDisp = getDisplaceComponent(displacePixel, xComponent);
        float yDisp = getDisplaceComponent(displacePixel, yComponent);
        vec2 displace = vec2(xDisp, yDisp);
        
        // Apply relative shift if enabled
        if (relativeShift) {
            displace = (displace - 0.5) * 2.0; // Center around 0
        }
        
        // Create a directional displacement that gracefully fades as we approach progress = 1
        // Reduced by 1000x as requested
        float effectiveDisplaceAmount = (displaceAmount * 0.01) * progress * (1.0 - smoothstep(0.8, 1.0, progress));
        vec2 morphedUV = uv + displace * effectiveDisplaceAmount;
        
        // Get the current feedback buffer
        vec4 fb = IMG_NORM_PIXEL(BufferA, morphedUV);
        
        // Calculate spin displacement based on feedback colors
        float spinFactor = spin * 10.0 * (1.0 - smoothstep(0.9, 1.0, progress));
        vec2 pos = morphedUV + vec2(fb.y - fb.x, fb.x - fb.z) * (spinFactor / RENDERSIZE.xy);
        vec4 feedbackColor = IMG_NORM_PIXEL(BufferA, pos);
        
        // Color manipulation in HSV space
        feedbackColor.rgb = rgb2hsv(feedbackColor.rgb);
        feedbackColor.r += hueShift * 0.01;
        feedbackColor.g = clamp(feedbackColor.g + saturation * 0.01, 0.0, 1.0);
        feedbackColor.rgb = hsv2rgb(feedbackColor.rgb);
        
        // Sample images at the morphed coordinates
        vec4 startColor = IMG_NORM_PIXEL(startImage, morphedUV);
        vec4 endColor = IMG_NORM_PIXEL(endImage, uv); // Use exact UV for end image at progress = 1
        
        // Create a non-linear morph curve for smoother transition
        float morphProgress = smoothstep(0.0, 1.0, progress);
        vec4 currentFrame = mix(startColor, endColor, morphProgress);
        
        // Add subtle noise
        vec4 noise = vec4(noise(morphedUV * 0.5 + TIME));
        feedbackColor.rgb += noise.rgb * 0.008;
        
        // Modulate feedback amount with a bell curve centered at progress 0.5
        // Ensure feedback goes to zero at progress = 1
        float feedbackAmount = feedback * (1.0 - pow(abs(progress - 0.5) * 2.0, 2.0)) * (1.0 - smoothstep(0.9, 1.0, progress));
        
        // Final mix between current morphed frame and feedback
        gl_FragColor = mix(currentFrame, feedbackColor, feedbackAmount);
    }
    else if (PASSINDEX == 1) {
        gl_FragColor = IMG_THIS_PIXEL(BufferA);
    }
}