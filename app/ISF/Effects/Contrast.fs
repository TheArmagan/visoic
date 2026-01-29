/*{
	"CREDIT": "Nuvotion",
	"DESCRIPTION": "Adjusts contrast of an image.",
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
			"NAME": "contrast",
			"TYPE": "float",
			"MIN": -4.0,
			"MAX": 4.0,
			"DEFAULT": 1.0
		}
	]
}*/
void main() {
	vec4 tmpColorA = IMG_THIS_PIXEL(inputImage);
	vec4 tmpColorB = tmpColorA;
	
	// Apply contrast adjustment
	tmpColorA.rgb = ((vec3(2.0) * (tmpColorB.rgb - vec3(0.5))) * vec3(contrast) / vec3(2.0)) + vec3(0.5);
	tmpColorA.a = ((2.0 * (tmpColorB.a - 0.5)) * abs(contrast) / 2.0) + 0.5;
	
	gl_FragColor = clamp(tmpColorA, 0.0, 1.0);
}