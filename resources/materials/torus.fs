/*{
  "DESCRIPTION": "A spinning, lit 3D torus (ray marched)",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "3D"
  ],
  "INPUTS": [
    {
      "NAME": "color1",
      "LABEL": "Color",
      "TYPE": "color",
      "DEFAULT": [
        0.2,
        0.9,
        0.7,
        1
      ]
    },
    {
      "NAME": "color2",
      "LABEL": "Background",
      "TYPE": "color",
      "DEFAULT": [
        0,
        0,
        0,
        1
      ]
    },
    {
      "NAME": "thickness",
      "LABEL": "Thickness",
      "TYPE": "float",
      "DEFAULT": 0.35,
      "MIN": 0.1,
      "MAX": 0.8
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 4.0
    }
  ]
}*/
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float scene(vec3 p) {
  p.xz *= rot(TIME * speed * 0.7);
  p.xy *= rot(TIME * speed * 0.4);
  vec2 q = vec2(length(p.xz) - 1.0, p.y);
  return length(q) - thickness;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
  vec3 ro = vec3(0.0, 0.0, -3.5);
  vec3 rd = normalize(vec3(p, 1.4));
  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 80; i++) {
    float d = scene(ro + rd * t);
    if (d < 0.001) {
      hit = 1.0;
      break;
    }
    t += d;
    if (t > 8.0) break;
  }
  if (hit < 0.5) {
    gl_FragColor = color2;
    return;
  }
  vec3 pos = ro + rd * t;
  vec2 e = vec2(0.001, 0.0);
  vec3 n = normalize(vec3(
    scene(pos + e.xyy) - scene(pos - e.xyy),
    scene(pos + e.yxy) - scene(pos - e.yxy),
    scene(pos + e.yyx) - scene(pos - e.yyx)));
  vec3 light = normalize(vec3(0.6, 0.8, -0.6));
  float diffuse = max(dot(n, light), 0.0);
  float spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 24.0);
  vec3 c = color1.rgb * (0.12 + 0.88 * diffuse) + vec3(spec * 0.7);
  gl_FragColor = vec4(c, 1.0);
}
