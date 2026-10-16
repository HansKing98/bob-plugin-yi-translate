# Yi Translate for Bob

支持任意 **OpenAI Chat Completions 兼容服务**的 Bob 翻译插件，可自定义 Base URL、API Key 和模型。支持翻译、文字润色、对话、自定义 Prompt 和实时模型查询。

## 安装与升级

1. 安装 [Bob](https://bobtranslate.com/)，兼容 Bob 0.5.0+，包括 0.10.3 社区版。
2. 下载 [v1.1.0 安装包](https://github.com/HansKing98/bob-plugin-yi-translate/releases/download/v1.1.0/bob-plugin-yi-translate_v1.1.0.bobplugin)，双击安装。
3. 已安装的用户可通过 Bob 的插件更新功能升级。插件标识及已有 URL、API Key、模型选项标识保持不变。

## 配置

在 Bob 的服务设置中配置 Yi Translate：

| 设置 | 用途 |
| --- | --- |
| Base URL | 填写服务商提供的 OpenAI 兼容 API 地址，填写后优先于默认供应商 |
| API Key | 对应服务的密钥，自动以 `Authorization: Bearer ...` 发送；无鉴权的本地服务可留空 |
| 自定义模型名 | 填写模型 ID，优先于预设模型；留空则使用预设模型 |
| 模式 | 翻译、文字润色、对话、自定义 Prompt 或查询模型列表 |

地址示例：

| Base URL | 翻译接口 | 模型列表接口 |
| --- | --- | --- |
| `https://api.openai.com` | `/v1/chat/completions` | `/v1/models` |
| `https://api.deepseek.com/v1` | `/v1/chat/completions` | `/v1/models` |
| `https://proxy.example.com/team/openai/v1` | `/team/openai/v1/chat/completions` | `/team/openai/v1/models` |
| `http://localhost:11434/v1` | `/v1/chat/completions` | `/v1/models` |
| `https://api.deepseek.com/chat/completions` | `/chat/completions` | `/models` |

仅填写域名时补充 `/v1`；已填写的路径前缀保持不变；兼容旧版填写完整 `/chat/completions` 地址的方式。查询参数会保留。默认供应商为 Yi 且地址为空时，使用 `https://api.lingyiwanwu.com/v1`；选择自定义供应商后必须填写地址。

这里的“任意地址”指 OpenAI 兼容协议，不包含仅支持 Anthropic Messages、Gemini 原生接口、Azure 专用鉴权或 OpenAI Responses 的服务。

## 实时查询模型

- 在 Bob 翻译输入框中输入 `#models`、`#模型` 或 `#模型列表` 并执行翻译，即可查看当前地址和 API Key 可访问的模型 ID。每次都实时请求 `/models`。
- 也可将模式选为“查询模型列表”，输入任意文字后执行翻译；查询结束后将模式改回翻译。
- Bob 1.6.0+ 的设置面板会显示原生“验证”按钮，点击会实时请求模型列表并显示连接是否成功。**按钮不会展开模型列表，也不会自动更新模型下拉菜单**；完整列表通过上述查询命令查看。验证成功仅表示模型列表可访问，不代表任意模型都支持翻译。
- Bob 0.10.3 社区版没有验证按钮，请使用查询命令或查询模式。Bob 目前的插件设置接口只支持文本框和静态菜单，不支持自定义按钮或动态下拉菜单。

将所需模型 ID 填入“自定义模型名”后即可使用。返回列表可能含嵌入、语音等非聊天模型，请选择支持 Chat Completions 的模型。如果服务未实现 `/models`，查询会提示错误，但仍可按供应商文档手动填写模型并翻译。

## 其他命令

| 命令 | 作用 |
| --- | --- |
| `#mode` / `#模式` | 查看当前模式 |
| `#switch` / `#切换` | 在翻译、润色、自定义 Prompt、对话之间循环切换 |
| `#clear` / `#清空` | 清除对话记录 |
| `#reset` / `#重置` | 清除对话及命令模式覆盖，恢复使用设置面板中的模式 |

对话模式会保存上下文；切换地址或模型时重新开始对话。命令切换的模式优先于设置面板，使用 `#reset` 可取消覆盖。

## 开发与打包

需要 Node.js 18+ 和 Python 3，无第三方依赖。

```sh
node --test tests/plugin.test.js
python3 scripts/build.py '支持自定义 Base URL、API Key 和实时模型查询；修复自定义模型及对话历史'
```

生成 `release/bob-plugin-yi-translate_v<版本>.bobplugin`，同时更新根目录 `appcast.json` 中的版本、下载地址和 SHA-256。相同源文件重复构建会生成相同安装包。打包只包含运行所需文件，不会把旧安装包嵌入新包。

发布时将对应安装包上传到 GitHub 的 `v<版本>` Release，并将源码和 `appcast.json` 推送至 `main`，供 Bob 检查更新。

本仓库的 `src-deepseek` 是历史独立插件，标识及更新地址不同；本次升级发布的是 Yi Translate，已可通过自定义地址使用 DeepSeek。

基于 [akl-chatgpt-free-translate](https://github.com/akl7777777/bob-plugin-akl-chatgpt-free-translate) 修改。问题反馈请提交 [Issue](https://github.com/HansKing98/bob-plugin-yi-translate/issues)。
