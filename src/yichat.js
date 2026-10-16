const api = require('./api.js');
const file = require('./file.js');
const utils = require('./utils.js');

async function translate(targetLanguage, text) {
    const mode = utils.currentMode();
    const model = api.selectedModel($option);
    let content = text;
    if (mode === 'translate') {
        content = 'Please translate the following text into ' + targetLanguage +
            '. Respond with only the translated text without including any unrelated content.\n\n' + text;
    } else if (mode === 'polishing') {
        content = '请润色以下内容：\n' + text;
    } else if (mode === 'custom_prompt') {
        content = ($option.prompt || '') + '\n' + text;
    }

    let messages = [{ role: 'user', content: content }];
    const context = JSON.stringify([api.endpoints($option).chat, model]);
    const settings = file.readFile();
    if (mode === 'chat' && settings.historyContext === context) {
        const history = file.readFile(file.historyFileName);
        if (Array.isArray(history)) messages = history.concat(messages);
    }
    const data = await api.request('chat', { model: model, messages: messages, stream: false });
    const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof answer !== 'string' || !answer.trim()) {
        throw api.error('api', '接口没有返回有效的 choices[0].message.content，请确认模型支持 Chat Completions。');
    }
    if (mode === 'chat') {
        messages.push({ role: 'assistant', content: answer });
        file.writeFile({ value: messages, fileName: file.historyFileName });
        settings.historyContext = context;
        file.writeFile({ value: settings });
    }
    return answer;
}

exports.translate = translate;
