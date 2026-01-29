/*{
    "DESCRIPTION": "Animated bulge effect with rippling distortion",
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
            "DEFAULT": 1.0,
            "MIN": -1.5,
            "MAX": 1.5,
            "LABEL": "Bulge Strength"
        },
        {
            "NAME": "ripples",
            "TYPE": "float",
            "DEFAULT": 10.0,
            "MIN": 0.0,
            "MAX": 30.0,
            "LABEL": "Ripple Frequency"
        },
        {
            "NAME": "animationSpeed",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 5.0,
            "LABEL": "Animation Speed"
        }
    ]
}*/

vec2 Distort(vec2 p, float power, float freq) {
    float theta = atan(p.y, p.x);
    float radius = length(p);
    radius = pow(radius, power * sin(radius * freq - TIME * animationSpeed) + 1.0);
    p.x = radius * cos(theta);
    p.y = radius * sin(theta);
    return 0.5 * (p + 1.0);
}

void main() {
    vec2 uv = isf_FragNormCoord * 2.0 - 1.0;
    vec2 distortedUV;
    float d = length(uv);

    if (d < 1.0 && strength != 0.0) {
        distortedUV = Distort(uv, strength, ripples);
    } 
    else {
        distortedUV = isf_FragNormCoord;
    }

    vec4 color = IMG_NORM_PIXEL(inputImage, distortedUV);
    gl_FragColor = color;
}