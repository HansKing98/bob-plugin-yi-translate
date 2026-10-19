# 插件开发手册

本文适用于本仓库的 Yi Translate 插件。开发时修改 `src`，先在 Bob 中导入本地副本验证，确认完成后再发布。

## 目录与环境

需要 macOS、Bob、Node.js 18+ 和 Python 3。发布需要 Git、GitHub CLI 及仓库写权限。项目没有第三方构建依赖。

| 文件 | 职责 |
| --- | --- |
| `src/info.json` | 插件标识、版本、设置字段及更新地址 |
| `src/main.js` | Bob 入口、命令分发、模型查询及验证回调 |
| `src/api.js` | 地址归一化、Bearer 认证、HTTP 请求和错误处理 |
| `src/yichat.js` | 翻译、润色、Prompt 和对话请求 |
| `src/utils.js` | 语言映射、模式及清空/重置命令 |
| `src/file.js` | Bob 沙盒中的配置和对话历史读写 |
| `src/config.js` | 支持的语言列表 |
| `tests/plugin.test.js` | 模拟 Bob 环境的测试及本地 HTTP 联调 |
| `scripts/build.py` | 确定性打包及安装包结构校验 |
| `scripts/update_appcast.py` | 更新下载地址、版本和 SHA-256 |
| `appcast.json` | Bob 自动更新清单，新版本排在最前 |

`src-deepseek` 是历史独立插件，标识及更新地址不同，不参与当前打包。`src` 内遗留的 `.bobplugin` 文件不是源码，不应嵌入新安装包。

## 本地调试副本

在仓库根目录执行。先修改 `src/info.json` 的版本号，再创建 `src_副本<版本>.bobplugin` 目录。下面的命令只复制运行文件，已有副本不会被覆盖：

```sh
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const info = JSON.parse(fs.readFileSync('src/info.json', 'utf8'));
const target = `src_副本${info.version}.bobplugin`;
const files = ['api.js', 'config.js', 'file.js', 'icon.png', 'info.json', 'main.js', 'utils.js', 'yichat.js'];
if (fs.existsSync(target)) throw new Error(`副本已存在，请先核对内容或使用新版本号：${target}`);
fs.mkdirSync(target);
for (const name of files) fs.copyFileSync(path.join('src', name), path.join(target, name));
console.log(path.resolve(target));
NODE
```

1. 在 Finder 中双击生成的 `.bobplugin` 目录，按 Bob 提示安装或替换。
2. 在 Bob 插件列表中确认版本号，再进入翻译服务设置填写地址、密钥及模型。
3. 测试普通翻译、`#models` 和自定义模型。对话模式还应检查第二轮是否带上上下文。
4. 再次修改 `src` 后，需要重新生成副本并重新导入。导入是安装副本，不应假定修改源码会自动热更新。

这些目录已被 `.gitignore` 忽略。保留已有副本可用于对比，不要把用户配置或 API Key 写入源码、测试夹具或安装包。

## Bob 兼容约束

| 能力 | 版本与行为 |
| --- | --- |
| 翻译和模型查询命令 | 保留 Bob 0.5.0+ 基础接口；0.10.3 社区版已由用户验证翻译及模型查询 |
| 原生验证按钮 | Bob 1.6+ 识别 `pluginValidate`；调用 `/models` 检查连接，只显示成功或错误 |
| 明文/密文输入框配置 | Bob 1.8+ 支持 `textConfig`；社区版忽略此配置，所有文本框仍有“小眼睛” |
| 翻译完成回调 | 优先使用 `query.onCompletion`，旧版使用第二个参数 `completion` |

入口应保持普通函数，异步工作放到内部函数中。直接把入口声明成 `async function` 曾导致 Bob 0.10.3 显示“插件未实现核心功能”：

```js
function translate(query, completion) {
    return translateAsync(query, completion);
}

async function translateAsync(query, completion) {
    const done = query.onCompletion || completion;
    // 完成异步处理后，仅调用一次 done({ result }) 或 done({ error })。
}

exports.translate = translate;
```

`supportLanguages`、`translate` 和 `pluginValidate` 都应使用普通函数导出。当前测试检查了入口类型，但 Node.js 模拟测试不能替代真实 Bob 安装测试。

输入框只将 API Key 配置为 `textConfig: { "type": "secure" }`，其余文本框使用 `visible`。此配置作为新版可选增强，旧版仍可运行；不要为了显示效果改动用户的 Bob 应用文件。若新增运行时必须使用的新接口，应同时提高 `info.json` 和 appcast 的最低 Bob 版本。

## API 与模型查询

- 保持设置标识 `url`、`api_key`、`custom_model_name` 不变，避免升级丢失配置。界面名称可以调整。
- 非空 Base URL 优先使用；仅域名补 `/v1`，已有路径前缀保持不变；完整 `/chat/completions` 地址可转换到同级 `/models`。查询参数保留。
- API Key 去除首尾空白后以 `Authorization: Bearer ...` 发送。空值不发送认证头，适配无鉴权的本地服务。
- 自定义模型名优先于预设模型，不能误写到工作模式变量中。
- 每次 `#models`、`#模型`、`#模型列表` 或查询模式均实时发起 GET，不使用缓存。模型列表去重、排序后显示。
- 目前支持 OpenAI Chat Completions 协议；不能仅修改地址就调用 Anthropic、Gemini 等原生协议。
- Bob 的设置菜单是静态的，不支持通过接口动态更新下拉选项，也不能添加任意自定义按钮。完整模型列表通过翻译结果展示，用户将模型 ID 填入自定义模型名。
- `/models` 成功不代表每个模型都支持聊天。服务不支持该接口时，仍可手动指定模型进行翻译。

网络调用使用 Bob 的 `$http`。JavaScriptCore 不提供浏览器 `URL` 或 Node.js `fs` 等 API，运行代码不要依赖测试环境额外提供的能力。不要记录认证头、完整请求或原始传输错误。

## 测试与打包

```sh
node --test tests/plugin.test.js
git diff --check
python3 scripts/build.py '填写本版本的实际更新说明'
```

构建生成 `release/bob-plugin-yi-translate_v<版本>.bobplugin` 并更新本地 `appcast.json`，不会自动推送。包根目录直接包含 `info.json`、`main.js` 等运行文件，不得套一层 `src`。相同源码重复构建的包应完全一致。

发布前检查包内容和 SHA-256，例如 v1.1.2：

```sh
unzip -l release/bob-plugin-yi-translate_v1.1.2.bobplugin
shasum -a 256 release/bob-plugin-yi-translate_v1.1.2.bobplugin
```

确认源文件、导入副本和压缩包一致；版本、identifier、minBobVersion 与 appcast 一致；哈希必须等于 appcast 最新条目的 `sha256`。检查翻译、模型查询、空密钥的本地服务、无效密钥及不支持 `/models` 的错误路径。新增字段或运行接口时增加相应验证。

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 插件未实现核心功能 | 检查普通函数入口、exports、模块加载错误，以及实际安装版本 |
| 非 API Key 字段仍有小眼睛 | 检查 Bob 版本；0.10.3 社区版不支持 `textConfig`，插件无法移除 |
| 自定义模型没有生效 | 检查是否填写模型 ID，以及请求体的 `model` 是否来自 `custom_model_name` |
| `/models` 返回 404 | 检查路径前缀与供应商支持情况，可手动填写模型继续翻译 |
| API Key 错误或权限不足 | 检查当前地址与密钥是否属于同一服务，区分 401/403 与额度或限流的 429 |
| 修改模式后仍执行旧模式 | `#switch` 会保存覆盖值，输入 `#reset` 恢复面板模式，同时清空对话 |
| 修改源码后结果未变 | 核对副本是否更新、是否重新导入，及 Bob 显示的插件版本 |

本机社区版的插件文件位于 `~/Library/Application Support/com.ripperhe.Bob/VirtualSandbox/Documents/InstalledPlugin/`，日志位于同一 `VirtualSandbox` 下的 `Library/Caches/MMKit/MMLogs/Default/`。不同发行版路径可能不同，优先使用 Bob 的日志导出功能。查看日志时注意旧版日志可能包含正文或敏感信息，不要直接粘贴或上传整份日志。

## 发布流程

发布必须获得用户明确确认。用户反馈某一项测试成功，不等于批准推送或发布；本地开发和测试可继续进行。

1. 完成测试、真实 Bob 验证、构建及包哈希检查，更新 README 与 `RELEASE_NOTES.md`。从 appcast 中移除本轮未正式发布的测试版本条目。
2. 获取远端状态，检查差异，只提交本次源码、测试、文档和 appcast。不要提交调试目录、密钥或用户无关改动。
3. 确认授权后，为已验证的提交创建版本标签并推送标签。不要移动或覆盖已发布标签。
4. 创建对应 GitHub Release 并上传安装包。多行说明使用 `--notes-file RELEASE_NOTES.md`。
5. 确认安装包可下载且哈希正确，再推送 `main`，使源码和自动升级清单生效。只发布标签/Release 不会更新 main 上的 appcast。
6. 读取线上 appcast，下载其指向的安装包，重新校验版本和 SHA-256。确认 README 下载链接、Release 与标签匹配。

命令形式如下，版本号需使用本次实际版本，不要对已有 Release 重复执行：

```sh
git fetch origin
git tag -a vX.Y.Z -m 'Yi Translate vX.Y.Z'
git push origin refs/tags/vX.Y.Z
gh release create vX.Y.Z release/bob-plugin-yi-translate_vX.Y.Z.bobplugin \
  --verify-tag --title 'Yi Translate vX.Y.Z' --notes-file RELEASE_NOTES.md --latest
git push origin main
```

## 官方资料

- [配置 info.json](https://bobtranslate.com/plugin/quickstart/info.html)
- [文本翻译入口与验证](https://bobtranslate.com/plugin/quickstart/translate.html)
- [HTTP 接口](https://bobtranslate.com/plugin/api/http.html)
- [打包插件](https://bobtranslate.com/plugin/quickstart/pack.html)
- [发布与 appcast](https://bobtranslate.com/plugin/quickstart/publish.html)
