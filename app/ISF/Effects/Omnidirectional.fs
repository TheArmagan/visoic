/*{
    "DESCRIPTION": "Omnidirectional warping effect",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Distortion"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "positionX",
            "TYPE": "float",
            "DEFAULT": 0.5,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "positionY",
            "TYPE": "float",
            "DEFAULT": 0.5,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "distortionStrength",
            "TYPE": "float",
            "DEFAULT": 0.25,
            "MIN": 0.0,
            "MAX": 0.5
        }
    ]
}*/

#define PI 3.1415926535897932384626433832795

void main() {
    vec2 center = vec2(positionX, positionY);  // Use position inputs directly as center
    vec2 from_center = isf_FragNormCoord - center;
    
    float radius = distortionStrength * (1.0 + sin(TIME) * 0.1); // Animate radius
    
    // Calculate distortion
    float dist = length(from_center);
    vec2 direction = normalize(from_center);
    
    // Create non-linear distortion
    float distortionFactor = radius / (dist * dist + 0.1);
    vec2 distorted = center + direction * dist * distortionFactor;
    
    // Ensure we stay within texture bounds
    distorted = clamp(distorted, 0.0, 1.0);
    
    vec4 affectedColor = IMG_NORM_PIXEL(inputImage, distorted);
    gl_FragColor = affectedColor;
}