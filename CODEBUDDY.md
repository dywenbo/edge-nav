# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 常用命令

| 命令 | 说明 |
|---|---|
| `npm install` | 安装依赖（Vue 3 + Vite 5 + vue-tsc，无测试框架、无 ESLint）。 |
| `npm run dev` | 启动 Vite 开发服务器（端口 5273）做网页预览。此时没有 `chrome.*` API：存储自动回退到 localStorage，书签扫描走「不支持」分支。 |
| `npm run build` | 构建到 `dist/`，该目录就是「加载已解压的扩展程序」要选的目录。 |
| `npm run watch` | 增量构建，改代码后刷新 `edge://extensions` 里的扩展页即可看到效果。 |
| `npm run preview` | 以 5274 端口预览 `dist`（CDP 回归脚本默认连这个地址，勿改端口）。 |
| `npm run typecheck` | `vue-tsc --noEmit`，覆盖 `.ts` 与 `.vue`。提交前必跑，CI 也跑。 |
| `npm run icons` | 纯 Node 重新生成 `public/icons/*.png`（自带 PNG 编码器，无第三方依赖）。 |
| `npm run check:version` | 校验 `package.json` 与 `public/manifest.json` 版本号一致；打 tag 发布前必跑。 |
| `npm run check:budget` | 首屏体积预算：统计 `index.html` 直接引用的 JS/CSS gzip 体积，超过 70/12/85 KB 即失败。需先 `npm run build`，CI 也会跑。 |
| `node scripts/<name>.mjs` | CDP 回归脚本（feature-check / v6-check / snap-check / bm-check / layout-check / drag-check / v3-check）。需先 `npm run preview`，再用 `chrome --remote-debugging-port=9222` 打开 http://localhost:5274/ ；`cdp-shot.mjs`（默认会重新导航，保留现场要加 `--no-nav`）、`cdp-eval.mjs` 用于精确截图与在页面里求值。脚本里若清了 localStorage，记得先点掉首次引导的全屏遮罩，并设一次 `Emulation.setDeviceMetricsOverride`（默认 800 宽会进窄屏流式模式，拖拽被禁用）。 |

加载方式：`edge://extensions` → 开发人员模式 → 加载解压缩的扩展 → 选 `dist`。Chrome 137+ 已移除 `--load-extension`，无法命令行加载。

## 架构总览

**定位**：Manifest V3 的新标签页覆盖扩展（只有 `index.html` 一个页面，无 service worker、无后端）。`public/manifest.json` 通过 `chrome_url_overrides.newtab` 指向它，权限为 `storage / unlimitedStorage / favicon / bookmarks`，网络仅白名单 open-meteo（天气）与三个 jsDelivr 域名（节假日）。Vite 单入口，`base: './'`（扩展环境必须用相对路径），`@` 别名指向 `src`。

**分层**：`src/data`（常量与静态表）→ `src/utils`（无状态的 IO/算法，`snapshots.ts` 只管快照读写、`configTransfer.ts` 只管解析与合并）→ `src/store`（Vue `reactive` 单例；`snapshots.ts` 把快照 IO 包成带状态的 store）→ `src/composables`（组件级逻辑）→ `src/components`（`.vue`，纯展示 + 调 store）。没有 Pinia/Router，状态就是几个模块级 `reactive`/`ref` 单例，组件直接 import 使用。

### 单一配置源与持久化

`src/store/config.ts` 是全局唯一的可变状态：`config = reactive<AppConfig>(structuredClone(DEFAULT_CONFIG))`，形状见 `src/types.ts`（theme / wallpaper / search / weather / groups / bookmarks / todos / notes / calendar.overrides / focus / widgets）。

- 加载：`App.vue` 挂载时 `await loadConfig()`，读取 `chrome.storage.local` 的 `edge-nav:config` 后交给 `migrate()`，返回「存储里本来有没有配置」用于区分首装与老用户。**任何对 `DEFAULT_CONFIG` 的改动都改不动老用户，必须按 `version` 写迁移**，当前 `CONFIG_VERSION = 8`（`migrateWidgets` 负责 v1 栅格→像素、v2 clock/weather 合并成 overview；v6→v7 新增 `search.openInNewTab`、`todos[].url`、`focus` 状态；v7→v8 新增 `layout.snapToEdges / layout.autoCompact`，默认都开）。迁移抛错时把原始数据写到 `edge-nav:config-raw` 再回落默认值，绝不静默覆盖。
- 落盘：`watch(config, saveConfig, { deep: true })`，200ms 防抖写入，拖拽/输入都不会丢。
- 读写统一走 `src/utils/storage.ts`：有 `chrome.storage.local` 用它，否则回退 `localStorage`（这是 `npm run dev` 能独立调试 UI 的原因）。
- 其余业务动作（分组/链接/待办/笔记/日历标记/专注计时/组件增删/导入导出）都是 store 里导出的普通函数，组件不直接改存储。
- 快照：`utils/snapshots.ts` 环形保留 5 份（先比内容去重），`store/snapshots.ts` 提供列表、创建、恢复、删除。自动留快照的时机是「每天首次打开」「恢复默认前」「导入前」「恢复快照前」；单份超过 200KB 的壁纸不重复存，恢复时保留当前壁纸。
- 导入：`utils/configTransfer.ts` 解析文件并统计条目数，`importConfig(text, 'replace' | 'merge')` 决定覆盖还是合并；合并只补链接/待办/笔记/日历标记，布局、主题、壁纸、组件位置保留当前。

### 卡片画布与自适应（最需要跨文件理解的部分）

卡片型号只有 5 种：`overview | links | todo | calendar | notes`，由 `CanvasBoard.vue` 的 `componentMap` 映射到 OverviewCard / LinkGrid / TodoCard / CalendarCard / NotesCard，外层统一包 `WidgetFrame.vue`（提供边框、编辑态的拖拽提示、✕ 与右下角缩放手柄）。

坐标以「设计宽度 `CANVAS_W = 1120`」存储，全部 `snap()` 到 20 的整数倍（`src/data/layout.ts`：`GRID=20`、`GAP=20`、`MIN_W=200`、`MIN_H=120`、`FLOW_BREAKPOINT=720`）。渲染分两段，**互不干扰**：

1. 整体等比缩放 `scale = min(容器宽/1120, 1.05)`，作用在 `.board__stage` 的 `transform: scale()`，字号跟着变；纵向不压到一屏，交给页面滚动，避免卡片和文字被缩得很小。
2. 横向伸展 `stretch = 容器宽/(1120×scale)`（上限 1.5），只乘在卡片的 `left/width` 上（布局层拉伸），**不能用 `transform: scaleX()`**，否则字号被横向压扁。

换算后：`unitX = scale × stretch`、`unitY = scale`；拖拽位移要分别除以它们再 `snap()`。

- `store/ui.ts` 的 `canvasWidth` 由 `CanvasBoard` 用 `ResizeObserver` 观测**画布的父容器**后写入（量画布自身会形成「改宽度→改缩放→改宽度」的循环，缩放会永远停在 1）；`isFlow = canvasWidth < 720` 时切换成流式单列并禁用绝对定位与拖拽。
- 碰撞处理：`resolveCollisions()` 以被拖卡片为最高优先级，其余按 `y→x` 依次下移到「被占卡片底边 + GAP」；判定矩形外扩 `GAP/2` 保证挤开后间隙恰好 20px。resize 手柄必须 `stopPropagation`，否则会被卡片的 `pointerdown` 覆盖成 move。
- 磁吸与去留白都在 `src/utils/layoutSnap.ts`（纯函数，不依赖 Vue）：`snapToNeighbors()` 在网格吸附后，若 26px 内存在对齐候选（左/右边、上/下边、画布边界）就再贴一步，并返回需要画的参考线；**只吸边对齐，不要加「贴边 + GAP」候选**——被拖卡片推开的卡片会一直贴在它下方，用这些卡片反推贴边位置会让拖动卡死在原地。`compactWidgets(widgets, fixedId?)` 按 `y→x` 把卡片只上移到能放下的最高位置，传 `fixedId` 时刚拖完的那张不动。参考线画在 stage 里，横坐标要乘 `stretch`，纵坐标直接用设计值。
- 卡片内部的复合件：`TodoCard` 里嵌 `FocusBar.vue`（专注计时），概览卡的统计条里第 4 项是可点击的专注状态。**新增卡片类型要同时改 `WidgetType`、`componentMap`、`WIDGET_LABEL`、`WIDGET_SIZE`、`VALID_TYPES` 和迁移**，所以专注计时没有做成第 6 种卡片。

### 命令面板与全局键盘

`App.vue` 统一监听 `keydown`：`Ctrl/Cmd + K` 开关命令面板，`Esc` 按「面板 → 指引 → 设置 → 编辑态」的顺序逐层关闭。`CommandPalette.vue` 自己只处理 `↑ ↓ Enter`，且**必须先判断 `paletteOpen`**，否则会抢走页面里所有方向键和回车。面板数据直接读 `config` 与 `navLinksOfFolder()`，没有独立索引；输入非空时会多出一条「新建待办」动作。

设置抽屉与操作指引都是 `defineAsyncComponent(() => import(...))`，首次打开才加载对应 chunk（首屏体积预算因此能压住）；设置抽屉打开过一次后保持挂载，以保留关闭动画。

### 书签导航（只读镜像）

`src/utils/bookmarks.ts` 扫描 `chrome.bookmarks.getTree()`，只收录「含直属网址」的文件夹（避免父子重复），收藏夹栏根节点排最后。导航里的数据是**镜像**：隐藏只写 `config.bookmarks.hidden[folderId]`（存节点 id），**代码里从不调用 `bookmarks.remove`**；只在用户勾选「同时保存到浏览器书签」时才 `bookmarks.create` 写回。仅存在于导航的补充链接放 `config.bookmarks.extras`。

标签页 id 约定：本地分组用 `groupId`，书签文件夹用 `bookmarkTabKey(id)` = `bm:<节点 id>`（`isBookmarkTab` / `folderIdOfTab` 判断）。`store/bookmarks.ts` 负责扫描结果落盘、计算 `navLinksOfFolder()`（书签 − 已隐藏 + extras），首次发现书签文件夹时把 links 卡切到第一个非 bar 文件夹。

### 主题、天气、节假日

- 主题：全部颜色走 `src/style.css` 里的语义变量（`--surface`、`--control-bg`、`--border-card`、`--shade-rgb`、`--on-accent`…），浅/深两套都挂在 `[data-theme]` 下；组件里不写死颜色。`composables/useTheme.ts` 把结果写到 `<html data-theme>` 与 `style.colorScheme`，`theme: 'system'` 时监听 `matchMedia` 即时生效。
- 天气（`composables/useWeather.ts`）：open-meteo，20 分钟缓存键 `edge-nav:weather-cache`，离线时展示上次数据并提示。
- 节假日（`utils/holidaySync.ts`）：holiday-cn 数据，依次尝试 jsDelivr 三个域名，按年缓存 7 天（键 `edge-nav:holidays`），失败回落到 `src/data/holidays.ts` 内置 13 天。日历上的优先级：手动标记 `calendar.overrides` > 在线数据 > 内置表 > 周末推算。

### 版本与发布

`package.json` 与 `public/manifest.json` 的版本号必须同步（扩展商店按 manifest 判重），由 `scripts/check-version.mjs` 校验。CI（`.github/workflows/ci.yml`）跑 check-version → typecheck → build → check-budget；`release.yml` 在 push `v*` 标签时额外校验 dist 清单并打包 `edge-nav-vX.Y.Z.zip` 发布 Release。

## 实测坑点（改代码前先看）

`README.md` 第 10 节列了 15 条实测结论，高频相关的几条：`button` 不继承 `color`，卡片内自定义按钮必须显式声明颜色；`default_locale` 与 `_locales/` 必须成对；卡片头部 flex 行的右侧内容要设 `min-width: 0`；固定高度卡片 1px 溢出就会冒滚动条，需卡着测 `scrollHeight/clientHeight`；深色主题要同时调壁纸 `brightness` 与 `--surface`，否则层次倒过来；磁贴网格高度不是整数行时滚动会露出半个磁贴，需用 `mask-image` 渐隐并在滚到底时移除。

v0.6 之后新增的几条：命令面板的 window 监听必须先判 `paletteOpen`，否则页面里的 ↑↓/Enter 全被吞；专注计时**不能把剩余秒数写进 config**（每秒一次 deep watch 会不停落盘），只存 `endsAt`，秒级刷新放组件本地；快照要跳过超大的壁纸 base64，否则每份快照都带 1.5MB；回归脚本里 Dock 按钮没有文字，label 在 `data-label`，要用 `.dock__item--settings / --layout` 定位，别用 `textContent.includes`。

v0.7 补充：`pointerup` **不要再 `snap()` 一次**，否则刚磁吸到的对齐位置会被取整打散（移动过程中已按网格吸附）；自动去留白必须传 `fixedId` 排除刚拖的卡片，否则「把卡片往下拖」会被立刻拉回顶部；参考线只在吸附真的改变了位置时才返回，否则默认布局会满屏参考线；吸附/去留白都受 `config.layout` 开关控制。
