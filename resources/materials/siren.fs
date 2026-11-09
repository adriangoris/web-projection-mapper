/*{
  "DESCRIPTION": "A rotating light beam",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Light"
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
      "NAME": "width",
      "LABEL": "Beam width",
      "TYPE": "float",
      "DEFAULT": 0.6,
      "MIN": 0.05,
      "MAX": 3.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 6.0
    },
    {
      "NAME": "center",
      "LABEL": "Center",
      "TYPE": "point2D",
      "DEFAULT": [
        0.5,
        0.5
      ],
      "MIN": [
        0,
        0
      ],
      "MAX": [
        1,
        1
      ]
    }
  ]
}*/
void main() {
  vec2 d = (isf_FragNormCoord - center) * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0);
  float a = atan(d.y, d.x) - TIME * speed * 3.0;
  float beam = fract(a / 6.28318);
  float v = smoothstep(width / 6.28318, 0.0, beam) * smoothstep(1.2, 0.0, length(d));
  gl_FragColor = mix(color2, color1, v);
}
