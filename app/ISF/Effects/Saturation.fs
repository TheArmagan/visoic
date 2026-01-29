/*{
	"CREDIT": "by zoidberg",
	"DESCRIPTION": "Adjusts saturation of an image.",
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
			"NAME": "saturation",
			"TYPE": "float",
			"MIN": 0.0,
			"MAX": 4.0,
			"DEFAULT": 1.0
		}
	]
}*/

vec3 rgb2hsv(vec3 c);
vec3 hsv2rgb(vec3 c);

void main() {
	vec4 tmpColorA = IMG_THIS_PIXEL(inputImage);
	vec4 tmpColorB;
	
	// Convert RGB to HSV
	tmpColorB.xyz = rgb2hsv(clamp(tmpColorA.rgb, 0.0, 1.0));
	tmpColorB.a = tmpColorA.a;
	
	// Apply saturation adjustment
	tmpColorB.y = tmpColorB.y * saturation;
	
	// Convert HSV back to RGB
	tmpColorA.rgb = hsv2rgb(clamp(tmpColorB.xyz, 0.0, 1.0));
	tmpColorA.a = tmpColorB.a;
	
	gl_FragColor = clamp(tmpColorA, 0.0, 1.0);
}

vec3 rgb2hsv(vec3 c)	{
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
	vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
	
	float d = q.x - min(q.w, q.y);
	float e = 1.0e-10;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)	{
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
} 