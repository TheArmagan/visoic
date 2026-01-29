/*{
	"CREDIT": "by zoidberg",
	"DESCRIPTION": "Converts colors to grayscale using either the minimum or maximum RGB component value.",
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
			"NAME": "useMaximum",
			"TYPE": "bool",
			"DEFAULT": false,
			"LABEL": "Use Maximum Component"
		}
	]
}*/

void main() {
	vec4		srcPixel = IMG_THIS_PIXEL(inputImage);
	float		component;
	if (useMaximum)
		component = max(srcPixel.r, max(srcPixel.g, srcPixel.b));
	else
		component = min(srcPixel.r, min(srcPixel.g, srcPixel.b));
	gl_FragColor = vec4(component, component, component, srcPixel.a);
}
