# 协议弹窗（用户协议 / 隐私政策）实现说明

> 版本：v1.0　生效日期：2026年10月14日　最近更新：2026年10月14日
> 运营主体：凌田家校 · 家校共育系统　联系邮箱：3442471790@qq.com

---

## 一、文件组织

| 文件 | 职责 |
| --- | --- |
| `utils/agreement-content.js` | **协议正文数据层**。《用户协议》《隐私政策》全文以结构化数据存放，含版本号、生效日期、联系方式。改文案只改这里。 |
| `components/agreement-modal/index.{js,json,wxml,wxss}` | **协议弹窗组件**。负责长文滚动、标题层级渲染、底部「同意并继续 / 关闭」。不写业务判断。 |
| `pages/login/login.{js,wxml,wxss,json}` | 登录页接入：协议名可点击、弹窗查看全文、勾选同意后方可登录。 |
| `pages/mine/mine.{js,wxml,wxss}` | 「我的」页常驻入口：登录后可随时查阅全文（只读）。 |
| `app.json` | 全局注册 `agreement-modal`，避免逐页重复声明。 |

**分层原则**：数据（content）与交互（modal）分离，业务页（login / mine）只做「打开 / 接收结果」两件事。后续新增《儿童个人信息保护规则》等文档，只需在 `agreement-content.js` 加一个常量 + 在 `getDoc()` 里加一个分支。

---

## 二、合规设计取舍：**不做强制阅读**

这是本方案最关键的一条，明确记录以免后续被"优化"回去：

| 项 | 做法 |
| --- | --- |
| 阅读进度统计 | **无**。不监听滚动、不算百分比、不显示进度条 |
| 「同意并继续」按钮 | **始终可点**，不置灰、不弹「请先阅读完整内容」 |
| 登录拦截 | 只校验**是否勾选**，不校验**是否读完** |
| 点「关闭」/遮罩 | 只关弹窗，**不改同意态** |
| 全文可达性 | 登录页协议名可点开 + 「我的」页常驻入口，两处随时可查 |

**理由**：强制阅读门槛在小程序场景里体验代价高（协议 6000+ 字，每次登录都要滚到底），而实际合规要件是「**充分告知 + 主动勾选 + 可随时查阅**」，并不要求强制逐字阅读。这里三条都满足：协议入口明示可点、勾选框为独立主动动作、登录后仍可查阅。

> ⚠️ 若未来小程序审核或学校合规要求提出"须确认已阅读"，恢复门槛的成本很低：只需在组件里加回 `bindscroll` + `readDone` 判定，业务页加一个 `allRead` 校验分支即可，文案与布局无需改动。

---

## 三、组件 API

```html
<agreement-modal
  visible="{{agreementVisible}}"
  doc-type="{{agreementDoc}}"        <!-- user-agreement | privacy-policy -->
  bind:close="onCloseAgreement"
  bind:confirm="onAgreementConfirm"
/>
```

| 事件 | 触发时机 | detail |
| --- | --- | --- |
| `close` | 点「关闭」或点遮罩 | `{ reason: 'button' \| 'mask' }` |
| `confirm` | 点「同意并继续」 | `{ doc, title, version, agreedAt }` |

**只有 `confirm` 才代表同意**，`close` 不携带任何同意语义——这是业务页判断的唯一依据。

组件内部状态：`title / subtitle / version / effectiveDate / updatedDate / intro / sections / footer / scrollTop / statusBarHeight`。

`scroll-top="{{scrollTop}}"` 在每次打开或切换文档时归零，保证每次都从头看起，不会残留上次滚动位置。

---

## 四、正文数据结构

```js
{
  key: 'privacy-policy',
  title: '隐私政策',
  subtitle: '家校共育系统 · 凌田家校',
  meta: { version, effectiveDate, updatedDate },
  intro: '前言段落…',
  sections: [
    { id, title: '二、我们收集的个人信息类型与用途', blocks: [ … ] }
  ],
  footer: '版本 / 生效 / 更新日期'
}
```

`blocks` 支持 6 种类型，WXML 按 `b.type` 判别渲染：

| type | 字段 | 渲染效果 |
| --- | --- | --- |
| `p` | `text` | 正文段落，行高 1.9，两端对齐 |
| `h3` | `text` | 小节标题（`2.1` / `7.2` 这类），主色加粗 |
| `li` | `items[]` | 圆点列表 |
| `note` | `text, tone` | 提示块，`tone`为 `warn`（浅橙警示）或 `info`（浅蓝说明） |
| `kv` | `items[[k,v]]` | 键值信息表（联系方式） |
| `table` | `head[], rows[[]]` | 数据表（收集清单 / 第三方共享 / 存储期限） |

---

## 五、登录页交互流程

```
点击《用户协议》/《隐私政策》→ 弹窗打开（可滚动全文）
        ↓
   点「同意并继续」→ 弹窗关闭 + 自动勾选同意框
   点「关闭」/遮罩   → 仅关闭，勾选态不变，用户自行决定
        ↓
   勾选同意 → 点「登录」→ 落库同意记录（版本号 + 时间戳）→ 正常登录
```

**登录校验**（`onSubmit`）：账号非空 ≥3 位 → 密码非空 ≥6 位 → **`agreed` 为 true**（未勾选则报错提示）。**不再有任何与阅读进度相关的判断。**

**同意记录**：`agreementAccepted` = `{ version, at }`，登录成功时写入。用途是协议升版后能区分"新版本下已同意的用户"与"旧版本用户"，便于必要时追加告知。**不用于跳过勾选**——每次登录仍需用户主动勾选。

---

## 六、样式与响应式

- **全部走 `app.wxss` 设计令牌**（`var(--primary-*)` / `var(--fs-*)` / `var(--radius-*)` / `var(--shadow-*)`），零硬编码色值，与全局设计体系一致。
- **弹窗高度**：`height: 84vh; max-height: 1080rpx`，矮屏不溢出、高屏不拉伸；正文区 `flex: 1` 自适应，底部操作栏固定。
- **安全区**：遮罩层按 `statusBarHeight` 内缩；底部按钮 `padding-bottom: calc(22rpx + env(safe-area-inset-bottom))`。
- **表格响应式**：默认每列 25% 四列；`@media (max-width: 350px)` 降为 50% 两列；`max-width: 300px` 降为 100% 单列，避免 iPhone SE / 老安卓上文字被挤成一列。
- **长文可读性**：正文行高 1.9、`text-align: justify`，章节标题用色条 + 加粗建立清晰层级。
- **表格替代方案**：小程序无原生 `table`，用 flex 行模拟，`border` + 圆角裁切保持视觉完整。

---

## 七、法律口径要点（与实现的对应）

| 要点 | 落地位置 |
| --- | --- |
| 运营主体为品牌名而非公司 | 协议十章「联系方式」kv 表 + 隐私政策首部，表述为"凌田家校·家校共育系统（开发者及运营团队）" |
| 无微信/手机号授权 | 隐私政策二章明确"不收集微信昵称、头像、手机号、地理位置、通讯录、IMEI/MAC" |
| 学生端按未成年人处理 | 用户协议九章 + 隐私政策九章，含最小化收集、监护人同意、便捷注销三项特别措施 |
| AI 功能的数据流向 | 隐私政策六章列出智谱 AI（ASR/大模型）、DeepSeek 的传递范围，并警示"勿填身份证号等敏感信息" |
| 小程序无 Cookie | 隐私政策四章改述为"本地存储"，逐项列出 6 个 storage key 及是否随退出登录清除 |
| 权利行使通道 | 隐私政策八章：查阅/更正/删除/注销/撤回授权/要求解释 + 统一邮箱与反馈入口 |

---

## 八、验证清单

- [x] `npm run check:mp` → 0 错误
- [x] `node --check` 四个改动 JS 文件 → 全部通过
- [x] 全局检索无残留：`termsRead` / `privacyRead` / `allRead` / `readDone` / `readPercent` / `readThreshold` / `onScroll` 均已清除
- [x] 协议数据结构完整性：两份各 10 章、无空章节
- [x] 遮罩 / 「关闭」不产生同意，`confirm` 是唯一同意入口

**待真机验证**：滚动流畅度、低端机 `scroll-view` 性能、真实文案在窄屏表格中的换行效果。