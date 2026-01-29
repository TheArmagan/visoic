/*{
    "DESCRIPTION": "Generates a test card pattern with grid, bars, shapes, grid lines, and a white outer border.",
    "CREDIT": "Harmony",
    "ISFVSN": "2.0",
    "CATEGORIES": [
        "Generator",
        "Test Pattern"
    ],
    "INPUTS": []
}*/

// ... existing helper functions (circle, line, rect, hsv2rgb) ...
float circle(vec2 uv, vec2 center, float radius, float line_width, float aa, float aspect) {
    vec2 scaled_uv = vec2((uv.x - center.x) * aspect, uv.y - center.y);
    float dist = length(scaled_uv); 
    return smoothstep(radius - line_width/2.0 - aa, radius - line_width/2.0 + aa, dist) -
           smoothstep(radius + line_width/2.0 - aa, radius + line_width/2.0 + aa, dist);
}

float line(vec2 uv, vec2 p1, vec2 p2, float width, float aa, float aspect) {
    vec2 scaled_uv = vec2((uv.x - p1.x) * aspect, uv.y - p1.y);
    vec2 scaled_p2 = vec2((p2.x - p1.x) * aspect, p2.y - p1.y);
    vec2 scaled_p1 = vec2(0.0); 

    vec2 dir = normalize(scaled_p2 - scaled_p1);
    vec2 normal = vec2(-dir.y, dir.x);
    
    float dist = abs(dot(scaled_uv - scaled_p1, normal));
    
    float proj = dot(scaled_uv - scaled_p1, dir);
    float len = length(scaled_p2 - scaled_p1);
    if (proj < 0.0 || proj > len) return 0.0; 
    
    return smoothstep(width/2.0 + aa, width/2.0 - aa, dist);
}

float rect(vec2 uv, vec2 bottom_left, vec2 top_right, float aa) {
    vec2 bl = smoothstep(bottom_left - aa, bottom_left + aa, uv);
    vec2 tr = smoothstep(top_right + aa, top_right - aa, uv);
    return bl.x * bl.y * tr.x * tr.y;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


void main() {
    vec2 uv = vv_FragNormCoord; 
    // uv.y = 1.0 - uv.y; // Flip Y if needed

    float aa = 1.5 / RENDERSIZE.y; 
    float aspect = RENDERSIZE.x / RENDERSIZE.y; 
    vec3 final_color = vec3(0.5); // Default background color

    // --- Dynamic Grid Setup ---
    // ... (grid setup remains the same) ...
    float target_scale_x = 20.0; 
    float grid_size_x = max(1.0, round(target_scale_x)); 
    float target_ratio_yx = 1.0 / aspect; 
    float grid_size_y = max(1.0, round(grid_size_x * target_ratio_yx)); 
    vec2 cell_size = vec2(1.0 / grid_size_x, 1.0 / grid_size_y);
    vec2 grid_dimensions = vec2(grid_size_x, grid_size_y);


    // --- Define Bar Positions/Sizes relative to calculated Grid ---
    // ... (bar definitions remain the same) ...
    float bar_cols = 2.0; 
    float bar_start_col = 2.0; 
    float bar_start_row = 1.0; 
    float bar_rows = max(0.0, grid_size_y - 2.0); 
    float gradient_bar_cols = 2.0; 
    float gradient_bar_start_col = max(0.0, grid_size_x - 2.0 - gradient_bar_cols); 
    float gradient_bar_rows = bar_rows; 
    float gradient_bar_start_row = bar_start_row; 


    // --- Dynamic Radius Calculation ---
    // ... (radius calculation remains the same) ...
    vec2 center_uv = vec2(0.5);
    float target_cells_outer_x = 4.0; 
    float target_cells_inner_x = 3.0; 
    float center_grid_line_norm_x = round(center_uv.x / cell_size.x) * cell_size.x;
    float center_grid_line_norm_y = round(center_uv.y / cell_size.y) * cell_size.y;
    vec2 uv_outer_target = vec2(center_grid_line_norm_x + target_cells_outer_x * cell_size.x, center_grid_line_norm_y);
    vec2 uv_inner_target = vec2(center_grid_line_norm_x + target_cells_inner_x * cell_size.x, center_grid_line_norm_y);
    vec2 scaled_outer_target_dist = vec2((uv_outer_target.x - center_uv.x) * aspect, uv_outer_target.y - center_uv.y);
    float radius_outer = length(scaled_outer_target_dist);
    vec2 scaled_inner_target_dist = vec2((uv_inner_target.x - center_uv.x) * aspect, uv_inner_target.y - center_uv.y);
    float radius_inner = length(scaled_inner_target_dist);


    // --- Drawing Logic ---
    
    // Calculate grid index based on uv and cell_size
    // ... (grid index calculation remains the same) ...
    vec2 grid_index = floor(uv / cell_size); 
    grid_index.x = clamp(grid_index.x, 0.0, grid_size_x - 1.0);
    grid_index.y = clamp(grid_index.y, 0.0, grid_size_y - 1.0);


    // 1. Grid Pattern Color (Fills entire space)
    // ... (grid drawing remains the same) ...
    float grid_pattern = mod(grid_index.x + grid_index.y, 2.0);
    vec3 grid_col = mix(vec3(0.4), vec3(0.6), grid_pattern);
    final_color = grid_col; 


    // 2. Draw Left Color Bar (Check Grid Index) - Overwrites grid color
    // ... (color bar drawing remains the same) ...
    if (grid_index.x >= bar_start_col && grid_index.x < bar_start_col + bar_cols &&
        grid_index.y >= bar_start_row && grid_index.y < bar_start_row + bar_rows) {
        
        float bar_norm_y_start = bar_start_row * cell_size.y; 
        float bar_norm_y_end = (bar_start_row + bar_rows) * cell_size.y;
        float bar_height_norm = max(1e-6, bar_norm_y_end - bar_norm_y_start); 
        float hue_t = clamp((uv.y - bar_norm_y_start) / bar_height_norm, 0.0, 1.0);
        vec3 bar_color = hsv2rgb(vec3(1.0 - hue_t, 1.0, 1.0)); 
        final_color = bar_color; 
    }


    // 3. Draw Right Gradient Bar (Check Grid Index) - Overwrites grid/bar color
    // ... (gradient bar drawing remains the same) ...
    if (grid_index.x >= gradient_bar_start_col && grid_index.x < gradient_bar_start_col + gradient_bar_cols &&
        grid_index.y >= gradient_bar_start_row && grid_index.y < gradient_bar_start_row + gradient_bar_rows) {
        
        float gradient_bar_norm_y_start = gradient_bar_start_row * cell_size.y;
        float gradient_bar_norm_y_end = (gradient_bar_start_row + gradient_bar_rows) * cell_size.y;
        float gradient_bar_height_norm = max(1e-6, gradient_bar_norm_y_end - gradient_bar_norm_y_start);
        float grad_t = clamp((uv.y - gradient_bar_norm_y_start) / gradient_bar_height_norm, 0.0, 1.0); 
        vec3 grad_color = mix(vec3(1.0), vec3(0.0), grad_t); 
        final_color = grad_color; 
    }


    // 4. Draw Black Grid Lines (On top of grid pattern and bars)
    // ... (grid line drawing remains the same, using thickness_multiplier) ...
    vec2 scaled_uv_for_lines = uv * grid_dimensions; 
    vec2 d_grid = fwidth(scaled_uv_for_lines); 
    float thickness_multiplier = 3.0; // Use the same multiplier as border
    vec2 grid_line_detect = smoothstep(vec2(0.0), d_grid * thickness_multiplier, fract(scaled_uv_for_lines)) - smoothstep(vec2(1.0) - d_grid * thickness_multiplier, vec2(1.0), fract(scaled_uv_for_lines));
    final_color = mix(vec3(0.0), final_color, grid_line_detect.x * grid_line_detect.y); 


    // 5. Center Markings (Overlay on top of previous layers)
    // ... (center markings drawing remains the same) ...
    float line_width = 0.003; 
    float outer_circle_mask = circle(uv, center_uv, radius_outer, line_width, aa, aspect);
    float inner_circle_mask = circle(uv, center_uv, radius_inner, line_width, aa, aspect); 
    
    float diag1_mask = line(uv, vec2(0.0, 0.0), vec2(1.0, 1.0), line_width, aa, aspect);
    float diag2_mask = line(uv, vec2(0.0, 1.0), vec2(1.0, 0.0), line_width, aa, aspect);
    float cross_x_mask = line(uv, vec2(0.0, 0.5), vec2(1.0, 0.5), line_width * 0.6, aa, 1.0); 
    float cross_y_mask = line(uv, vec2(0.5, 0.0), vec2(0.5, 1.0), line_width * 0.6, aa, 1.0); 

    float circle_masks = max(outer_circle_mask, inner_circle_mask);
    float crosshair_masks = max(diag1_mask, diag2_mask);
    crosshair_masks = max(crosshair_masks, cross_x_mask);
    crosshair_masks = max(crosshair_masks, cross_y_mask);

    final_color = mix(final_color, vec3(1.0), crosshair_masks); 
    final_color = mix(final_color, vec3(1.0), circle_masks); 

    // 6. Draw White Outer Border (On top of everything)
    vec2 d_uv = fwidth(uv); // Get change in base UV across pixel
    // Use the same thickness multiplier as grid lines
    vec2 border_detect_comp = smoothstep(vec2(0.0), d_uv * thickness_multiplier, uv) - smoothstep(vec2(1.0) - d_uv * thickness_multiplier, vec2(1.0), uv);
    float border_detect = border_detect_comp.x * border_detect_comp.y; // Value is ~1 inside, ~0 on border
    final_color = mix(vec3(1.0), final_color, border_detect); // Mix white onto border


    // Output final color
    gl_FragColor = vec4(final_color, 1.0);
}