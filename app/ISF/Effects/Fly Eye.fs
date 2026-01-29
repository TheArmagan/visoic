/*{
    "DESCRIPTION": "Creates a compound eye effect with optional color separation",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Distortion"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "strength",
            "TYPE": "float",
            "DEFAULT": 0.1,
            "MIN": 0.1,
            "MAX": 0.5,
            "LABEL": "Distortion Strength"
        },
        {
            "NAME": "size",
            "TYPE": "float",
            "DEFAULT": 30.0,
            "MIN": 1.0,
            "MAX": 50.0,
            "LABEL": "Cell Size"
        },
        {
            "NAME": "colorSeparation",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0,
            "LABEL": "Color Separation"
        }
    ]
}*/

void main() {
    vec2 p = isf_FragNormCoord;
    vec4 tex = IMG_NORM_PIXEL(inputImage, p);

    vec2 baseDisp = strength * vec2(cos(size * p.x), sin(size * p.y));

    vec4 texOffset = vec4(
        IMG_NORM_PIXEL(inputImage, p + baseDisp * (1.0 - colorSeparation)).r,
        IMG_NORM_PIXEL(inputImage, p + baseDisp).g,
        IMG_NORM_PIXEL(inputImage, p + baseDisp * (1.0 + colorSeparation)).b,
        tex.a
    );

    gl_FragColor = texOffset;
}