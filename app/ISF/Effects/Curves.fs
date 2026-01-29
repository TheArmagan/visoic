/*{
  "DESCRIPTION": "Accurate color grading in RGB, LAB, or YCbCr color spaces",
  "CREDIT": "Nuvotion (colorspace math from tsulej)",
  "ISFVSN": "2.0",
  "CATEGORIES": [ "Color" ],
  "INPUTS": [
    { "NAME": "inputImage", "TYPE": "image" },
     {
      "NAME": "colorspace",
      "LABEL": "Colorspace",
      "TYPE": "long",
      "VALUES": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      "LABELS": ["RGB", "LAB", "YCbCr", "OHTA", "CMY", "HSB", "XYZ", "YXY", "HCL", "LUV", "HWB", "R-GGB-G", "YPbPr", "YDbDr", "Greyscale", "YUV", "RGBA", "CMYK"]
    },
    { "NAME": "curvesData", "LABEL": "Curves", "TYPE": "image" }
  ]
}*/

// LAB constants
const float D65X = 0.950456;
const float D65Y = 1.0;
const float D65Z = 1.088754;
const float CIEEpsilon = 216.0 / 24389.0;
const float CIEK = 24389.0 / 27.0;
const float RANGE_X = 100.0 * (0.4124 + 0.3576 + 0.1805);
const float RANGE_Y = 100.0;
const float RANGE_Z = 100.0 * (0.0193 + 0.1192 + 0.9505);
const float one_third = 1.0 / 3.0;
const float one_116 = 1.0 / 116.0;

// Additional constants for LUV
const float D65FX_4 = 4.0*D65X/(D65X+15.0*D65Y+3.0*D65Z);
const float D65FY_9 = 9.0*D65Y/(D65X+15.0*D65Y+3.0*D65Z);
const float mepsilon = 1.0e-10;
const float corrratio = 1.0/2.4;
const float CIEK2epsilon = CIEK * CIEEpsilon;

// Constants for YUV
const float Umax = 0.436;
const float Vmax = 0.615;

// Gamma correction (sRGB to linear)
float srgbToLinear(float c) {
    return (c <= 0.04045) ? (c / 12.92) : pow((c + 0.055) / 1.055, 2.4);
}

// Linear to sRGB
float linearToSrgb(float c) {
    return (c <= 0.0031308) ? (12.92 * c) : (1.055 * pow(c, 1.0 / 2.4) - 0.055);
}

// Helper function to calculate luminance
float getLuma(vec3 color) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

// RGB (0-1) to XYZ
vec3 rgbToXyz(vec3 rgb) {
    float r = srgbToLinear(rgb.r);
    float g = srgbToLinear(rgb.g);
    float b = srgbToLinear(rgb.b);
    
    float x = (0.4124 * r + 0.3576 * g + 0.1805 * b) * 100.0;
    float y = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 100.0;
    float z = (0.0193 * r + 0.1192 * g + 0.9505 * b) * 100.0;
    
    return vec3(x, y, z);
}

// XYZ to RGB
vec3 xyzToRgb(vec3 xyz) {
    xyz /= 100.0;
    
    float r = 3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z;
    float g = -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z;
    float b = 0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z;
    
    return vec3(
        linearToSrgb(r),
        linearToSrgb(g),
        linearToSrgb(b)
    );
}

// XYZ to LAB (normalized to 0-1 for curve editor)
vec3 rgb2lab(vec3 rgb) {
    vec3 xyz = rgbToXyz(rgb);
    
    float xr = xyz.x / (D65X * RANGE_X);
    float yr = xyz.y / (D65Y * RANGE_Y);
    float zr = xyz.z / (D65Z * RANGE_Z);
    
    float fx = (xr > CIEEpsilon) ? pow(xr, one_third) : (CIEK * xr + 16.0) * one_116;
    float fy = (yr > CIEEpsilon) ? pow(yr, one_third) : (CIEK * yr + 16.0) * one_116;
    float fz = (zr > CIEEpsilon) ? pow(zr, one_third) : (CIEK * zr + 16.0) * one_116;
    
    float L = 116.0 * fy - 16.0;
    float a = 500.0 * (fx - fy);
    float b = 200.0 * (fy - fz);
    
    // Normalize to 0-1 range for curve editor
    return vec3(
        L * 0.01,              // L: 0-100 -> 0-1
        (a + 128.0) / 256.0,   // a: -128-128 -> 0-1
        (b + 128.0) / 256.0    // b: -128-128 -> 0-1
    );
}

// LAB to XYZ to RGB
vec3 lab2rgb(vec3 lab) {
    // Convert from normalized ranges back to LAB ranges
    float L = lab.x * 100.0;                  // 0-1 -> 0-100
    float a = lab.y * 256.0 - 128.0;         // 0-1 -> -128-128
    float b = lab.z * 256.0 - 128.0;         // 0-1 -> -128-128
    
    float fy = (L + 16.0) * one_116;
    float fx = a * 0.002 + fy;
    float fz = fy - b * 0.005;
    
    float x = ((fx * fx * fx) > CIEEpsilon) ? (fx * fx * fx) : (116.0 * fx - 16.0) / CIEK;
    float y = (L > (CIEK * CIEEpsilon)) ? pow((L + 16.0) * one_116, 3.0) : L / CIEK;
    float z = ((fz * fz * fz) > CIEEpsilon) ? (fz * fz * fz) : (116.0 * fz - 16.0) / CIEK;
    
    x *= D65X * RANGE_X;
    y *= D65Y * RANGE_Y;
    z *= D65Z * RANGE_Z;
    
    return clamp(xyzToRgb(vec3(x, y, z)), 0.0, 1.0);
}

vec3 rgb2ycbcr(vec3 color) {
    return mat3(
        0.298839, 0.586811, 0.11435,
        -0.168736, -0.331264, 0.5,
        0.5, -0.418688, -0.081312
    ) * color + vec3(0.0, 0.5, 0.5);
}

vec3 ycbcr2rgb(vec3 ycbcr) {
    ycbcr -= vec3(0.0, 0.5, 0.5);
    return mat3(
        1.0, 0.0, 1.402,
        1.0, -0.344136, -0.714136,
        1.0, 1.772, 0.0
    ) * ycbcr;
}

// RGB to OHTA
vec3 rgb2ohta(vec3 color) {
    float I1 = 0.33333 * color.r + 0.33334 * color.g + 0.33333 * color.b;
    float I2 = 0.5 * (color.r - color.b);
    float I3 = -0.25 * color.r + 0.5 * color.g - 0.25 * color.b;
    
    // Map I2 and I3 from [-0.5, 0.5] to [0, 1] range for curve editor
    I2 = I2 + 0.5;
    I3 = I3 + 0.5;
    
    return vec3(I1, I2, I3);
}

// OHTA to RGB
vec3 ohta2rgb(vec3 ohta) {
    // Map I2 and I3 back from [0, 1] to [-0.5, 0.5] range
    float I1 = ohta.r;
    float I2 = ohta.g - 0.5;
    float I3 = ohta.b - 0.5;
    
    float r = I1 + 1.0 * I2 - 0.66668 * I3;
    float g = I1 + 1.33333 * I3;
    float b = I1 - 1.0 * I2 - 0.66668 * I3;
    
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// RGB to CMY
vec3 rgb2cmy(vec3 color) {
    return vec3(1.0) - color;
}

// CMY to RGB
vec3 cmy2rgb(vec3 cmy) {
    return vec3(1.0) - cmy;
}

// RGB to HSB/HSV
vec3 rgb2hsb(vec3 color) {
    float minVal = min(min(color.r, color.g), color.b);
    float maxVal = max(max(color.r, color.g), color.b);
    float delta = maxVal - minVal;
    
    float h = 0.0;
    float s = (maxVal != 0.0) ? delta / maxVal : 0.0;
    float b = maxVal;
    
    if (delta != 0.0) {
        if (maxVal == color.r) {
            h = (color.g - color.b) / delta;
            if (h < 0.0) h += 6.0;
        } else if (maxVal == color.g) {
            h = 2.0 + (color.b - color.r) / delta;
        } else {
            h = 4.0 + (color.r - color.g) / delta;
        }
        h /= 6.0;
    }
    
    return vec3(h, s, b);
}

// HSB/HSV to RGB
vec3 hsb2rgb(vec3 hsb) {
    float h = hsb.x * 6.0;
    float s = hsb.y;
    float v = hsb.z;
    
    if (s == 0.0) {
        return vec3(v);
    }
    
    float i = floor(h);
    float f = h - i;
    float p = v * (1.0 - s);
    float q = v * (1.0 - s * f);
    float t = v * (1.0 - s * (1.0 - f));
    
    if (i == 0.0) return vec3(v, t, p);
    else if (i == 1.0) return vec3(q, v, p);
    else if (i == 2.0) return vec3(p, v, t);
    else if (i == 3.0) return vec3(p, q, v);
    else if (i == 4.0) return vec3(t, p, v);
    else return vec3(v, p, q);
}

// RGB to XYZ (normalized to 0-1 for curve editor)
vec3 rgb2xyz(vec3 color) {
    // No conversion here, we work directly on sRGB for the curve
    return color;
}

// XYZ to RGB
vec3 xyz2rgb(vec3 color) {
    // The curve was applied on sRGB, so now we do the colorspace conversion
    return xyzToRgb(rgbToXyz(color));
}

// RGB to YXY (Yxy)
vec3 rgb2yxy(vec3 color) {
    // No conversion here, we work directly on sRGB for the curve
    return color;
}

// YXY (Yxy) to RGB
vec3 yxy2rgb(vec3 yxy) {
    // The curve was applied on sRGB, so now we do the colorspace conversion
    // YXY is not a direct conversion, so we just do XYZ as a stand-in
    return xyzToRgb(rgbToXyz(yxy));
}

// HCL (Hue, Chroma, Luminance)
vec3 rgb2hcl(vec3 color) {
    float r = color.r;
    float g = color.g;
    float b = color.b;
    
    float maxVal = max(max(r, g), b);
    float minVal = min(min(r, g), b);
    float chr = maxVal - minVal;
    
    float h = 0.0;
    if (chr != 0.0) {
        if (r == maxVal) {
            h = ((g - b) / chr + 6.0);
            h = mod(h, 6.0);
        } else if (g == maxVal) {
            h = (b - r) / chr + 2.0;
        } else { // b == maxVal
            h = (r - g) / chr + 4.0;
        }
    }
    
    // Luminance (using YCbCr/Rec.709 coefficients)
    float l = 0.298839 * r + 0.586811 * g + 0.114350 * b;
    
    // Normalize to 0-1 range
    return vec3(h / 6.0, chr, l);
}

vec3 hcl2rgb(vec3 hcl) {
    float h = hcl.x * 6.0;
    float chr = hcl.y;
    float l = hcl.z;
    
    float x = chr * (1.0 - abs(mod(h, 2.0) - 1.0));
    
    float r = 0.0;
    float g = 0.0;
    float b = 0.0;
    
    if (h >= 0.0 && h < 1.0) {
        r = chr;
        g = x;
    } else if (h >= 1.0 && h < 2.0) {
        r = x;
        g = chr;
    } else if (h >= 2.0 && h < 3.0) {
        g = chr;
        b = x;
    } else if (h >= 3.0 && h < 4.0) {
        g = x;
        b = chr;
    } else if (h >= 4.0 && h < 5.0) {
        r = x;
        b = chr;
    } else {
        r = chr;
        b = x;
    }
    
    // Adjust for luminance
    float m = l - (0.298839 * r + 0.586811 * g + 0.114350 * b);
    
    return clamp(vec3(r + m, g + m, b + m), 0.0, 1.0);
}

// RGB to LUV
vec3 rgb2luv(vec3 color) {
    vec3 xyz = rgbToXyz(color);
    xyz /= 100.0;
    
    float d = xyz.y;
    float L;
    
    if (d > CIEEpsilon) {
        L = 116.0 * pow(d, one_third) - 16.0;
    } else {
        L = CIEK * d;
    }

    float u, v;
    float denom = xyz.x + 15.0 * xyz.y + 3.0 * xyz.z;
    if (denom > mepsilon) {
        float u_prime = 4.0 * xyz.x / denom;
        float v_prime = 9.0 * xyz.y / denom;
        u = 13.0 * L * (u_prime - D65FX_4);
        v = 13.0 * L * (v_prime - D65FY_9);
    } else {
        u = 0.0;
        v = 0.0;
    }
    
    // Normalize to 0-1 range for curve editor
    L /= 100.0;
    u = (u + 134.0) / (134.0 + 220.0);
    v = (v + 140.0) / (140.0 + 122.0);
    
    return vec3(L, u, v);
}

// LUV to RGB
vec3 luv2rgb(vec3 luv) {
    // Convert from normalized ranges back to LUV ranges
    float L = luv.x * 100.0;
    float u = luv.y * (134.0 + 220.0) - 134.0;
    float v = luv.z * (140.0 + 122.0) - 140.0;
    
    // LUV to XYZ
    float Y, X, Z;
    
    if (L > CIEK2epsilon) {
        Y = pow((L + 16.0) * one_116, 3.0);
    } else {
        Y = L / CIEK;
    }
    
    if (abs(L) < mepsilon) {
        X = 0.0;
        Z = 0.0;
    } else {
        float u_prime = u / (13.0 * L) + D65FX_4;
        float v_prime = v / (13.0 * L) + D65FY_9;
        
        if (abs(v_prime) < mepsilon) {
            X = 0.0;
            Z = 0.0;
        } else {
            X = Y * 9.0 * u_prime / (4.0 * v_prime);
            Z = Y * (12.0 - 3.0 * u_prime - 20.0 * v_prime) / (4.0 * v_prime);
        }
    }
    
    // Scale back
    return xyzToRgb(vec3(X * 100.0, Y * 100.0, Z * 100.0));
}

// RGB to HWB (Hue, Whiteness, Blackness)
vec3 rgb2hwb(vec3 color) {
    // First get the hue using HSB calculation
    vec3 hsb = rgb2hsb(color);
    
    // Whiteness is minimum RGB value
    float w = min(min(color.r, color.g), color.b);
    
    // Blackness is 1 - maximum RGB value
    float b = 1.0 - max(max(color.r, color.g), color.b);
    
    return vec3(hsb.x, w, b);
}

// HWB to RGB
vec3 hwb2rgb(vec3 hwb) {
    float h = hwb.x;
    float w = hwb.y;
    float b = hwb.z;
    
    // Check if we need to make an achromatic color (gray)
    if (w + b >= 1.0) {
        // Calculate gray value - normalize w relative to the sum
        float gray = w / (w + b);
        return vec3(gray);
    }
    
    // Convert hue to RGB
    // First get RGB from hue (using HSB with S=1, B=1)
    vec3 rgb = hsb2rgb(vec3(h, 1.0, 1.0));
    
    // Mix in whiteness and blackness
    rgb = rgb * (1.0 - w - b) + vec3(w);
    
    return clamp(rgb, 0.0, 1.0);
}

// RGB to R-GGB-G
vec3 rgb2rggbg(vec3 color) {
    float g = color.g;
    
    // Calculate R-G and B-G and normalize from [-1, 1] to [0, 1]
    float r_g = (color.r - g + 1.0) * 0.5;
    float b_g = (color.b - g + 1.0) * 0.5;
    
    return vec3(r_g, g, b_g);
}

// R-GGB-G to RGB
vec3 rggbg2rgb(vec3 rggbg) {
    float g = rggbg.g;
    
    // De-normalize from [0, 1] back to [-1, 1]
    float r_g = rggbg.r * 2.0 - 1.0;
    float b_g = rggbg.b * 2.0 - 1.0;
    
    // Restore R and B
    float r = r_g + g;
    float b = b_g + g;
    
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// RGB to YPbPr
vec3 rgb2ypbpr(vec3 color) {
    // Using Rec. 709 constants
    float y = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    float pb = (color.b - y) / 1.8556; // Scales to -0.5 to +0.5
    float pr = (color.r - y) / 1.5748; // Scales to -0.5 to +0.5
    
    // Normalize to 0-1 range for curve editor
    return vec3(y, pb + 0.5, pr + 0.5);
}

// YPbPr to RGB
vec3 ypbpr2rgb(vec3 ypbpr) {
    float y = ypbpr.x;
    
    // Convert from normalized [0, 1] to [-0.5, 0.5]
    float pb = ypbpr.y - 0.5;
    float pr = ypbpr.z - 0.5;
    
    // Convert back to RGB
    float r = y + 1.5748 * pr;
    float b = y + 1.8556 * pb;
    float g = (y - 0.2126 * r - 0.0722 * b) / 0.7152;
    
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// YDbDr colorspace
vec3 rgb2ydbdr(vec3 color) {
    // Convert to Y, Db, Dr
    float y = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    float db = 0.5 + (-0.450 * color.r - 0.883 * color.g + 1.333 * color.b) / 2.666;
    float dr = 0.5 + (-1.333 * color.r + 1.116 * color.g + 0.217 * color.b) / 2.666;
    
    return vec3(y, db, dr);
}

vec3 ydbdr2rgb(vec3 ydbdr) {
    float y = ydbdr.r;
    float db = (ydbdr.g - 0.5) * 2.666;
    float dr = (ydbdr.b - 0.5) * 2.666;
    
    float r = y + 9.2303716147657e-05 * db - 0.52591263066186533 * dr;
    float g = y - 0.12913289889050927 * db + 0.26789932820759876 * dr;
    float b = y + 0.66467905997895482 * db - 7.9202543533108e-05 * dr;
    
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// Greyscale
vec3 rgb2gs(vec3 color) {
    float l = getLuma(color);
    return vec3(l, l, l);
}

vec3 gs2rgb(vec3 gs) {
    // Keep the same - greyscale is the same in both directions
    return gs;
}

// YUV colorspace
vec3 rgb2yuv(vec3 color) {
    float y = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    float u = (-0.14713 * color.r - 0.28886 * color.g + 0.436 * color.b) / (2.0 * Umax) + 0.5;
    float v = (0.615 * color.r - 0.51499 * color.g - 0.10001 * color.b) / (2.0 * Vmax) + 0.5;
    
    return vec3(y, u, v);
}

vec3 yuv2rgb(vec3 yuv) {
    float y = yuv.r;
    float u = (yuv.g - 0.5) * 2.0 * Umax;
    float v = (yuv.b - 0.5) * 2.0 * Vmax;
    
    float r = y + 1.13983 * v;
    float g = y - 0.39465 * u - 0.58060 * v;
    float b = y + 2.03211 * u;
    
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// RGBA passthrough
vec4 rgb2rgba(vec4 color) {
    return color;
}

vec4 rgba2rgb(vec4 color) {
    return color;
}

// CMYK colorspace
vec4 rgb2cmyk(vec3 color) {
    float k = 1.0 - max(max(color.r, color.g), color.b);
    if (k == 1.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    float c = (1.0 - color.r - k) / (1.0 - k);
    float m = (1.0 - color.g - k) / (1.0 - k);
    float y = (1.0 - color.b - k) / (1.0 - k);
    return vec4(c, m, y, k);
}

vec3 cmyk2rgb(vec4 color) {
    float r = (1.0 - color.r) * (1.0 - color.a); // c, k
    float g = (1.0 - color.g) * (1.0 - color.a); // m, k
    float b = (1.0 - color.b) * (1.0 - color.a); // y, k
    return vec3(r, g, b);
}

vec4 toColorspace(vec4 color, int cs) {
    if (cs == 1) return vec4(rgb2lab(color.rgb), color.a);
    if (cs == 2) return vec4(rgb2ycbcr(color.rgb), color.a);
    if (cs == 3) return vec4(rgb2ohta(color.rgb), color.a);
    if (cs == 4) return vec4(rgb2cmy(color.rgb), color.a);
    if (cs == 5) return vec4(rgb2hsb(color.rgb), color.a);
    if (cs == 6) return vec4(rgb2xyz(color.rgb), color.a);
    if (cs == 7) return vec4(rgb2yxy(color.rgb), color.a);
    if (cs == 8) return vec4(rgb2hcl(color.rgb), color.a);
    if (cs == 9) return vec4(rgb2luv(color.rgb), color.a);
    if (cs == 10) return vec4(rgb2hwb(color.rgb), color.a);
    if (cs == 11) return vec4(rgb2rggbg(color.rgb), color.a);
    if (cs == 12) return vec4(rgb2ypbpr(color.rgb), color.a);
    if (cs == 13) return vec4(rgb2ydbdr(color.rgb), color.a);
    if (cs == 14) return vec4(rgb2gs(color.rgb), color.a);
    if (cs == 15) return vec4(rgb2yuv(color.rgb), color.a);
    if (cs == 16) return rgb2rgba(color);
    if (cs == 17) return rgb2cmyk(color.rgb);
    return color;
}

vec4 fromColorspace(vec4 color, int cs) {
    if (cs == 1) return vec4(lab2rgb(color.rgb), color.a);
    if (cs == 2) return vec4(ycbcr2rgb(color.rgb), color.a);
    if (cs == 3) return vec4(ohta2rgb(color.rgb), color.a);
    if (cs == 4) return vec4(cmy2rgb(color.rgb), color.a);
    if (cs == 5) return vec4(hsb2rgb(color.rgb), color.a);
    if (cs == 6) return vec4(xyz2rgb(color.rgb), color.a);
    if (cs == 7) return vec4(yxy2rgb(color.rgb), color.a);
    if (cs == 8) return vec4(hcl2rgb(color.rgb), color.a);
    if (cs == 9) return vec4(luv2rgb(color.rgb), color.a);
    if (cs == 10) return vec4(hwb2rgb(color.rgb), color.a);
    if (cs == 11) return vec4(rggbg2rgb(color.rgb), color.a);
    if (cs == 12) return vec4(ypbpr2rgb(color.rgb), color.a);
    if (cs == 13) return vec4(ydbdr2rgb(color.rgb), color.a);
    if (cs == 14) return vec4(gs2rgb(color.rgb), color.a);
    if (cs == 15) return vec4(yuv2rgb(color.rgb), color.a);
    if (cs == 16) return rgba2rgb(color);
    if (cs == 17) return vec4(cmyk2rgb(color), 1.0);
    return color;
}

void main() {
    vec4 srcPixel = IMG_THIS_PIXEL(inputImage);
    
    vec4 working = toColorspace(srcPixel, int(colorspace));
    
    vec4 graded;
    graded.r = IMG_NORM_PIXEL(curvesData, vec2(working.r, 0.5)).r;
    graded.g = IMG_NORM_PIXEL(curvesData, vec2(working.g, 0.5)).g;
    graded.b = IMG_NORM_PIXEL(curvesData, vec2(working.b, 0.5)).b;
    
    // Only grade alpha if the colorspace supports it
    if (colorspace == 16) { // RGBA
      graded.a = IMG_NORM_PIXEL(curvesData, vec2(working.a, 0.5)).a;
    } else if (colorspace == 17) { // CMYK
      graded.a = IMG_NORM_PIXEL(curvesData, vec2(working.a, 0.5)).a; // grade K
    }
    else {
      graded.a = srcPixel.a;
    }
    
    vec4 result = fromColorspace(graded, int(colorspace));
    
    gl_FragColor = result;
}