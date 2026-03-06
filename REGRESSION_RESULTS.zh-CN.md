# ShardKey 回归结果（当前轮）

日期：2026-03-06

## 已执行验证

### 1. JavaScript 语法检查

- `node --check js/app.js`：通过
- `node --check js/i18n.js`：通过
- `node --check js/worker.js`：通过

### 2. Worker 逻辑冒烟

执行方式：Node `vm` 直接加载 `js/worker.js`，用 Web Crypto 驱动真实生成/求解流程。

覆盖点：

- 生成 3 题、门限 2 的新 challenge
- 校验 challenge 中每题都包含 `xorTags`
- 使用恰好达到门限的正确答案恢复秘密
- 使用错误答案验证失败
- 使用不足门限的答案验证失败

结果：通过

关键结果：

- `generatedQuestions = 3`
- `successUsedCount = 2`
- `status = ok`

### 3. 本地 HTTP 静态服务检查

执行方式：

- 启动：`python3 -m http.server 8765`
- 访问：`http://127.0.0.1:8765/`

覆盖点：

- `index.html` 返回 `200 OK`
- `js/worker.js` 可通过静态服务访问
- 首页 HTML 中可见“离线问答解锁器”文案

结果：通过

## 目前仍未自动化覆盖的部分

以下项目仍需浏览器手工回归：

- `file://` 直接打开时的真实交互
- Solve 页 hash 删除/损坏后的可视状态变化
- “更换挑战”按钮的完整 UI 行为
- 语言切换后已填写答案是否保留
- 多备选答案在真实页面中的交互输入体验

## 结论

当前版本至少已经满足：

- 新 challenge 使用带 `xorTags` 的严格格式
- 求解路径不再依赖旧的组合爆炸回退逻辑
- 生成与求解已可在支持的浏览器中优先走 `Web Worker`
- 关键逻辑与静态资源链路在本地验证通过
