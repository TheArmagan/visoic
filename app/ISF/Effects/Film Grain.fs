/*{
	"DESCRIPTION": "Film grain noise",
	"CREDIT": "Harmony",
	"CATEGORIES": [
		"Animated",
		"Texture"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "grainStrength",
			"TYPE": "float",
			"DEFAULT": 16.0,
			"MIN": 0.0,
			"MAX": 50.0
		},
		{
			"NAME": "grainMode",
			"TYPE": "long",
			"VALUES": [0, 1],
			"LABELS": ["Additive", "Multiplicative"],
			"DEFAULT": 0
		}
	]
}*/

void main() {
	vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
	
	vec4 color = IMG_PIXEL(inputImage, gl_FragCoord.xy);
	
	float x = (uv.x + 4.0) * (uv.y + 4.0) * (TIME + 500.0);
	vec4 grain = vec4(mod((mod(x, 13.0) + 1.0) * (mod(x, 123.0) + 1.0), 0.01)-0.005) * grainStrength;
	
	// Apply grain based on selected mode
	if (grainMode == 0) {
		// Additive grain
		gl_FragColor = color + grain;
	} else {
		// Multiplicative grain (inverted)
		grain = 1.0 - grain;
		gl_FragColor = color * grain;
	}
}