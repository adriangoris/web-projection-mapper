/*{
  "DESCRIPTION": "Two colors blending across the surface, slowly shifting",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Gradient"
  ],
  "INPUTS": [
    {
      "NAME": "color1",
      "LABEL": "Color A",
      "TYPE": "color",
      "DEFAULT": [
        0.55,
        0.85,
        0.9,
        1
      ]
    },
    {
      "NAME": "color2",
      "LABEL": "Color B",
      "TYPE": "color",
      "DEFAULT": [
        0.05,
        0.05,
        0.08,
        1
      ]
    },
    {
      "NAME": "angle",
      "LABEL": "Angle",
      "TYPE": "float",
      "DEFAULT": 0.0,
      "MIN": 0.0,
      "MAX": 360.0
    },
    {
      "NAME": "repeat",
      "LABEL": "Repeat",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.5,
      "MAX": 8.0
    },
    {
      "NAME": "speed",
      "LABEL": "Speed",
      "TYPE": "float",
      "DEFAULT": 0.2,
      "MIN": 0.0,
      "MAX": 2.0
    }
  ]
}*/
void main() {
  float a = radians(angle);
  vec2 uv = isf_FragNormCoord - 0.5;
  float t = dot(uv, vec2(cos(a), sin(a))) + 0.5;
  float w = 0.5 + 0.5 * sin((t * repeat - TIME * speed) * 6.28318);
  gl_FragColor = mix(color2, color1, w);
}
