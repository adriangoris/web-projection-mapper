/*{
  "DESCRIPTION": "Classic colorful plasma",
  "CREDIT": "Projection Mapping Web",
  "ISFVSN": "2",
  "CATEGORIES": [
    "Color"
  ],
  "INPUTS": [
    {
      "NAME": "scale",
      "LABEL": "Scale",
      "TYPE": "float",
      "DEFAULT": 4.0,
      "MIN": 0.5,
      "MAX": 20.0
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
      "NAME": "saturation",
      "LABEL": "Saturation",
      "TYPE": "float",
      "DEFAULT": 1.0,
      "MIN": 0.0,
      "MAX": 1.0
    }
  ]
}*/
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
  p *= scale;
  float t = TIME * speed;
  float v = sin(p.x + t) + sin((p.y + t) * 0.5) + sin((p.x + p.y + t) * 0.5);
  v += sin(sqrt(p.x * p.x + p.y * p.y + 1.0) + t);
  vec3 c = 0.5 + 0.5 * cos(3.14159 * v + vec3(0.0, 2.094, 4.188));
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(mix(vec3(g), c, saturation), 1.0);
}
