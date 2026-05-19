# 稳如狗生图工作台V1.0

一个本地运行的图片生成软件，支持文生图和图生图。前端负责上传、参数和结果预览，后端固定转发到 `https://api.wenrugouai.cn/v1`。

## 运行

```bash
npm.cmd install
npm.cmd run dev
```

打开 Vite 输出的地址，通常是 `http://127.0.0.1:5173`。

## 配置

复制 `.env.example` 为 `.env`，然后填入你的中转站地址和密钥：

```bash
IMAGE_API_KEY=sk-your-key
```

中转站地址和模型名已写死，界面不能修改，后端也不会读取前端传入的 Base URL 或模型名。如果不想写 `.env`，也可以在界面里填写 API Key。图生图默认使用 `image[]` 字段上传参考图；如果你的中转站要求 `image`，在界面的“图生图字段”里切换即可。

## 接口

- 文生图：`POST /v1/images/generations`
- 图生图：`POST /v1/images/edits`
- 默认模型：`gpt-image-2`

## 打包 Windows 安装程序

```bash
npm.cmd run dist:win
```

打包完成后，把 `release/稳如狗生图工作台V1.0-Setup-0.1.0.exe` 发给客户安装即可。安装包不包含 `.env` 或 API Key，客户首次打开后在界面里填写自己的 Key。

## 打包 macOS 安装包

macOS 安装包需要在 Mac 上构建：

```bash
npm install
npm run dist:mac
```

完成后在 `release/` 目录里会得到 `.dmg` 和 `.zip`。项目已配置 `build/icon.icns`，macOS 应用图标会使用稳如狗图标。

如果项目放到 GitHub，也可以使用 `.github/workflows/build-mac.yml` 自动在 macOS runner 上打包并上传产物。
