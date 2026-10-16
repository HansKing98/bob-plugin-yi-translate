const config = require('./config.js');
const file = require('./file.js');
const langMap = new Map(config.supportedLanguages);

function currentMode() {
    const mode = file.readFile().mode || $option.mode || 'translate';
    return mode === 'conversation' ? 'chat' : mode;
}

function getDirectiveResult(text) {
    const mode = currentMode();
    switch (text.toLowerCase()) {
        case '#mode':
        case '#模式':
            return '当前模式：' + ({ chat: '对话', polishing: '文字润色', custom_prompt: '自定义 Prompt', translate: '翻译' }[mode] || mode);
        case '#switch':
        case '#切换': {
            const modes = ['translate', 'polishing', 'custom_prompt', 'chat'];
            const settings = file.readFile();
            settings.mode = modes[(modes.indexOf(mode) + 1) % modes.length];
            file.writeFile({ value: settings });
            return getDirectiveResult('#mode');
        }
        case '#clear':
        case '#清空':
            file.deleteFile();
            return '已清除对话记录。';
        case '#reset':
        case '#重置':
            file.deleteAllFile();
            return '已清除对话记录及指令模式，恢复使用设置面板中的模式。';
        default:
            return undefined;
    }
}

exports.langMap = langMap;
exports.currentMode = currentMode;
exports.getDirectiveResult = getDirectiveResult;
