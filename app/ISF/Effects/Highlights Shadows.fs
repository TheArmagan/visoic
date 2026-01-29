/*{
    "DESCRIPTION": "Advanced light adjustment with exposure, highlights and shadows controls",
    "CREDIT": "Adapted for ISF",
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
            "NAME": "exposure",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -2.0,
            "MAX": 2.0,
            "LABEL": "Exposure"
        },
        {
            "NAME": "highlights",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 2.0,
            "LABEL": "Highlights"
        },
        {
            "NAME": "shadows",
            "TYPE": "float",
            "DEFAULT": 1.0,
            "MIN": 0.0,
            "MAX": 2.0,
            "LABEL": "Shadows"
        }
    ]
}*/

const vec3 LUMINANCE_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

float getLuminance(vec3 color) {
    return dot(color, LUMINANCE_WEIGHTS);
}

void main() {
    vec4 source = IMG_THIS_PIXEL(inputImage);
    
    // Apply exposure first
    vec3 color = source.rgb * pow(2.0, exposure);
    
    // Get luminance
    float luminance = getLuminance(color);
    
    // Create contrast-enhanced luminance for better highlight/shadow detection
    float contrastedLuminance = ((luminance - 0.5) * 1.5) + 0.5;
    
    // Highlight adjustment
    float highlightStrength = contrastedLuminance * contrastedLuminance * contrastedLuminance;
    float highlightAdjustment = highlights > 1.0 ? 
        mix(1.0, highlights, highlightStrength) :  // Brighten highlights
        mix(1.0, highlights, highlightStrength);   // Reduce highlights
    
    // Shadow adjustment
    float shadowStrength = (1.0 - contrastedLuminance) * (1.0 - contrastedLuminance) * (1.0 - contrastedLuminance);
    float shadowAdjustment = shadows > 1.0 ?
        mix(1.0, shadows, shadowStrength) :     // Lift shadows
        mix(1.0, shadows, shadowStrength);      // Deepen shadows
    
    // Apply both adjustments
    color *= highlightAdjustment * shadowAdjustment;
    
    gl_FragColor = vec4(color, source.a);
}