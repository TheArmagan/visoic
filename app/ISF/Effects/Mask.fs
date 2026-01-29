/*
{
  "CATEGORIES" : [
    "Layer"
  ],
  "DESCRIPTION": "Masks the input image's alpha channel based on a mask texture.",
  "ISFVSN" : "2",
  "INPUTS" : [
    {
      "NAME" : "inputImage",
      "TYPE" : "image"
    },
    {
      "NAME" : "maskImage",
      "TYPE" : "image",
      "LABEL" : "Mask Image"
    },
    {
      "LABELS" : [
        "Luma",
        "R",
        "G",
        "B",
        "A"
      ],
      "NAME" : "maskComponent",
      "TYPE" : "long",
      "DEFAULT" : 0,
      "VALUES" : [
        0,
        1,
        2,
        3,
        4
      ]
    },
    {
      "NAME" : "threshold",
      "TYPE" : "float",
      "DEFAULT" : 0.0,
      "MIN" : 0.0,
      "MAX" : 1.0,
      "LABEL" : "Threshold"
    },
    {
      "NAME" : "invertMask",
      "TYPE" : "bool",
      "DEFAULT" : 0,
      "LABEL" : "Invert Mask"
    }
  ],
  "CREDIT" : "Your Name Here"
}
*/

void main() {
    vec2 p = isf_FragNormCoord.xy;
    vec4 inputPixel = IMG_NORM_PIXEL(inputImage, p);
    vec4 maskPixel = IMG_NORM_PIXEL(maskImage, p);
    
    // Calculate all potential mask values
    float maskValues[5];
    maskValues[0] = (maskPixel.r + maskPixel.g + maskPixel.b) / 3.0; // Luminance
    maskValues[1] = maskPixel.r;
    maskValues[2] = maskPixel.g;
    maskValues[3] = maskPixel.b;
    maskValues[4] = maskPixel.a;
    
    // Branchless component selection
    float maskValue = maskValues[maskComponent];
    
    // Invert mask (branchless)
    maskValue = mix(maskValue, 1.0 - maskValue, float(invertMask));
    
    // Apply threshold
    maskValue = maskValue >= threshold ? maskValue : 0.0;
    
    // Apply the mask to the input alpha
    inputPixel.a *= maskValue;
    
    gl_FragColor = inputPixel;
}