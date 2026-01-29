/*{
    "DESCRIPTION": "Simulate viewing through a crystal lens with customizable facet shapes and optional outer rings.",
    "CREDIT": "Harmony",
    "ISFVSN": "2.0",
    "CATEGORIES": [
        "Reflection", "Animated"
    ],
    "INPUTS": [
        {
            "NAME": "inputImage",
            "TYPE": "image"
        },
        {
            "NAME": "amount",
            "LABEL": "Inner Ring Offset Amount",
            "TYPE": "float",
            "DEFAULT": 0.6,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "count",
            "LABEL": "Number of Facets (per ring)",
            "TYPE": "float",
            "DEFAULT": 6.0,
            "MIN": 1.0,
            "MAX": 10.0
        },
        {
            "NAME": "angle",
            "LABEL": "Base Angle",
            "TYPE": "float",
            "DEFAULT": 0.5,
            "MIN": 0.0,
            "MAX": 6.28318
        },
        {
            "NAME": "speed",
            "LABEL": "Rotation Speed",
            "TYPE": "float",
            "DEFAULT": 0.0,
            "MIN": -1.0,
            "MAX": 1.0
        },
        {
            "NAME": "facetShape",
            "LABEL": "Facet Shape",
            "TYPE": "long",
            "VALUES": [0, 1, 2, 3, 4],
            "LABELS": ["Circle", "Square", "Triangle", "Diamond", "Hexagon"],
            "DEFAULT": 0
        },
        {
            "NAME": "facetSize",
            "LABEL": "Facet Size",
            "TYPE": "float",
            "DEFAULT": 0.75,
            "MIN": 0.01,
            "MAX": 1.0
        },
        {
            "NAME": "feather",
            "LABEL": "Feather Amount",
            "TYPE": "float",
            "DEFAULT": 0.35,
            "MIN": 0.01,
            "MAX": 0.99
        },
        {
            "NAME": "drawCenterFacet",
            "LABEL": "Draw Center Facet",
            "TYPE": "bool",
            "DEFAULT": true
        },
        {
            "NAME": "preserveOriginal",
            "LABEL": "Preserve Original",
            "TYPE": "bool",
            "DEFAULT": false
        },
        {
            "NAME": "correctAspectRatio",
            "LABEL": "Correct Aspect Ratio",
            "TYPE": "bool",
            "DEFAULT": true
        },
        {
            "NAME": "drawOuterRing",
            "LABEL": "Draw Outer Rings",
            "TYPE": "bool",
            "DEFAULT": true
        },
        {
            "NAME": "lensDistortion",
            "LABEL": "Lens Distortion",
            "TYPE": "float",
            "DEFAULT": 0.3,
            "MIN": 0.0,
            "MAX": 1.0
        },
        {
            "NAME": "chromaticAberration",
            "LABEL": "Chromatic Aberration",
            "TYPE": "float",
            "DEFAULT": 0.3,
            "MIN": 0.0,
            "MAX": 1.0
        }
    ]
}*/

#define PI 3.1415926535897932384626433832795
#define outerRingOffsetScale 1.85

vec4 blendLightest(vec4 base, vec4 blend) {
    // Simple component-wise max - relies on inputs being pre-masked
    return max(base, blend);
}

// --- Signed Distance Functions ---
float sdCircle(vec2 p, vec2 center, float size) {
    return distance(p, center) - size / 2.0;
}

float sdSquare(vec2 p, vec2 center, float size) {
    vec2 pc = abs(p - center);
    return max(pc.x, pc.y) - size / 2.0;
}

float sdTriangle(vec2 p, vec2 center, float D) {
    vec2 pc = p - center;
    float r = D / 2.0;
    pc.x -= r * 0.33; // Adjust to center visually
    const vec2 k1 = vec2(0.5, 0.866025404);
    const vec2 k2 = vec2(0.5, -0.866025404);
    const vec2 k3 = vec2(-1.0, 0.0);
    float d1 = dot(pc, normalize(vec2(-k1.y, k1.x)));
    float d2 = dot(pc, normalize(vec2(-k2.y, k2.x)));
    float d3 = dot(pc, normalize(vec2(-k3.y, k3.x)));
    return max(max(d1, d2), d3) - r;
}

float sdDiamond(vec2 p, vec2 center, float D) {
    vec2 pc = abs(p - center);
    return (pc.x + pc.y - D / 2.0) / sqrt(2.0);
}

float sdHexagon( vec2 p, vec2 center, float D ) {
    vec2 pc = p - center;
    float r = D / 2.0;
    const vec2 k = vec2(-0.866025404, 0.5);
    pc = abs(pc);
    pc -= 2.0*min(dot(k,pc), 0.0)*k;
    pc -= vec2(clamp(pc.x, -k.y*r, k.y*r), r);
    return length(pc)*sign(pc.y);
}

// --- Shape Selector with Aspect Correction ---
float sdShape(vec2 p, vec2 center, float size, int shapeType, bool doCorrect, float aspect) {
    vec2 p_corrected = p;
    if (doCorrect && aspect != 1.0) {
       p_corrected.x = (p.x - center.x) * aspect + center.x;
    }
    if (shapeType == 0) return sdCircle(p_corrected, center, size);
    if (shapeType == 1) return sdSquare(p_corrected, center, size);
    if (shapeType == 2) return sdTriangle(p_corrected, center, size);
    if (shapeType == 3) return sdDiamond(p_corrected, center, size);
    if (shapeType == 4) return sdHexagon(p_corrected, center, size);
    return sdCircle(p_corrected, center, size); // Fallback
}

// --- Shape Mask Generation ---
float shapeMask(vec2 uv, vec2 center, float size, float featherAmount, int shapeType, bool doCorrect, float aspect) {
    float dist = sdShape(uv, center, size, shapeType, doCorrect, aspect);
    float featherWidth = size * featherAmount * 0.5;
    featherWidth = max(0.001, featherWidth); // Ensure non-zero width
    return 1.0 - smoothstep(-featherWidth, featherWidth, dist);
}


// --- Main Color Calculation Logic ---
// This function calculates the blended facet color for a given coordinate.
vec4 calculateBlendedColor(vec2 coord, float currentAngle) { // Added currentAngle parameter
    vec4 originalColor = IMG_NORM_PIXEL(inputImage, coord);
    vec2 center = vec2(0.5, 0.5);

    // Initialize blendedColor based on whether we preserve the original
    vec4 blendedColor = preserveOriginal ? originalColor : vec4(0.0, 0.0, 0.0, 0.0);

    // Calculate aspect ratio from RENDERSIZE
    float aspect = 1.0;
    if (RENDERSIZE.y != 0.0) {
        aspect = RENDERSIZE.x / RENDERSIZE.y;
    }
    bool doCorrect = correctAspectRatio; // Use uniform directly

    float halfStepAngle = PI / count; // Angle offset for ring 2

    // Loop through each facet position
    for(float i = 0.0; i < count; i++) {
        // --- Inner Ring (Ring 1) ---
        float innerTheta = 2.0 * PI * i / count + currentAngle; // Use currentAngle
        float ring1Amount = amount;
        vec2 ring1_offset_vector = ring1Amount * vec2(cos(innerTheta), sin(innerTheta));
        vec2 ring1_final_offset = ring1_offset_vector;
        if (doCorrect && aspect != 1.0) {
            ring1_final_offset.x /= aspect;
        }
        vec2 ring1FacetCenter = center + ring1_final_offset;
        float ring1Mask = shapeMask(coord, ring1FacetCenter, facetSize, feather, facetShape, doCorrect, aspect);

        if (ring1Mask > 0.0) {
            vec2 ring1SampleCoord = coord - ring1_final_offset;
            vec4 ring1CurrentColor = IMG_NORM_PIXEL(inputImage, ring1SampleCoord);
            vec4 maskedRing1Color = ring1CurrentColor * ring1Mask;
            blendedColor = blendLightest(blendedColor, maskedRing1Color);
        }

        // --- Outer Rings (Rings 2 & 3 - Optional) ---
        if (drawOuterRing) {
            // --- Ring 2 (Offset Angle) ---
            float outerTheta = innerTheta + halfStepAngle;
            float ring2Amount = amount * outerRingOffsetScale;
            vec2 ring2_offset_vector = ring2Amount * vec2(cos(outerTheta), sin(outerTheta));
            vec2 ring2_final_offset = ring2_offset_vector;
            if (doCorrect && aspect != 1.0) {
                ring2_final_offset.x /= aspect;
            }
            vec2 ring2FacetCenter = center + ring2_final_offset;
            float ring2Mask = shapeMask(coord, ring2FacetCenter, facetSize, feather, facetShape, doCorrect, aspect);

            if (ring2Mask > 0.0) {
                vec2 ring2SampleCoord = coord - ring2_final_offset;
                vec4 ring2CurrentColor = IMG_NORM_PIXEL(inputImage, ring2SampleCoord);
                vec4 maskedRing2Color = ring2CurrentColor * ring2Mask;
                blendedColor = blendLightest(blendedColor, maskedRing2Color);
            }

            // --- Ring 3 (Same Angle as Ring 1, Further Out) ---
            float ring3Amount = amount * outerRingOffsetScale; // Use scale factor directly
            vec2 ring3_offset_vector = ring3Amount * vec2(cos(innerTheta), sin(innerTheta)); // Use innerTheta for alignment
            vec2 ring3_final_offset = ring3_offset_vector;
            if (doCorrect && aspect != 1.0) {
                ring3_final_offset.x /= aspect;
            }
            vec2 ring3FacetCenter = center + ring3_final_offset;
            float ring3Mask = shapeMask(coord, ring3FacetCenter, facetSize, feather, facetShape, doCorrect, aspect);

            if (ring3Mask > 0.0) {
                vec2 ring3SampleCoord = coord - ring3_final_offset;
                vec4 ring3CurrentColor = IMG_NORM_PIXEL(inputImage, ring3SampleCoord);
                vec4 maskedRing3Color = ring3CurrentColor * ring3Mask;
                blendedColor = blendLightest(blendedColor, maskedRing3Color);
            }
        }
    }

    // Optionally draw the center facet
    if (drawCenterFacet) {
        float centerMask = shapeMask(coord, center, facetSize, feather, facetShape, doCorrect, aspect);
        if (centerMask > 0.0) {
            vec4 centerColor = IMG_NORM_PIXEL(inputImage, coord); // Sample center
            vec4 maskedCenterColor = centerColor * centerMask;
            blendedColor = blendLightest(blendedColor, maskedCenterColor);
        }
    }

    return blendedColor;
}


void main() {
    vec2 uv = isf_FragNormCoord; // Original normalized coordinates
    vec2 center = vec2(0.5, 0.5);
    vec2 toCenter = uv - center;
    float dist = length(toCenter);
    float distSqr = dist * dist; // Use squared distance for distortion effect strength

    // Calculate the current angle based on time and speed
    float currentAngle = angle + TIME * speed;

    // Apply Lens Distortion to the coordinates we'll use for sampling
    // Map lensDistortion (0-1) to k (0 - 0.5, example range for visible effect)
    float k = lensDistortion * 0.5;
    // Calculate the base coordinate after lens distortion
    vec2 distorted_uv = center + toCenter * (1.0 + k * distSqr);

    // Apply Chromatic Aberration based on the distorted coordinates
    // Offset amount proportional to distance from center
    // Map chromaticAberration (0-1) to an offset scale (e.g., 0-0.03)
    float ca_offset_amount = chromaticAberration * 0.03 * dist;

    // Calculate normalized offset direction (radial from center)
    vec2 offset_dir = normalize(toCenter);
    if (dist < 0.0001) { // Avoid NaN at the exact center
       offset_dir = vec2(0.0);
    }

    // Calculate final sampling coordinates for R, G, B channels
    vec2 uv_r = distorted_uv + offset_dir * ca_offset_amount;
    vec2 uv_g = distorted_uv; // Green channel uses the base distorted uv
    vec2 uv_b = distorted_uv - offset_dir * ca_offset_amount;

    // Calculate final color by sampling R, G, B channels using the main logic
    // at their respective offset coordinates, passing the animated angle.
    float r = calculateBlendedColor(uv_r, currentAngle).r;
    float g = calculateBlendedColor(uv_g, currentAngle).g;
    float b = calculateBlendedColor(uv_b, currentAngle).b;
    // Use alpha from the central (green) sample for consistency
    float a = calculateBlendedColor(uv_g, currentAngle).a;

    vec4 finalColor = vec4(r, g, b, a);

    // Final Output Logic
    // If not preserving original and the result is effectively transparent black,
    // output opaque black instead.
     if (!preserveOriginal && finalColor.a < 0.001 && finalColor.r < 0.001 && finalColor.g < 0.001 && finalColor.b < 0.001 ) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); // Opaque black background
     } else {
        // Output the final calculated color
        gl_FragColor = finalColor;
     }
}