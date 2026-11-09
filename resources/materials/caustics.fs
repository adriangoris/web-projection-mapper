/*{
  "DESCRIPTION": "Light rippling like the bottom of a pool",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Noise"
  ],
  "INPUTS": [
    {
      "NAME": "color1",
      "LABEL": "Color",
      "TYPE": "color",
      "DEFAULT": [
        0.75,
        0.95,
        1,
        1
      ]
    },
    {
      "NAME": "color2",
      "LABEL": "Background",
      "TYPE": "color",
      "DEFAULT": [
        0,
        0.12,
        0.2,
        1
      ]
    },
    {
      "NAME": "scale",
      "LABEL": "Scale",
      "TYPE": "float",
      "DEFAULT": 1.5,
      "MIN": 0.3,
      "MAX": 6.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.0,
      "MAX": 2.0
    }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  vec2 q = mod(uv * 6.28318 * scale, 6.28318) - 250.0;
  vec2 i = q;
  float c = 1.0;
  float t = TIME * speed * 0.5 + 23.0;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / 0.005), q.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  float v = clamp(pow(abs(c), 8.0), 0.0, 1.0);
  gl_FragColor = mix(color2, color1, v);
}
