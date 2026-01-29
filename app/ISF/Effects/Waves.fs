/*{
    "DESCRIPTION": "Multi-wave displacement effect",
    "CREDIT": "Converted to ISF",
    "ISFVSN": "2",
    "CATEGORIES": ["Distortion"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image",
            "LABEL": "Input Image"
        },
        {
            "NAME": "amplitudeHorizontal",
            "TYPE": "float",
            "DEFAULT": 0.02,
            "MIN": 0.0,
            "MAX": 0.1,
            "LABEL": "Horizontal Amplitude"
        },
        {
            "NAME": "amplitudeVertical",
            "TYPE": "float",
            "DEFAULT": 0.02,
            "MIN": 0.0,
            "MAX": 0.1,
            "LABEL": "Vertical Amplitude"
        },
        {
            "NAME": "frequencyHorizontal",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 10.0,
            "LABEL": "Horizontal Frequency"
        },
        {
            "NAME": "frequencyVertical",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 10.0,
            "LABEL": "Vertical Frequency"
        },
        {
            "NAME": "rateHorizontal",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 5.0,
            "LABEL": "Horizontal Rate"
        },
        {
            "NAME": "rateVertical",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 5.0,
            "LABEL": "Vertical Rate"
        },
        {
            "NAME": "shapeHorizontal",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3, 4],
            "LABELS": [
                "Sine",
                "Tangent",
                "Square",
                "Sawtooth",
                "Triangle"
            ],
            "DEFAULT": 0,
            "LABEL": "Horizontal Shape"
        },
        {
            "NAME": "shapeVertical",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3, 4],
            "LABELS": [
                "Sine",
                "Tangent",
                "Square",
                "Sawtooth",
                "Triangle"
            ],
            "DEFAULT": 0,
            "LABEL": "Vertical Shape"
        }
    ]
}*/

vec2 offset(float time, vec2 pos, float theta, int shape, float amplitude) {
    // Adjust position to be relative to the center of the texture
    vec2 centeredPos = pos - vec2(0.5, 0.5);

    float shifty = 0.0;

    if (shape == 0) {
        // Sin wave
        shifty = amplitude * sin(10.0 * (time + centeredPos.x * frequencyHorizontal + centeredPos.y * frequencyVertical));
    } 
    else if (shape == 1) {
        // Tangent wave
        shifty = amplitude * tan(10.0 * (time + centeredPos.x * frequencyHorizontal + centeredPos.y * frequencyVertical));
    } 
    else if (shape == 2) {
        // Square wave using sign(sin()) to alternate between -1 and 1
        shifty = amplitude * sign(sin(10.0 * (time + centeredPos.x * frequencyHorizontal + centeredPos.y * frequencyVertical)));
    } 
    else if (shape == 3) {
        // Sawtooth wave using mod() for a repeating linear ramp
        shifty = amplitude * mod(5.0 * (time + centeredPos.x * frequencyHorizontal + centeredPos.y * frequencyVertical), 1.0);
    }
    else if (shape == 4) {
        // Triangle wave with increased frequency
        float phaseMultiplier = 2.0;
        float phase = mod((time + centeredPos.x * frequencyHorizontal * phaseMultiplier + centeredPos.y * frequencyVertical * phaseMultiplier), 1.0);
        shifty = amplitude * (1.0 - abs(phase * 2.0 - 1.0));
    }
    return vec2(0, shifty);
}

void main() {
    vec2 p = isf_FragNormCoord;
    // Use rateHorizontal and rateVertical to scale time for each direction
    vec2 offsetHorizontal = offset(TIME * rateHorizontal, p, 0.0, shapeHorizontal, amplitudeHorizontal);
    vec2 offsetVertical = offset(TIME * rateVertical, p, 3.14, shapeVertical, amplitudeVertical);
    
    // Combine horizontal and vertical offsets
    vec2 combinedOffset = vec2(offsetHorizontal.x + offsetVertical.x, offsetHorizontal.y + offsetVertical.y);

    vec4 displacedColor = IMG_NORM_PIXEL(inputImage, p + combinedOffset);
    
    // Output the final color with the original alpha
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, p);
    gl_FragColor = vec4(displacedColor.rgb, originalColor.a);
}