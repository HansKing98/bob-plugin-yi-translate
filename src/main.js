var config = require('./config.js');
var utils = require('./utils.js');
var yichat = require('./yichat.js');
var file = require("./file.js");
const { readFile } = require("./file.js");

// var { historyFileName, readFile, writeFile } = require("./file");
// 入参格式:
// {
//     "model": "yi-34b-chat-0205",
//     "messages": [{"role": "user", "content": "帮我把Banana翻译为中文"}]
// }
// 出参格式:
// {"id":"0f1a1078b531435a9ffc29eb69d403e9","object":"chat.completion","created":1678332271,"model":"yi-34b-chat-0205","usage":{"prompt_tokens":24,"completion_tokens":27,"total_tokens":67},"choices":[{"message":{"role":"assistant","content":"香蕉"},"finish_reason":"stop","index":0}]}


function supportLanguages() {
    return config.supportedLanguages.map(([standardLang]) => standardLang);
}

function translate(query, completion) {
    (async () => {
        const targetLanguage = utils.langMap.get(query.detectTo);
        const sourceLanguage = utils.langMap.get(query.detectFrom);
        if (!targetLanguage) {
            const err = new Error();
            Object.assign(err, {
                _type: 'unsupportLanguage',
                _message: '不支持该语种',
            });
            throw err;
        }
        const source_lang = sourceLanguage || 'ZH';
        const target_lang = targetLanguage || 'EN';
        const translate_text = query.text || '';
        if (translate_text !== '') {
            // 触发指令的结果
            const directiveResult = utils.getDirectiveResult(translate_text);
            if (directiveResult) {
                completion({
                    result: {
                        from: query.detectFrom,
                        to: query.detectTo,
                        toParagraphs: directiveResult.split('\n'),
                    },
                });

                return;
            }


            // 获取对话结果
            let chatResult = ''

            try {
                const server = $option.service;
                $log.info('hans')
                $log.info(server)
                $log.info('hans')
                if (server === 'api_key_1') {
                    chatResult = await yichat.translate(query, source_lang, target_lang, translate_text, completion)
                } else {
                    // 默认请求 api.lingyiwanwu.com
                    chatResult = await yichat.translate(query, source_lang, target_lang, translate_text, completion)
                    return;
                }
                let mode = $option.mode;
                const configValue = readFile();
                if (configValue.mode) {
                    mode = configValue.mode;
                }
                // 对话模式就保存
                if (mode === 'conversation') {
                    message.push({
                        content: chatResult,
                        role: "assistant",
                    });
                    file.writeFile({
                        value: message,
                        fileName: file.historyFileName,
                    });
                }
            } catch (e) {
                Object.assign(e, {
                    _type: 'network',
                    _message: '接口请求错误 - ' + JSON.stringify(e),
                });
                throw e;
            }
        }
    })().catch((err) => {
        completion({
            error: {
                type: err._type || 'unknown',
                message: err._message || '未知错误',
                addtion: err._addtion,
            },
        });
    });
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
