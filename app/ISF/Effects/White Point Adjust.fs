/*{
	"CREDIT": "by zoidberg",
	"ISFVSN": "2",
	"DESCRIPTION": "Adjusts white point by multiplying pixels with a specified color.",
	"CATEGORIES": [
		"Color", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "newWhite",
			"TYPE": "color",
			"DEFAULT": [
				1.0,
				1.0,
				1.0,
				1.0
			]
		}
	]
}*/



void main() {
	vec4		tmpColorA = IMG_THIS_PIXEL(inputImage);
	gl_FragColor = tmpColorA * newWhite;
}