/*{
  "DESCRIPTION": "Flying down an endless 3D tunnel",
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
      "NAME": "segments",
      "LABEL": "Segments",
      "TYPE": "float",
      "DEFAULT": 8.0,
      "MIN": 2.0,
      "MAX": 32.0
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
      "NAME": "twist",
      "LABEL": "Twist",
      "TYPE": "float",
      "DEFAULT": 0.3,
      "MIN": -2.0,
      "MAX": 2.0
    }
  ]
}*/
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
  float r = length(p) + 0.0001;
  float a = atan(p.y, p.x) / 6.28318;
  float z = 0.3 / r + TIME * speed;
  float u = a * segments + z * twist;
  float grid = step(0.5, fract(u)) == step(0.5, fract(z * 2.0)) ? 1.0 : 0.0;
  float fog = smoothstep(0.0, 0.6, r);
  gl_FragColor = mix(color2, color1, grid * fog);
}
