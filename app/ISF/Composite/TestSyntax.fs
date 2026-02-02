/*{
    "DESCRIPTION": "Test",
    "CREDIT": "",
    "ISFVSN": "2.0",
    "CATEGORIES": [ "TEST" ],
    "INPUTS": []
}*/

void main() {
    vec3 destinationRGB = vec3(0.5);
    vec3 sourceRGB = vec3(0.5);
    vec4 blendedColor = vec4(1.0);
    
    blendedColor.rgb = vec3(
        (destinationRGB.r == 1.0) ? 1.0 : (destinationRGB.r + sourceRGB.r < 1.0) ? min(1.0, destinationRGB.r / (1.0 - sourceRGB.r)) / 2.0 : (sourceRGB.r == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.r, 0.0, 1.0) / sourceRGB.r / 2.0,
        (destinationRGB.g == 1.0) ? 1.0 : (destinationRGB.g + sourceRGB.g < 1.0) ? min(1.0, destinationRGB.g / (1.0 - sourceRGB.g)) / 2.0 : (sourceRGB.g == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.g, 0.0, 1.0) / sourceRGB.g / 2.0,
        (destinationRGB.b == 1.0) ? 1.0 : (destinationRGB.b + sourceRGB.b < 1.0) ? min(1.0, destinationRGB.b / (1.0 - sourceRGB.b)) / 2.0 : (sourceRGB.b == 0.0) ? 0.0 : 1.0 / clamp(1.0 / destinationRGB.b, 0.0, 1.0) / sourceRGB.b / 2.0
    );
    gl_FragColor = blendedColor;
}
