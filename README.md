# AnGe-Draw

AnGe-Draw 是一款强大、轻量化的白板协作工具（基于 Excalidraw 二次开发），并集成了完全本地化的后端体系。

## ✨ 核心特性

- 🎨 **手绘风格白板**：完美保留了原版 Excalidraw 的极致绘图体验和渲染引擎。
- 🔐 **内置完整后端**：开箱即用的本地 Node.js 后端，自带 SQLite 数据库。
- 🛡️ **OIDC (单点登录) 接入**：通过后台可视化配置面板，支持一件接入外部可信身份源（如 Keycloak、Authentik），无需复杂的环境变量配置，实现企业级统一登录。
- 📚 **分组个人库**：支持官方素材库和个人素材库的无缝管理，并且自带拖拽分组功能，让您的绘图资产井井有条。
- 🚀 **极简的部署方式**：单 Docker 容器即可全量运行前端和后端代码，无痛部署。
- 👥 **实时协作**：支持端到端加密的白板多人实时协作。
- 🖍️ **高度定制化工具**：全面升级画笔工具，支持颜色、粗细、透明度全方位客制化。

---

## 🚀 极其简单的 Docker 部署

使用 Docker 可以在只需一条命令的情况下让整个应用跑起来。

### 1. 准备环境
由于我们需要将 SQLite 数据库挂载到宿主机以保证数据持久化，在启动之前先在服务器上创建一个空数据库文件：
```bash
mkdir server
touch server/excalidraw.db
```

### 2. 启动服务

**方案 A: 使用 Docker Compose (推荐)**
直接使用预构建好的镜像，无需本地编译。在当前目录运行：
```bash
docker-compose up -d
```

**方案 B: 使用原生 Docker Run**
```bash
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/server/excalidraw.db:/app/server/excalidraw.db \
  --name ange-draw \
  ghcr.io/liandu2024/ange-draw:latest
```

### 3. 开始使用
启动完毕后，浏览器打开 `http://localhost:8080` 或您对应的公网 IP 即可访问。

### 初始管理员账号
默认的本地管理员账号与密码如下：
- **用户名**: `admin`
- **密码**: `admin`

请在首次登录后务必及时修改密码！

---

## 📦 打包策略

`Dockerfile` 采用了 Multi-stage 构建方案，极大缩减了镜像体积，过程分为以下两步：
1. `yarn build:app:docker` 完成前端 React 产物的打包。
2. 将构建好的静态产物 `excalidraw-app/build` 移动到后端进程内。当 `NODE_ENV=production` 时，由后端的 Express 实例统一承载接口请求和页面静态路由分发。

