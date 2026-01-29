/*{
    "DESCRIPTION": "Professional Levels adjustment with input/output levels and gamma correction",
    "CREDIT": "Nuvotion",
    "ISFVSN": "2.0",
    "CATEGORIES": [
        "Color", "Static"
    ],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "inputBlack",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Input Black"
        },
        {
            "NAME": "inputWhite",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Input White"
        },
        {
            "NAME": "gamma",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.01,
            "MAX": 9.99,
            "LABEL": "Gamma"
        },
        {
            "NAME": "outputBlack",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Output Black"
        },
        {
            "NAME": "outputWhite",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Output White"
        }
    ]
}*/

// Applies the levels adjustment to a single channel
float adjustLevels(float channel) {
    // 1. Apply input levels
    float normalized = (channel - inputBlack) / (inputWhite - inputBlack);
    normalized = clamp(normalized, 0.0, 1.0);
    
    // 2. Apply gamma correction
    float gammaCorrected = pow(normalized, 1.0/gamma);
    
    // 3. Apply output levels
    return outputBlack + (gammaCorrected * (outputWhite - outputBlack));
}

void main() {
    vec4 color = IMG_THIS_PIXEL(inputImage);
    
    // Apply levels adjustment to RGB channels
    color.r = adjustLevels(color.r);
    color.g = adjustLevels(color.g);
    color.b = adjustLevels(color.b);
    
    gl_FragColor = color;
}