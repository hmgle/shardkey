# ShardKey 修复清单（按优先级）

基于当前实现的代码 review，下面给出一份按优先级排序的修复清单。

目标不是一次性“大重写”，而是先解决最影响正确性、安全边界和用户体验的问题，再逐步做结构优化。

## P0：先修，影响正确性/安全定位

### 1. 明确安全模型与产品文案

**问题**

- 当前方案是 `Mignotte + CRT + offset-payload`，不是 Shamir Secret Sharing。
- 少于门限时并非“严格零泄露”，更准确的定位是“离线问答解锁器”，不是强密码学意义上的门限秘密共享。

**建议动作**

- 在 `README.md`、`README.zh-CN.md` 和 UI 文案中明确说明：
  - 该工具不提供完美保密；
  - 弱答案可被离线暴力猜解；
  - 不应替代经过审计的门限秘密共享方案。
- 在 challenge 元数据中保留或新增更明确的 `scheme` / `securityNote` 字段，便于未来版本兼容。

**完成标准**

- 用户首次看到工具时，能清楚知道它的安全边界。
- 文档、UI、导出格式中的描述一致。

### 2. 消除求解阶段的组合爆炸

**问题**

- 当前恢复逻辑会为每题生成多个候选余数，再枚举子集与组合。
- 题目数增大、门限升高或备选答案增多时，容易触发 `maxSubsetTries` / `maxComboTries` / `maxSolveMs`，导致“答案足够但仍解锁失败”。

**建议动作**

- 给每个问题增加“独立可验证的 share 校验标签”，使单题答案可以先验证，再进入 CRT 恢复。
- 目标是让每题最多只留下 0 或 1 个有效 share，避免组合搜索。
- 若短期内不改格式，至少：
  - 收紧每题备选答案数量；
  - 明确在 UI 中提示“大题量/多备选答案可能导致解锁失败”；
  - 将超时与搜索上限错误提示写得更清楚。

**推荐实现方向**

- 生成 challenge 时，为每题构造：
  - `encryptedShare` 或 `maskedShare`
  - `tag = Trunc(HMAC(derivedKey, share || questionId || modulus), n)`
- 解题时先派生 key，再校验 tag，通过后再取出该题 share。

**完成标准**

- 正确答案集合下，求解复杂度近似线性增长，而不是组合爆炸。
- 正确率不再依赖搜索预算。

### 3. 评估是否切换到 Shamir

**问题**

- 即使解决了组合爆炸，当前方案仍不是标准的完美保密门限共享。

**建议动作**

- 做一次单独设计评估：
  - 如果产品目标是“问答门槛解锁”，保留当前架构并强化 share 校验即可；
  - 如果产品目标是“密码学级门限共享”，应迁移到有限域上的 Shamir Secret Sharing。
- 如果决定迁移，建议作为 `version: 4` 新格式，不要硬改现有 `version: 3`。

**完成标准**

- 项目层面对“继续增强当前方案”还是“升级到 Shamir”有明确结论。

## P1：随后修，影响状态一致性和易用性

### 4. 修复 Solve 页状态机

**问题**

- 删除或损坏 URL hash 后，旧 challenge 不会回收。
- 成功加载 challenge 后，没有明显的“更换挑战/返回导入”入口。
- 文件导入、粘贴链接、URL hash 自动加载三条链路行为不一致。

**建议动作**

- 增加统一的 `resetSolveState()`：
  - 清空 `currentChallenge`
  - 清空 `lastSolveOutcome`
  - 清空题目输入区和结果区
  - 显示导入卡片，隐藏 solve 内容
- 增加统一的 `loadChallengeFromSource(challenge, source)` 入口。
- 定义三种来源的地址栏策略：
  - hash 自动加载：保持 URL 不变；
  - 粘贴链接加载：可同步 `history.replaceState()` 到当前 hash；
  - 文件导入：默认不改 URL，但要允许“复制当前 challenge 链接”。
- 在 Solve 页加一个“更换挑战”按钮。

**完成标准**

- URL、页面状态、当前 challenge 三者始终一致。
- 用户无需刷新页面即可切换 challenge。

### 5. 提升错误提示质量

**问题**

- 当前部分错误虽然能报出来，但对终端用户不够可操作。

**建议动作**

- 将求解失败区分为：
  - 答案数不足；
  - 验证失败；
  - 超时；
  - 搜索上限触发；
  - challenge 格式非法。
- 对“链接过长”“请改用 JSON”的提示进一步前置。
- 在 UI 上补一段“推荐用 JSON 分享大 challenge”的说明。

**完成标准**

- 用户遇到失败时，知道下一步应该怎么做。

## P2：中期优化，影响性能和可维护性

### 6. 把重计算迁移到 Web Worker

**问题**

- PBKDF2、素数生成、求解搜索都在主线程执行。
- 现在虽然有 `yieldToUI()`，但计算量大时仍会卡界面。

**建议动作**

- 将以下工作移入 `Web Worker`：
  - prime generation
  - moduli generation
  - answer key derivation / share verification
  - secret recovery
- 主线程只负责：
  - 收集输入
  - 展示进度
  - 渲染结果

**完成标准**

- 生成与求解期间 UI 可交互，输入与切 tab 不明显卡顿。

### 7. 优化 prime 生成和编码热点

**问题**

- `getSecureRandomBigInt()` 当前通过字节转 hex 再转 `BigInt`，有额外开销。
- `generatePrime()` 没有先做小素数筛。
- Base64Url 编解码用逐字节字符串拼接，存在不必要的临时对象。

**建议动作**

- 为 prime 候选增加小素数预筛。
- 优化 BigInt 构造路径，减少 hex 中间态。
- 封装更稳定的 Base64Url 编解码辅助函数，减少重复逻辑。

**完成标准**

- 在题量较大时，生成 challenge 的平均耗时可测量下降。

### 8. 收敛全局状态和模块边界

**问题**

- 当前 `js/app.js` 把 crypto、transport、create、solve、UI state 全放在一个文件中。
- `appQuestions`、`currentChallenge`、`lastGeneratedState`、`lastSolveOutcome` 等全局状态耦合偏高。

**建议动作**

- 按职责拆分逻辑块：
  - `state`
  - `crypto`
  - `challenge-transport`
  - `create-flow`
  - `solve-flow`
- 在没有构建系统的前提下，可继续使用多 `<script>` 文件组织，而不是引入框架。
- 先抽离纯函数，再抽离 UI 层。

**完成标准**

- 关键流程函数可以单独阅读和替换，减少跨模块隐式依赖。

## P3：低风险改进，提升体验与细节质量

### 9. 让答案归一化策略可配置

**问题**

- 当前统一使用 `NFKC + trim + collapse whitespace + lowercase`。
- 这提升了易用性，但会降低答案空间，也可能造成语义合并过度。

**建议动作**

- 增加 challenge 级别的匹配策略，例如：
  - `strict`
  - `case-insensitive`
  - `normalized`
- 默认继续用当前策略，但允许高级用户选择更严格模式。

**完成标准**

- 易用性与安全性之间可以按 challenge 场景权衡。

### 10. 完善可访问性与样式结构

**问题**

- tab 缺少 `role` / `aria-selected` 等语义。
- 一些样式以内联方式出现在 HTML/JS 模板中，不便维护。

**建议动作**

- 为 tab、结果区、错误区补充 ARIA 语义。
- 统一补上 `:focus-visible` 样式。
- 把内联样式迁移到 `css/style.css`。

**完成标准**

- 键盘可用性和样式一致性提升。

### 11. 补手工回归用例清单

**问题**

- 当前仓库没有自动化测试，变更后容易回归。

**建议动作**

- 在仓库中增加一份手工测试清单，至少覆盖：
  - 多题、多备选答案、不同门限
  - 正确答案刚好达到门限
  - 不足门限
  - 大 challenge 走 JSON 导入导出
  - `file://` 与 `http://localhost:8000`
  - 损坏链接 / 超长链接 / 非法 JSON

**完成标准**

- 每次改动后都有统一回归路径可执行。

## 推荐落地顺序

建议分 4 个阶段推进：

1. **阶段 1**：文案与安全边界澄清、Solve 状态机修复。
2. **阶段 2**：为每题增加独立校验标签，消除组合爆炸。
3. **阶段 3**：将重计算迁入 Web Worker，优化性能热点。
4. **阶段 4**：视产品目标决定是否升级到 Shamir，并同步 challenge 新版本格式。

## 最小可执行版本（如果只做一轮）

如果当前只打算做一轮迭代，最值得优先完成的是：

- 明确 README 和 UI 的安全边界；
- 修复 Solve 页状态机；
- 给每题加独立校验标签，去掉恢复阶段的组合搜索；
- 为大 challenge 默认推荐 JSON 分享。

这样可以在不彻底重构的前提下，显著提升正确性、可解释性和用户体验。
