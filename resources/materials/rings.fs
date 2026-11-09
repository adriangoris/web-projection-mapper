/*{
  "DESCRIPTION": "Concentric rings pulsing out from a point",
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
      "NAME": "rings",
      "LABEL": "Rings",
      "TYPE": "float",
      "DEFAULT": 10.0,
      "MIN": 1.0,
      "MAX": 60.0
    },
    {
      "NAME": "thickness",
      "LABEL": "Thickness",
      "TYPE": "float",
      "DEFAULT": 0.5,
      "MIN": 0.05,
      "MAX": 0.95
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 5.0
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
  float v = step(fract(length(d) * rings - TIME * speed), thickness);
  gl_FragColor = mix(color2, color1, v);
}
