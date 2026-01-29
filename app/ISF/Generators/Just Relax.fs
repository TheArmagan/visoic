/*{
	"CREDIT": "by joshpbatty, ported from https://www.shadertoy.com/view/llj3zW.",
	"DESCRIPTION": "Intricate fractal pattern with radial distortions and recursive swirling shapes.",
	"CATEGORIES": [
		"Complex", "Animated", "Efficient", "Fractal", "NonCommercial", "Radial"
	],
	  "INPUTS": [
   	 {
		"NAME": "speed",
		"TYPE": "float",
		"DEFAULT": 0.50,
		"MIN": 0.0,
		"MAX": 3.0
	},
	{
		"NAME": "shape_offset",
		"TYPE": "float",
		"DEFAULT": 0.31,
		"MIN": 0.0,
		"MAX": 1.0
	}
  ]
}*/

void main() 
{
	vec2 uv = isf_FragNormCoord-.5;
	vec2 p=uv*.6;
    p.x*=RENDERSIZE.x/RENDERSIZE.y;
    vec3 co=vec3(0.);
    float l=length(p);
    float f=.1; float a=3.; float t=TIME*(speed*3.0);
	vec2 pp=vec2(0.);
//	float c=mod(t*.1+(shape_offset*8.0),10.0)/15.+0.55;
	float c=.5+sin(t*.1+(shape_offset*8.0))/3.14+0.55;
    for (int i=0; i<6; i++) {
        p=abs(p)/dot(p,p)-c;
    }
	l=length(p)-abs(1.-mod(atan(p.x,p.y)*6.+t,2.));
  
    vec3 tex = vec3(1.0);
    co=pow(max(0.,1.-l),1.5)*tex+pow(max(0.,.5-length(p))/.5,2.)*vec3(1.,.8,.5);
    co+=pow(max(0.,.5-length(uv))/.5,3.)*vec3(.7,.5,.3);
    co*=max(0.,.7-length(uv))/.7;
    gl_FragColor = vec4(co.b,co.b,co.b,1.0);
}
