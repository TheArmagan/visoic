/*{
	"DESCRIPTION": "Persistent feedback blending fresh and previous frames with adjustable blur.",
	"CREDIT": "by zoidberg",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Feedback", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "blurAmount",
			"TYPE": "float",
			"DEFAULT": 0.0
		}
	],
	"PASSES": [
		{
			"TARGET":"bufferVariableNameA",
			"PERSISTENT": true,
			"FLOAT": true
		},
		{
		
		}
	]
	
}*/

void main()
{
	vec4		freshPixel = IMG_PIXEL(inputImage,gl_FragCoord.xy);
	vec4		stalePixel = IMG_PIXEL(bufferVariableNameA,gl_FragCoord.xy);
	gl_FragColor = mix(freshPixel,stalePixel,blurAmount);
}
