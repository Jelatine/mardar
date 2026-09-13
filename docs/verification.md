# v1.1.0 验证记录

- macOS ARM64：生产构建及 8 项真实 Electron 测试通过，覆盖 Markdown 读写、内嵌 HTML 样式清理、即时编辑保存、最近文件、About、系统打开与未保存保护。
- PDF：使用系统 PDFKit 渲染两页示例，检查中文、公式、图表、代码和表格。
- Windows：配置 NSIS 多尺寸 ICO 与 md/markdown 文件关联；交互式安装及资源管理器右键仍需 Windows 实机验证。

以下为 v1.0.0 历史验证记录：

验证日期：2026-09-13。当前主机：macOS ARM64。

## 已验证

| 需求 | 证据 |
| --- | --- |
| Electron + 前端桌面应用 | Vite 生产构建成功；macOS `.app` 实际启动并通过整包集成测试 |
| Markdown 读写 | 原生文件对话框接口选择临时文件，读取、编辑并保存后检查磁盘内容 |
| HTML 读写 | 打开 HTML、编辑、另存，检查源文件内容；脚本与事件处理器未执行 |
| 图片 | 相对路径 SVG 实际加载，工具栏插入的内嵌 SVG 加载并随文件保存 |
| 数学公式 | Markdown 与 HTML 公式渲染；断言上标几何位置，并检查实际截图和 PDF |
| 图表 | Markdown 与 HTML Mermaid 渲染；检查 SVG 标签文字；错误语法后可以恢复 |
| 代码块 | 代码高亮 DOM 与实际 PDF 显示检查 |
| PDF 导出 | Electron `printToPDF` 生成真实 PDF；解析并逐页渲染两页示例，检查中文、公式、图表、代码和表格 |
| 编辑保护 | 未保存提示、取消保存保留修改、切换文档取消、重载恢复草稿 |
| 依赖 | 固定版本与 package-lock；npm 审计为 0 漏洞 |
| 分发构建 | macOS ARM64 ZIP / app、Windows x64 NSIS、Linux x64 AppImage 均构建成功 |
| 分发内容一致 | 三个平台 app.asar 中 main、preload 与前端入口内容哈希一致 |

macOS 整包测试：**6 passed**。入口：`node scripts/test-packaged.mjs`。

Linux x64 应用包测试：**6 passed (22.7s)**。在 Debian 12 Docker 容器、Xvfb 和 Rosetta x64 模拟环境中运行，测试期间关闭容器网络。验证了包内的 `release/linux-unpacked/mardar`，包括文件读写、图片、公式、图表与 PDF。Linux 截图及导出 PDF 另行检查。

## GitHub Actions

[CI 运行 34728859976](https://github.com/Jelatine/mardar/actions/runs/34728859976)（2026-09-13，提交 1de3ee4）：

| 平台 | 结果 |
| --- | --- |
| windows-latest | NSIS x64 构建；包内应用 **6 passed** |
| macos-latest | ARM64 DMG/ZIP 构建；包内应用 **6 passed** |
| ubuntu-latest | x64 AppImage 构建；包内应用 **6 passed**，AppImage 启动器 **6 passed** |

## 待验证

- Windows：安装程序的交互式安装流程未自动化测试（CI 测试的是解包后的应用）。

## 分发文件

- `release/Mardar-1.0.0-mac-arm64.zip`
- `release/Mardar Setup 1.0.0.exe`
- `release/Mardar-1.0.0.AppImage`
- `release/SHA256SUMS.txt`

当前分发未配置发布签名/公证。Windows 在 macOS 上交叉构建时禁用了可执行文件资源编辑；正式发布可在 Windows CI 上使用默认 `npm run dist` 构建。
