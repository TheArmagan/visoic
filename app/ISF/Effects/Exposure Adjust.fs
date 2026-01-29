/*{
	"CREDIT": "by carter rosenberg",
	"DESCRIPTION": "Adjusts brightness by scaling RGB values with an exponential factor based on exposure value.",
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
			"NAME": "inputEV",
			"TYPE": "float",
			"MIN": -10.0,
			"MAX": 10.0,
			"DEFAULT": 0.5
		}
	]
}*/



void main() {
	//	based on
	//	https://developer.apple.com/library/mac/documentation/graphicsimaging/reference/CoreImageFilterReference/Reference/reference.html#//apple_ref/doc/filter/ci/CIExposureAdjust
	vec4		tmpColorA = IMG_THIS_PIXEL(inputImage);
	tmpColorA.rgb = tmpColorA.rgb * pow(2.0, inputEV);
	gl_FragColor = tmpColorA;
}
