/*{
  "DESCRIPTION": "A brick wall pattern",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Pattern"
  ],
  "INPUTS": [
    {
      "NAME": "color1",
      "LABEL": "Color",
      "TYPE": "color",
      "DEFAULT": [
        1,
        1,
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
        0,
        0,
        1
      ]
    },
    {
      "NAME": "columns",
      "LABEL": "Bricks across",
      "TYPE": "float",
      "DEFAULT": 8.0,
      "MIN": 1.0,
      "MAX": 40.0
    },
    {
      "NAME": "mortar",
      "LABEL": "Mortar",
      "TYPE": "float",
      "DEFAULT": 0.08,
      "MIN": 0.0,
      "MAX": 0.4
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 2.0
    }
  ]
}*/
void main() {
  float aspect = RENDERSIZE.x / RENDERSIZE.y;
  vec2 uv = isf_FragNormCoord * vec2(columns, columns * 2.0 / aspect);
  uv.x += TIME * speed;
  if (mod(floor(uv.y), 2.0) == 1.0) uv.x += 0.5;
  vec2 g = fract(uv);
  vec2 m = vec2(mortar * 0.5, mortar);
  float brick = step(m.x, g.x) * step(g.x, 1.0 - m.x) * step(m.y, g.y) * step(g.y, 1.0 - m.y);
  gl_FragColor = mix(color2, color1, brick);
}
