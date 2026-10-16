const config = require('./config.js');
const utils = require('./utils.js');
const yichat = require('./yichat.js');
const api = require('./api.js');

function supportLanguages() {
    return config.supportedLanguages.map(function (entry) { return entry[0]; });
}

async function translate(query, completion) {
    const done = query.onCompletion || completion;
    let output;
    try {
        const text = query.text || '';
        let result;
        if (/^#(models|模型|模型列表)$/i.test(text.trim()) || $option.mode === 'models') {
            const models = await api.listModels();
            result = models.length
                ? '可用模型（' + models.length + '）：\n' + models.join('\n') + '\n\n将模型 ID 填入设置中的「自定义模型名」。列表可能包含非聊天模型，请按供应商说明选择。'
                : '接口返回的模型列表为空。可按供应商文档手动填写模型 ID。';
        } else {
            result = utils.getDirectiveResult(text.trim());
            if (!result) {
                if (!text.trim()) throw api.error('param', '请输入需要处理的文本。');
                const target = utils.langMap.get(query.detectTo);
                if (!target) throw api.error('unsupportedLanguage', '不支持该目标语种。');
                result = await yichat.translate(target, text);
            }
        }
        output = { result: { from: query.detectFrom, to: query.detectTo, toParagraphs: result.split('\n') } };
    } catch (err) {
        output = { error: api.publicError(err) };
    }
    done(output);
}

// Bob 1.6+ discovers this optional hook; older Bob versions only call translate.
async function pluginValidate(completion) {
    let output;
    try {
        await api.listModels();
        output = { result: true };
    } catch (err) {
        output = { result: false, error: api.publicError(err) };
    }
    completion(output);
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
exports.pluginValidate = pluginValidate;
