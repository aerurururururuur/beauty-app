# Windows 环境搭建教程（全程终端版 · 小白适用）

> 目的：全程不碰浏览器下载、不双击安装包，**只用命令行**把这台 Windows 电脑配好并跑起「场合美妆镜」项目。
> 原理：Windows 10/11 自带一个叫 **winget** 的"应用商店式"包管理器，所有软件一条命令就能装好。
> 全程照抄命令即可，看不懂的选项别管。

## 先说结论：你真正要装的只有 1 个东西

这项目看着有前端（Vue）、后端（TypeScript），但**前后端都跑在同一个软件上 —— Node.js**。
没有数据库、没有 Docker、没有 Python，统统不用装。

| 软件 | 用途 | 必须吗 |
| --- | --- | --- |
| **Node.js** | 唯一核心。运行项目全靠它 | ✅ 必须 |
| VS Code（编辑器） | 看代码更方便 | ⭐ 强烈建议 |
| Git | 从 GitHub 拉代码 / 提交代码 | 🔧 可选 |

---

## 第 1 步：打开一个命令行窗口（PowerShell）

1. 按键盘 `Win` 键，输入 `powershell`，回车 —— 弹出一个蓝底黑字窗口就是它。
2. 后面所有命令都在这个窗口里输入，**每行输完按一次回车**。

> 小技巧：本教程的代码块可以整段复制，到窗口里右键一下就是"粘贴"。

## 第 2 步：确认 winget 能用（Windows 自带，一般都能用）

输入：

```powershell
winget --version
```

能看到类似 `v1.2xxxx` 的数字就 OK。如果提示"找不到 winget / 不是内部或外部命令"，跳到文末 **【FAQ 1】**。

## 第 3 步：一条命令装一个软件（全在这）

把下面三行**依次**输入（Node 是必须的；VS Code 强烈建议；Git 可选，不想要 Git 可以跳过那一行）：

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
winget install --id Microsoft.VisualStudioCode -e --accept-source-agreements --accept-package-agreements
winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
```

- 中途 Windows 可能弹一个蓝色 **UAC 窗口**问你"是否允许此应用更改设备" → 点 **“是”**。
- 显示 `已成功安装 / Successfully installed` 就说明装好了。
- Node.js LTS 版本号是 22 或更高（当前为 24），本项目要求 ≥ 22，满足。

## 第 4 步：重开命令行窗口（关键！）

装完后**把这个 PowerShell 窗口关掉，重新开一个**（第 1 步那样再开一次），
否则系统认不出刚装的软件。新窗口里输入验证：

```powershell
node -v
npm -v
git --version
```

看到类似下面结果就成功了（数字 22/10 或更大都行，`git` 那行输了 Git 才要验证）：

```
v24.19.0
10.9.4
git version 2.55.0
```

**如果出问题：**

- 提示 `node 不是内部或外部命令` → 一定是**没重开窗口**，重开一次再输。
- `git` 那行报错但你不需要 Git → 忽略即可。

## 第 5 步：把项目代码拉下来

```powershell
git clone https://github.com/aerurururururuur/beauty-app.git
cd beauty-app
```

> 想放在别的盘就先进那个目录再 clone，例如先 `cd D:\`。
> 没装 Git 的：把上面 URL 在浏览器打开 → 绿色 **Code → Download ZIP** → 解压后 `cd` 进解压出的文件夹。

## 第 6 步：启动项目（顺便验证装对了）

### 6.1 启动后端（首次会先下载依赖）

```powershell
cd server
npm install
npm run dev
```

- `npm install` 首次会下载一堆小文件，**耐心等它跑完**（国内慢看文末【FAQ 3】）。
- `npm run dev` 会**一直运行不退出**，看到类似 `Server listening at http://127.0.0.1:3000` 就对。**这个窗口别关。**

### 6.2 再开一个窗口启动前端

1. 重新开一个 PowerShell（第 1 步操作）并进入项目目录：
   ```powershell
   cd D:\beauty-app
   cd vue
   npm install
   npm run dev
   ```
   > 你 clone 到了别的路径就把 `D:\beauty-app` 换成实际路径；可以输入 `cd be` 后按 `Tab` 键自动补全。
2. 看到 `Local: http://localhost:5173/` 后，浏览器打开 **http://localhost:5173**，能看到页面就大功告成 🎉

**如果出问题：**

- 端口被占用（提示 `address already in use` / `EADDRINUSE`）→ 前端按提示按 `y` 换端口；后端可改用 `npx tsx watch src/index.ts --port 3001`。
- 杀毒软件/防火墙弹窗询问 → 选**允许**。

---

## 小贴士：国内网络加速（可选）

`npm install` 下载很慢或反复失败时，把 npm 换成国内镜像，一次设置永久生效：

```powershell
npm config set registry https://registry.npmmirror.com
```

想改回官方源：`npm config set registry https://registry.npmjs.org`。

---

## FAQ

**【1】提示找不到 winget**
较老或精简版系统没带。开「开始菜单 → 搜 Microsoft Store → 搜 "App Installer" → 安装」，装好重开 PowerShell 再试第 2 步。实在不行就用浏览器手动安装（官网 https://nodejs.org/zh-cn/download 点绿色 LTS → 双击 `.msi` → 一路下一步），装完记得重开窗口。

**【2】版本号小于 22**
说明电脑上装过旧版 Node。到「设置 → 应用」卸载旧版后，重新 `winget install --id OpenJS.NodeJS.LTS -e`。

**【3】`npm install` 很慢/卡住**
按上面"小贴士"设置镜像后重跑。

**【4】忘了刚才装到哪 / 想检查装没装**
随时可在 PowerShell 输入：`node -v` 有版本号就是装好了；想卸载用 `winget uninstall --id OpenJS.NodeJS.LTS`。

---

## 一键核对清单

| 检查项 | 命令 | 期望结果 |
| --- | --- | --- |
| winget 可用 | `winget --version` | `v1.2xxx` |
| Node.js 装好 | `node -v` | `v22.x` 或更高 |
| npm 装好 | `npm -v` | `10.x` 或更高 |
| Git 装好（可选） | `git --version` | `git version 2.x` |
| 后端启动 | 后端窗口日志 | `Server listening … :3000` |
| 前端启动 | 浏览器开 http://localhost:5173 | 出现项目页面 |
