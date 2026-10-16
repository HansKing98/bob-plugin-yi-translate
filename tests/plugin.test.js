const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');

function plugin(options = {}, respond) {
    const files = new Map();
    const calls = [];
    const cache = new Map();
    const settings = Object.assign({ mode: 'translate', model: 'yi-lightning', api_key: 'test-key' }, options);
    const context = vm.createContext({
        $option: settings,
        $http: { request: async function (request) {
            calls.push(JSON.parse(JSON.stringify(request)));
            return respond ? respond(request) : { response: { statusCode: 200 }, data: { choices: [{ message: { content: 'Translated text' } }] } };
        } },
        $file: {
            exists: name => files.has(name),
            read: name => ({ toUTF8: () => files.get(name) }),
            write: ({ path: name, data }) => files.set(name, data),
            delete: name => files.delete(name),
        },
        $data: { fromUTF8: value => value },
    });
    function load(name) {
        if (cache.has(name)) return cache.get(name);
        const exports = {};
        cache.set(name, exports);
        const source = fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
        vm.runInContext('(function(require, exports) {\n' + source + '\n})', context)(load, exports);
        return exports;
    }
    const main = load('./main.js');
    async function translate(text, modern = false, extra = {}) {
        const results = [];
        const query = Object.assign({ text, detectFrom: 'en', detectTo: 'zh-Hans' }, extra);
        if (modern) query.onCompletion = value => results.push(value);
        await main.translate(query, modern ? undefined : value => results.push(value));
        assert.equal(results.length, 1, 'exactly one completion per request');
        return JSON.parse(JSON.stringify(results[0]));
    }
    return { main, api: load('./api.js'), translate, calls, files, settings };
}

test('Bob entry points are ordinary functions rather than AsyncFunction objects', () => {
    const { main } = plugin();
    for (const name of ['supportLanguages', 'translate', 'pluginValidate']) {
        assert.equal(Object.prototype.toString.call(main[name]), '[object Function]', name);
    }
});

test('base URLs, proxy prefixes, local servers and legacy endpoints', () => {
    const { api } = plugin();
    const cases = [
        ['', 'https://api.lingyiwanwu.com/v1'],
        [' https://api.example.com/ ', 'https://api.example.com/v1'],
        ['https://api.example.com/v1///', 'https://api.example.com/v1'],
        ['https://proxy.example.com/team/openai/v1', 'https://proxy.example.com/team/openai/v1'],
        ['https://api.deepseek.com/chat/completions', 'https://api.deepseek.com'],
        ['https://api.example.com/v1/chat/completions/', 'https://api.example.com/v1'],
        ['http://localhost:11434/v1', 'http://localhost:11434/v1'],
        ['http://127.0.0.1:1234', 'http://127.0.0.1:1234/v1'],
        ['http://[::1]:8000/v1', 'http://[::1]:8000/v1'],
        ['https://api.example.com/v1/models', 'https://api.example.com/v1'],
    ];
    for (const [url, root] of cases) {
        const endpoints = api.endpoints({ url });
        assert.equal(endpoints.chat, root + '/chat/completions');
        assert.equal(endpoints.models, root + '/models');
    }
    assert.equal(api.endpoints({ url: 'https://api.example.com/v1/chat/completions?api-version=2026' }).models,
        'https://api.example.com/v1/models?api-version=2026');
    for (const url of ['ftp://example.com', 'example.com', 'https://u:p@example.com/v1', 'https://example.com/#x', 'https://example.com/a b']) {
        assert.throws(() => api.endpoints({ url }), /Base URL/);
    }
    assert.throws(() => api.endpoints({ service: 'api_key_1', url: ' ' }), /Base URL/);
});

test('custom URL and custom model override defaults without changing translation mode', async () => {
    const app = plugin({ service: 'default', url: 'https://proxy.example.com/openai/v1/', custom_model_name: ' my-model ', api_key: ' my-key ' });
    const result = await app.translate('Hello');
    assert.deepEqual(result.result.toParagraphs, ['Translated text']);
    assert.equal(app.calls[0].url, 'https://proxy.example.com/openai/v1/chat/completions');
    assert.equal(app.calls[0].header.Authorization, 'Bearer my-key');
    assert.equal(app.calls[0].body.model, 'my-model');
    assert.match(app.calls[0].body.messages[0].content, /translate.*ZH/);
    assert.equal(app.calls[0].body.stream, false);
    assert.equal(app.files.size, 0);
});

test('empty API key is supported for local unauthenticated services', async () => {
    const app = plugin({ url: 'http://localhost:11434/v1', api_key: '' });
    await app.translate('Hello', true);
    assert.equal(app.calls[0].header.Authorization, undefined);
});

test('model commands and query mode make a fresh GET request every time', async () => {
    const app = plugin({}, () => ({ data: { data: [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }] } }));
    for (const command of [' #models ', '#MODELS', '#模型', '#模型列表']) {
        const result = await app.translate(command, false, { detectTo: 'unknown' });
        assert.match(result.result.toParagraphs.join('\n'), /a-model\nz-model/);
    }
    app.settings.mode = 'models';
    await app.translate('List models', true);
    assert.equal(app.calls.length, 5);
    for (const call of app.calls) {
        assert.equal(call.method, 'GET');
        assert.equal(call.body, undefined);
        assert.equal(call.url, 'https://api.lingyiwanwu.com/v1/models');
        assert.equal(call.header.Authorization, 'Bearer test-key');
    }
});

test('validation button queries models and completes once', async () => {
    const app = plugin({}, () => ({ data: { data: [{ id: 'custom-model' }] } }));
    const results = [];
    await app.main.pluginValidate(value => results.push(value));
    assert.equal(results.length, 1);
    assert.equal(results[0].result, true);
    assert.equal(app.calls[0].method, 'GET');
});

test('empty lists are valid; malformed model responses are errors', async () => {
    const empty = plugin({}, () => ({ data: { data: [] } }));
    assert.match((await empty.translate('#models')).result.toParagraphs[0], /为空/);
    for (const data of [{}, { data: [{ name: 'no-id' }] }, { data: 'invalid' }]) {
        const app = plugin({}, () => ({ data }));
        assert.equal((await app.translate('#models')).error.type, 'api');
    }
});

test('HTTP errors are failures, not translated results', async () => {
    for (const [status, type] of [[401, 'secretKey'], [403, 'secretKey'], [429, 'api'], [500, 'network'], [302, 'network']]) {
        const app = plugin({}, () => ({ response: { statusCode: status }, data: { error: { message: 'test-key' } } }));
        const result = await app.translate('Hello');
        assert.equal(result.error.type, type);
        assert.equal(result.result, undefined);
        assert.ok(!result.error.message.includes('test-key'));
    }
});

test('missing models endpoint explains manual model configuration', async () => {
    const app = plugin({}, () => ({ response: { statusCode: 404 }, data: 'not found' }));
    assert.match((await app.translate('#models')).error.message, /手动填写模型/);
    const results = [];
    await app.main.pluginValidate(value => results.push(value));
    assert.equal(results.length, 1);
    assert.equal(results[0].result, false);
});

test('network errors and JSON API errors redact credentials', async () => {
    for (const respond of [
        () => { throw new Error('request headers contain test-key'); },
        () => ({ error: { message: 'request headers contain test-key' } }),
        () => ({ data: { error: { message: 'rejected test-key' } } }),
    ]) {
        const app = plugin({}, respond);
        const result = await app.translate('Hello');
        assert.ok(result.error);
        assert.ok(!JSON.stringify(result).includes('test-key'));
    }
});

test('invalid and empty completion payloads produce useful errors', async () => {
    for (const data of [undefined, '<html>bad gateway</html>', {}, { choices: [] }, { choices: [{ message: { content: null } }] }, { choices: [{ message: { content: ' ' } }] }]) {
        const app = plugin({}, () => ({ data }));
        assert.equal((await app.translate('Hello')).error.type, 'api');
    }
    const app = plugin({}, () => ({ data: JSON.stringify({ choices: [{ message: { content: 'One\nTwo' } }] }) }));
    assert.deepEqual((await app.translate('Hello')).result.toParagraphs, ['One', 'Two']);
});

test('polishing and custom prompts use the selected custom model', async () => {
    for (const [mode, prefix] of [['polishing', '请润色'], ['custom_prompt', 'Summarize']]) {
        const app = plugin({ mode, prompt: 'Summarize', custom_model_name: 'custom' });
        await app.translate('Hello');
        assert.ok(app.calls[0].body.messages[0].content.startsWith(prefix));
        assert.equal(app.calls[0].body.model, 'custom');
    }
});

test('chat stores assistant text, reuses history, and isolates different models and endpoints', async () => {
    const app = plugin({ mode: 'chat' });
    await app.translate('First');
    await app.translate('Second');
    assert.equal(app.calls[1].body.messages.length, 3);
    assert.equal(app.calls[1].body.messages[1].content, 'Translated text');
    app.settings.custom_model_name = 'another-model';
    await app.translate('Third');
    assert.equal(app.calls[2].body.messages[0].content, 'Third');
    assert.equal(app.calls[2].body.messages.length, 1);
    app.settings.url = 'https://other.example.com/v1';
    await app.translate('Fourth');
    assert.equal(app.calls[3].body.messages.length, 1);
    assert.ok(!Array.from(app.files.values()).join('').includes('test-key'));
});

test('legacy conversation mode, switch, clear and reset remain functional', async () => {
    const app = plugin({ mode: 'chat' });
    app.files.set('$sandbox/config.txt', JSON.stringify({ mode: 'conversation' }));
    assert.match((await app.translate('#mode')).result.toParagraphs[0], /对话/);
    await app.translate('Hello');
    await app.translate('#clear');
    assert.equal(app.files.has('$sandbox/history.txt'), false);
    assert.match((await app.translate('#switch')).result.toParagraphs[0], /翻译/);
    await app.translate('#reset');
    assert.equal(app.files.size, 0);
    assert.match((await app.translate('#mode')).result.toParagraphs[0], /对话/);
    assert.equal(app.calls.length, 1);
});

test('empty input and unsupported language always complete', async () => {
    const app = plugin();
    assert.equal((await app.translate(' ')).error.type, 'param');
    assert.equal((await app.translate('Hello', false, { detectTo: 'invalid' })).error.type, 'unsupportedLanguage');
    assert.equal(app.calls.length, 0);
});

test('actual HTTP round trip against an OpenAI compatible local server', async () => {
    const requests = [];
    const server = http.createServer(async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(req.method === 'GET' ? { data: [{ id: 'local-chat' }] } : { choices: [{ message: { content: '你好' } }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const app = plugin({ url: 'http://127.0.0.1:' + server.address().port + '/proxy/v1', custom_model_name: 'local-chat' }, async options => {
            const response = await fetch(options.url, { method: options.method, headers: options.header, body: options.body ? JSON.stringify(options.body) : undefined });
            return { response: { statusCode: response.status }, data: await response.json() };
        });
        assert.match((await app.translate('#models')).result.toParagraphs.join('\n'), /local-chat/);
        assert.deepEqual((await app.translate('Hello', true)).result.toParagraphs, ['你好']);
        assert.equal(requests[0].url, '/proxy/v1/models');
        assert.equal(requests[1].url, '/proxy/v1/chat/completions');
        assert.equal(requests[1].authorization, 'Bearer test-key');
        assert.equal(requests[1].body.model, 'local-chat');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
