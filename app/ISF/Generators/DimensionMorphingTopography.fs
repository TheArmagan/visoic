/*{
	"DESCRIPTION": "A morphing topographical 3D structure with dynamic lighting and fractal-inspired surface deformation.",
	"CREDIT": "by mojovideotech, based on https://www.shadertoy.com/view/lsBBD1",
	"CATEGORIES": [
		"Animated",
		"Complex",
		"Fratcal",
		"Inefficient",
		"3D",
		"NonCommercial",
		"Radial"
	],
	"INPUTS": [
		{
    	  	"NAME": 	"rX",
    	  	"TYPE": 	"float",
    	  	"MIN": 		-3.1459,
    	  	"MAX": 		3.1459,
    	  	"DEFAULT": 	0.0
    	},
    	{
    		"NAME": 	"rY",
      		"TYPE": 	"float",
      		"MIN": 		-3.1459,
      		"MAX": 		3.1459,
    		 "DEFAULT": 0.0
    	},
    	{
      		"NAME": 	"rZ",
      		"TYPE": 	"float",
      		"MIN": 		-3.1459,
      		"MAX": 		3.1459,
      		"DEFAULT": 	0.0
    	},
    	{
      		"NAME": 	"zoom",
      		"TYPE": 	"float",
      		"MIN": 		1.0,
      		"MAX": 		5.0,
      		"DEFAULT": 	2.25
    	},
     	{
    		"NAME":   	"blend",
      		"TYPE":   	"point2D",
      		"MAX":    	[ 1.0, 1.0 ],
      		"MIN":    	[ -1.0, -1.0 ],
      		"DEFAULT":	[ 0.0, 0.0 ]
    	},
		{
			"NAME": 	"subdivisions",
			"TYPE": 	"float",
			"DEFAULT": 	4.0,
			"MIN": 		1.0,
			"MAX": 	    6.0
		},
		{
			"NAME": 	"light",
			"TYPE": 	"float",
			"DEFAULT": 	12.5,
			"MIN": 		0.0,
			"MAX": 		30.0
		},
		{
			"NAME": 	"rate",
			"TYPE": 	"float",
			"DEFAULT": 	2.5,
			"MIN": 		0.0,
			"MAX": 		3.0
		},
		{
			"NAME": 	"cycle",
			"TYPE": 	"float",
			"DEFAULT": 	0.75,
			"MIN": 		0.0,
			"MAX": 		3.0
		},
		{
			"NAME": 	"roto",
			"TYPE": 	"float",
			"DEFAULT": 	0.25,
			"MIN": 		0.0,
			"MAX": 		2.0
		}
	]
}*/


////////////////////////////////////////////////////////////
// DimensionMorphingTopography  by mojovideotech
//
// based on :
// shadertoy.com/\lsBBD1  by bal-khan
//
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0
////////////////////////////////////////////////////////////


// struct removed


// globals removed

float sdTorus( vec3 p, vec2 tx ) {
	vec2 q = vec2(length(p.zy)-tx.x,p.x);
	return length(q)-tx.y;
}

float sdHexPrism( vec3 p, vec2 hx ) {
    vec3 q = abs(p);
    return max(q.z-hx.y,max((q.x*0.866025+q.y*0.5),q.y)-hx.x);
}

float sdBox( vec3 p, vec3 b ) { return length(max(abs(p)-b,0.0)); }

vec2 rotate(vec2 v, float angle) { return vec2(cos(angle)*v.x+sin(angle)*v.y,-sin(angle)*v.x+cos(angle)*v.y); }

float	scene(vec3 p_in, out float ii, out float m) {
	vec3 p = p_in;
    float distanceToL = 1e3;
    mat2 ma;
    float r2 = 1e5, k = 1.0;
    ii=0.0;
    m = r2;
    float aa = TIME*rate*0.025;
    p.z+=6.0;
    float tr = TIME*roto;
    vec2 rot1;
    rot1 = rotate(p.zx, rX+cos(tr));
    p.z = rot1.x;
    p.x = rot1.y;

    vec2 rot2;
    rot2 = rotate(p.zy, rY+sin(tr));
    p.z = rot2.x;
    p.y = rot2.y;

    vec2 rot3;
    rot3 = rotate(p.xy, rZ-sin(tr)+tr);
    p.x = rot3.x;
    p.y = rot3.y;
    for(float	i = -1.0; i < 24.0; i+=1.0) {
        ii+=1.0;
        if (i > floor(subdivisions*3.0)) { break; }
		r2= min(r2, sdHexPrism(p, vec2(0.3,0.3)) );
		distanceToL = sdHexPrism(p, vec2(0.3, 0.0))*60.0;
		aa=aa+0.5/(i+2.0);
        if (mod(i, 3.0) == 0.0) {
            ma = mat2(cos(aa+1.0*ii*0.25),sin(aa+1.0*ii*0.25), -sin(aa+1.0*ii*0.25), cos(aa+1.0*ii*0.25) );
	        vec2 r1 = p.xy * ma; p.x = r1.x; p.y = r1.y;
	        vec2 abs1 = abs(p.xy)-0.125; p.x = abs1.x; p.y = abs1.y;
			p.z -= 0.2;
        }
        else if (mod(i, 3.0) == 1.0) {
            ma = mat2(cos(aa*3.0+1.04+1.0*ii*0.1),sin(aa*3.0+1.04+1.0*ii*0.1), -sin(aa*3.0+1.04+1.0*ii*0.1), cos(aa*3.0+1.04+1.0*ii*0.1) );
	        vec2 r2 = p.yz * ma; p.y = r2.x; p.z = r2.y;
	        vec2 abs2 = abs(p.zy)-0.125; p.z = abs2.x; p.y = abs2.y;
            p.x -= 0.2;
        }
        else if (mod(i, 3.0) == 2.0) {
            ma = mat2(cos(aa*2.0+2.08+1.0*ii*0.5),sin(aa*2.0+2.08+1.0*ii*0.5), -sin(aa*2.0+2.08+1.0*ii*0.5), cos(aa*2.0+2.08+1.0*ii*0.5) );
            vec2 r3 = p.zx * ma; p.z = r3.x; p.x = r3.y;
	        vec2 abs3 = abs(p.xz)-0.125; p.x = abs3.x; p.z = abs3.y;
	       	p.y -= 0.2;
        }
	m = min(m, log(sdBox(p,vec3(0.0612510))/(k*k) ) );
    k *= 1.125;
    }
    return r2;
}

vec3 evaluateLight(in vec3 pos) {
    return vec3(0.0);
}

vec2	rayMarch(vec3 pos, vec3 dir, inout vec3 lux, out float ii, out float m) {
    vec2 marchStep = vec2(0.0) , marchDist = vec2(0.0) ;
    for (int i = 0; i < 30; i+=1) {
    	vec3 currentPos = pos + dir * marchDist.y;
        marchDist.x = scene(currentPos, ii, m);
        marchDist.y += marchDist.x;
            vec3 lightVal = evaluateLight(currentPos);
        lux = lux + lightVal;
        if (marchDist.x < 0.00125 || marchDist.y > 20.0) { break; }
        marchStep.x += 1.0;
    }
    marchStep.y = marchDist.y;
    return (marchStep);
}

vec3	camera(vec2 uv) {
    float   fov = zoom/floor(subdivisions);
	vec3    forw  = vec3(0.0, 0.0, -1.0);
	vec3    right = vec3(1.0, 0.0, 0.0);
	vec3    up    = vec3(0.0, 1.0, 0.0);
    return (normalize((uv.x) * right + (uv.y) * up + fov * forw));
}

void main()
{
    vec3 lux = vec3(0.0);
    float tc = 0.0;
    float ii;
    float m;

    vec4 o = vec4(0.0,0.0,0.0,1.0);
    vec2 uv  = vec2(gl_FragCoord.xy - RENDERSIZE.xy/2.0) / RENDERSIZE.y;
	vec3 dir = camera(uv);
    vec3 pos = vec3(0.0, 0.0, 0.0);
    vec2 inter = (rayMarch(pos, dir, lux, ii, m));
    if (inter.y < 20.0) {
    	vec3 colorAdd = vec3( abs(sin(tc*1.0+ii*0.1+m+1.04)-blend.x), abs(sin(tc*1.0+ii*0.1+m+2.09+blend.x)), abs(sin(tc*1.0+ii*0.1+m+3.14+blend.y)))*(1.0-inter.x*0.05);
        o.x = o.x + colorAdd.x;
        o.y = o.y + colorAdd.y;
        o.z = o.z + colorAdd.z;

   		o.x = o.x + lux.x;
        o.y = o.y + lux.y;
        o.z = o.z + lux.z;
    }
    gl_FragColor = vec4(o);
}
