/*{
	"CREDIT": "by zoidberg & Nuvotion",
	"DESCRIPTION": "Adjusts image brightness using a perceptual (default) or linear method.",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Color", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "brightness",
			"TYPE": "float",
			"MIN": -1.0,
			"MAX": 1.0,
			"DEFAULT": 0.0
		},
		{
			"NAME": "linear",
			"TYPE": "bool",
			"DEFAULT": false,
			"LABEL": "Use Linear Method"
		}
	]
}*/

void main() {
    vec4 color = IMG_THIS_PIXEL(inputImage);

    if (linear) {
        // Linear method: uniformly adds brightness to each channel.
        vec4 adjustedColor = color + vec4(brightness, brightness, brightness, 0.0);
        gl_FragColor = clamp(adjustedColor, 0.0, 1.0);
    } 
    else {
        // Perceptual method: adjusts brightness based on human perception of luminance.
        float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        
        float factor;
        if (brightness > 0.0) {
            // Increasing brightness approaches white with diminishing returns on already bright areas.
            factor = 1.0 + brightness * (1.0 - luminance);
        } 
        else {
            // Decreasing brightness approaches black uniformly.
            factor = 1.0 + brightness;
        }
        
        vec3 result = color.rgb * factor;
        
        gl_FragColor = vec4(clamp(result, 0.0, 1.0), color.a);
    }
}
