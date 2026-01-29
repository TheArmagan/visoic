
/*{
	"DESCRIPTION": "Glowing oscillating waveforms with vibrant color blending.",
	"CREDIT": "",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Complex", "Animated", "Efficient", "Commercial"
	],
	"INPUTS": [

	]
	
}*/

#define time TIME
#define resolution RENDERSIZE

#ifdef GL_ES
precision mediump float;
#endif

void main()	{
	vec2 position = ( gl_FragCoord.xy / resolution.xy );
	
	float hr = position.y - (sin(position.x*30.0 - time* 4.0)*0.2 + 0.5);
	float hg = position.y - (sin(position.x*50.0 - time* 5.0)*0.1 + 0.5);
	float hb = position.y - (sin(position.x*20.0 - time* 4.0)*0.2 + 0.5);

	float fr = pow(1.0-hr*hg, 1000.0);
	float fg = pow(1.0-hg*hb, 100.0);
	float fb = pow(1.0-hb*hr, 100.0) * 55.0;
	
	gl_FragColor = vec4( fr, fg, fb, 99.0 );
}
