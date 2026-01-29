/*{
    "DESCRIPTION": "Feedback with luma key, positioning, and perceptual brightness",
    "CATEGORIES": ["Feedback"],
    "ISFVSN": "2.0",
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "feedback",
            "TYPE": "float",
            "DEFAULT": 0.85,
            "MIN": 0.0,
            "MAX": 0.99
        },
        {
            "NAME": "threshold",
            "TYPE": "float",
            "DEFAULT": 0.2,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "softness",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "zoom",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.9,
            "MAX": 1.1,
            "LABEL": "Zoom"
        },
        {
            "NAME": "offsetX",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -0.01,
            "MAX": 0.01,
            "LABEL": "X Offset"
        },
        {
            "NAME": "offsetY",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -0.01,
            "MAX": 0.01,
            "LABEL": "Y Offset"
        },
        {
            "NAME": "brightness",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -0.01,
            "MAX": 0.01,
            "LABEL": "Feedback Brightness"
        }
    ],
    "PASSES": [
        {
            "TARGET": "feedbackBuffer",
            "PERSISTENT": true,
            "FLOAT": true
        },
        {
        }
    ]
}*/

void main() {
    vec2 uv = isf_FragNormCoord;
    
    if (PASSINDEX == 0) {
        // Transform coordinates for feedback with fine offset control
        vec2 feedbackUV = uv;
        
        // Apply zoom around center point
        feedbackUV = (feedbackUV - vec2(0.5)) / zoom + vec2(0.5);
        
        // Apply offset
        feedbackUV += vec2(offsetX, offsetY);
        
        // Sample input and feedback
        vec4 inputPixel = IMG_THIS_NORM_PIXEL(inputImage);
        vec4 feedbackPixel = IMG_NORM_PIXEL(feedbackBuffer, feedbackUV);
        
        // Apply perceptual brightness to feedback
        float luminance = dot(feedbackPixel.rgb, vec3(0.2126, 0.7152, 0.0722));
        float factor;
        if (brightness > 0.0) {
            factor = 1.0 + brightness * (1.0 - luminance);
        } else {
            factor = 1.0 + brightness;
        }
        feedbackPixel.rgb *= factor;
        feedbackPixel.rgb = clamp(feedbackPixel.rgb, 0.0, 1.0);
        
        // Calculate luma key from input
        float luma = (inputPixel.r * 0.29 + inputPixel.g * 0.6 + inputPixel.b * 0.11);
        float l1 = threshold - softness * 0.5;
        float l2 = l1 + softness;
        float mask = smoothstep(max(l1, 0.0), min(l2, 1.0), luma);
        
        // Mix feedback with input based on luma key and feedback amount
        if (feedbackUV.x < 0.0 || feedbackUV.y < 0.0 || feedbackUV.x > 1.0 || feedbackUV.y > 1.0) {
            gl_FragColor = inputPixel;
        } else {
            gl_FragColor = mix(feedbackPixel, inputPixel, mask * (1.0 - feedback));
        }
    }
    else {
        // Second pass - output the feedback buffer
        gl_FragColor = IMG_THIS_PIXEL(feedbackBuffer);
    }
}