/*{
	"CREDIT": "Converted to ISF",
	"DESCRIPTION": "3D droplets with adjustable dispersion and transparency.",
	"ISFVSN": "2",
	"CATEGORIES": [
		"Distortion", "Animated"
	],
	"INPUTS": [
		{
			"NAME": "inputImage",
			"TYPE": "image"
		},
		{
			"NAME": "dispersion",
			"TYPE": "float",
			"DEFAULT": 1.0,
			"MIN": 0.0,
			"MAX": 5.0
		},
		{
			"NAME": "speed",
			"TYPE": "float",
			"DEFAULT": 1.0,
			"MIN": 0.0,
			"MAX": 5.0
		},
		{
			"NAME": "transparent",
			"TYPE": "bool",
			"DEFAULT": false
		}
	]
}*/

#ifdef GL_ES
precision mediump float;
#endif

#define PI 3.1415926535897932384626433832795
const float HALF_PI = 0.5 * PI;
const float TWO_PI = 2.0 * PI;
const int BALL_NUM = 10;

float hash(in float v) {
    return fract(sin(v) * 43237.5324);
}

vec3 hash3(in float v) {
    return vec3(hash(v), hash(v * 99.0), hash(v * 9999.0));
}

float sphere(in vec3 p, in float r) {
    return length(p) - r;
}

float opSmoothUnion(float d1, float d2, float k) {
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

float map(in vec3 p) {
    float res = 1e5;
    for (int i = 0; i < BALL_NUM; i++) {
        float fi = float(i) + 1.0;
        float r = 0.0 + 1.5 * hash(fi);
        vec3 offset = speed * sin(hash3(fi) * TIME) * dispersion;
        res = opSmoothUnion(res, sphere(p - offset, r), 0.75);
    }
    return res;
}

vec3 normal(in vec3 p) {
    vec2 e = vec2(1.0, -1.0) * 1e-3;
    return normalize(
        e.xyy * map(p + e.xyy) +
        e.yxy * map(p + e.yxy) +
        e.yyx * map(p + e.yyx) +
        e.xxx * map(p + e.xxx)
    );
}

mat3 lookAt(in vec3 eye, in vec3 tar, in float r) {
    vec3 cz = normalize(tar - eye);
    vec3 cx = normalize(cross(cz, vec3(sin(r), cos(r), 0.0)));
    vec3 cy = normalize(cross(cx, cz));
    return mat3(cx, cy, cz);
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec2 p = (uv * 2.0 - 1.0);
    vec3 color = vec3(0.0);

    vec3 ro = 5.0 * vec3(cos(TIME * 0.1), 0.0, sin(TIME * 0.1));
    ro = vec3(0.0, 0.0, 5.0);
    vec3 rd = normalize(lookAt(ro, vec3(0.0), 0.0) * vec3(p, 2.0));

    vec2 tmm = vec2(0.0, 10.0);
    float t = 0.0;
    for (int i = 0; i < 200; i++) {
        float tmp = map(ro + rd * t);
        if (tmp < 0.001 || tmm.y < t) break;
        t += tmp * 0.7;
    }

    vec4 texColor = IMG_NORM_PIXEL(inputImage, uv);

    if (tmm.y < t) { // background
        if (transparent) { // if transparent enabled, make background transparent
            float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114)); // calculate luma
            if (luma < 0.01) { // if luma is less than 0.01, make pixel transparent
                texColor.a = 0.0;
            }
        } else {
            color = vec3(0.0);
        }
    } else { // object
        vec3 pos = ro + rd * t;
        vec3 nor = normal(pos);
        vec3 ref = reflect(rd, nor);

        vec2 texCoord = ref.xy * 0.5 + 0.5;
        color = IMG_NORM_PIXEL(inputImage, texCoord).rgb;
        color += vec3(pow(1.0 - clamp(dot(-rd, nor), 0.0, 1.0), 2.0));
    }

    gl_FragColor = vec4(color, texColor.a);
}
