export const formulaTemplates = [
  ['求和', String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`],
  ['分数', String.raw`\frac{a+b}{c+d}`],
  ['平方根', String.raw`\sqrt{a^2+b^2}`],
  ['定积分', String.raw`\int_a^b f(x)\,dx`],
  ['极限', String.raw`\lim_{x\to 0}\frac{\sin x}{x}=1`],
  ['矩阵', String.raw`\begin{pmatrix}a & b \\ c & d\end{pmatrix}`],
  ['分段函数', String.raw`f(x)=\begin{cases}x^2 & x\ge 0 \\ -x & x<0\end{cases}`],
  ['二次方程求根', String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`],
];
export const chartTemplates = [
  ['流程图', 'flowchart LR\n  A[开始] --> B{是否完成?}\n  B -->|是| C[结束]\n  B -->|否| A'],
  ['时序图', 'sequenceDiagram\n  participant U as 用户\n  participant S as 服务\n  U->>S: 请求\n  S-->>U: 响应'],
  ['类图', 'classDiagram\n  class Document {\n    +String title\n    +save()\n  }\n  Document <|-- Markdown'],
  ['状态图', 'stateDiagram-v2\n  [*] --> Draft\n  Draft --> Published: 发布\n  Published --> [*]'],
  ['甘特图', 'gantt\n  title 项目计划\n  dateFormat YYYY-MM-DD\n  section 开发\n  设计 :a1, 2026-01-01, 3d\n  实现 :after a1, 5d'],
  ['饼图', 'pie title 时间分配\n  "写作" : 50\n  "阅读" : 30\n  "整理" : 20'],
  ['实体关系图', 'erDiagram\n  USER ||--o{ DOCUMENT : creates\n  USER {\n    int id\n    string name\n  }\n  DOCUMENT {\n    int id\n    string title\n  }'],
  ['思维导图', 'mindmap\n  root((主题))\n    灵感\n      想法一\n      想法二\n    计划\n    总结'],
];
