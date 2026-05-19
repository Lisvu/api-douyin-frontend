# 🎬 抖音短视频 - React 前端开发手册 (React Frontend Guide)

欢迎加入 **抖音短视频前后端分离平台** 联合开发团队！本项目前端基于 **React + Vite** 进行构建，具有极速的热更新 (HMR) 体验与优秀的构建性能。

---

## 📂 项目简介 & 目录分工

本项目是抖音短视频平台的 Web 客户端，实现了短视频的无限滑动播放、点赞互动、发布上传以及个人社交主页。核心目录分工如下：

```text
api-douyin-frontend/
├── public/                 # 静态资源目录 (如网站图标、不需要构建的静态媒体)
├── dist/                   # 生产环境打包输出目录 (Build 后生成)
│
├── src/                    # 前端核心源码目录
│   ├── main.jsx            # 整个前端应用的渲染入口 (挂载 React DOM)
│   ├── App.jsx             # 路由中心与主视图入口组件
│   ├── index.css           # 全局样式文件 (预设原子化与基础全局设计系统)
│   │
│   ├── components/         # 可复用公共 UI 组件 (如 VideoPlayer, NavigationBar, Button 等)
│   ├── pages/              # 页面视图组件 (如 Feed 推荐流, Profile 个人主页, Upload 发布页)
│   ├── services/           # API 网络请求封装 (基于 Axios，统一拦截器附加 JWT Bearer Token)
│   └── utils/              # 前端公共工具函数
│
├── index.html              # 应用的主 HTML 模板 (Vite 挂载入口)
├── vite.config.js          # Vite 构建与开发服务器代理配置文件
├── package.json            # 依赖包及运行脚本声明文件
└── eslint.config.js        # 代码风格与语法校验规则配置
```

---

## 🛠️ 技术栈清单

*   **核心框架**：React 18 / 19 (基于函数式组件与 Hooks 构建)
*   **构建工具**：Vite (基于 Esbuild，毫秒级启动与热更新)
*   **路由管理**：React Router DOM (单页面应用路由分发)
*   **网络通信**：Axios (支持请求与响应拦截器，自动装载 Token)
*   **基础样式**：Vanilla CSS / TailwindCSS (高质感精美 UI 设计)

---

## 🚦 常用开发命令

在开始开发前，请确保您的计算机上已安装了 Node.js 环境 (建议 Node.js 18+)。

### 1. 安装项目所有依赖
首次克隆或依赖包更新时执行：
```bash
npm install
```

### 2. 启动本地开发服务器
运行此命令将开启具有热更新支持的本地开发服务器：
```bash
npm run dev
```

### 3. 构建生产环境产物
编译并打包前端代码到 `dist/` 目录中，自动进行混淆、压缩与代码分割：
```bash
npm run build
```

### 4. 本地预览生产打包产物
在本地运行一个静态文件服务器，用于预览和测试生产环境包的性能：
```bash
npm run preview
```

---

## 🔗 默认访问地址

*   **本地开发预览地址**：Vite 启动后输出的地址，通常为 [http://localhost:5173](http://localhost:5173)
*   **开发跨域代理**：开发服务器已配置代理，本地请求 `/api/*` 将自动转发至后端的 [http://localhost:8080](http://localhost:8080)，无需担心跨域问题。
