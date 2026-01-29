/*{
    "DESCRIPTION": "Grid effect with optional alternating pattern",
    "CREDIT": "Nuvotion",
    "ISFVSN": "2",
    "CATEGORIES": ["Reflection"],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "rows",
            "TYPE": "float",
            "DEFAULT": 3.0,
            "MIN": 1.0,
            "MAX": 50.0
        },
        {
            "NAME": "alternate",
            "TYPE": "bool",
            "DEFAULT": false
        },
        {
            "NAME": "verticalMode",
            "TYPE": "bool",
            "DEFAULT": false,
            "LABEL": "Vertical Alternating"
        }
    ]
}*/

void main() {
    vec2 uv;
    vec2 coord;
    
    if (!alternate) {
        // Simple grid mode
        uv = (isf_FragNormCoord - 0.5) * rows + 0.5;
        coord = fract(uv);
    } 
    else {
        // Alternating mode
        uv = isf_FragNormCoord * rows - 0.5 * (rows - 1.0);
        
        vec2 grid0 = fract(uv);
        vec2 grid1;
        
        if (verticalMode) {
            grid1 = fract(vec2(uv.x, 1.0 - uv.y));
        } else {
            grid1 = fract(vec2(1.0 - uv.x, uv.y));
        }
        
        float everyOther = mod(floor(uv.x) + floor(uv.y), 2.0);
        coord = grid0 * everyOther + grid1 * (1.0 - everyOther);
    }
    
    vec4 color = IMG_NORM_PIXEL(inputImage, coord);
    gl_FragColor = color;
}