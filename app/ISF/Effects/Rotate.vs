#if __VERSION__ <= 120
varying vec2 translated_coord;
#else
out vec2 translated_coord;
#endif

const float pi = 3.14159265359;

void main()	{
	isf_vertShaderInit();

	// Normalize koordinatları merkez etrafında döndür
	vec2 uv = vv_FragNormCoord;
	vec2 centered = uv - vec2(0.5);
	
	float r = length(centered);
	float a = atan(centered.y, centered.x);
	
	// Yeni açıyı hesapla
	float newAngle = a + 2.0 * pi * angle;
	
	// Döndürülmüş koordinatları hesapla
	translated_coord = vec2(
		r * cos(newAngle) + 0.5,
		r * sin(newAngle) + 0.5
	);
}