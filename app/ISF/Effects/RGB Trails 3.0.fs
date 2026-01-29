/*{
	"CREDIT": "by zoidberg",
	"ISFVSN": "2",
	"DESCRIPTION": "Combines current and previous frames with adjustable weights for each color channel to create a feedback effect.",
	"CATEGORIES": [
		"Feedback", "Static"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "rWeight",
			"TYPE": "float"
		},
		{
			"NAME": "gWeight",
			"TYPE": "float"
		},
		{
			"NAME": "bWeight",
			"TYPE": "float"
		},
		{
			"NAME": "aWeight",
			"TYPE": "float",
			"DEFAULT": 0.0
		}
	],
	"PASSES": [
		{
			"TARGET":"accum",
			"PERSISTENT": true,
			"FLOAT": true
		},
		{
		
		}
	]
	
}*/

void main()
{
	if (PASSINDEX==0)	{
		vec4		freshPixel = IMG_THIS_PIXEL(inputImage);
		vec4		stalePixel = IMG_THIS_PIXEL(accum);
		gl_FragColor = vec4(mix(freshPixel.r,stalePixel.r,rWeight), mix(freshPixel.g,stalePixel.g,gWeight), mix(freshPixel.b,stalePixel.b,bWeight), mix(freshPixel.a,stalePixel.a,aWeight));
	}
	else
		gl_FragColor = IMG_THIS_PIXEL(accum);
}
