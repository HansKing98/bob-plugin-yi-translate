function error(type, message) {
    const err = new Error(message);
    err._type = type;
    return err;
}

function endpoints(options) {
    // Keep the old option identifier so installed services retain their URL.
    const input = (options.url || '').trim();
    if (!input && options.service === 'api_key_1') {
        throw error('param', '请填写 Base URL。');
    }
    const base = input || 'https://api.lingyiwanwu.com/v1';
    // Bob uses JavaScriptCore and does not provide the browser URL API.
    const match = /^(https?:\/\/[^/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?$/i.exec(base);
    if (!match || match[1].indexOf('@') !== -1) {
        throw error('param', 'Base URL 必须是有效的 http:// 或 https:// 地址，不能包含用户名、密码或 #。');
    }
    let path = (match[2] || '').replace(/\/+$/, '');
    const hasEndpoint = /\/(chat\/completions|models)$/.test(path);
    path = path.replace(/\/(chat\/completions|models)$/, '');
    if (!path && !hasEndpoint) path = '/v1';
    const root = match[1] + path;
    const search = match[3] || '';
    return {
        chat: root + '/chat/completions' + search,
        models: root + '/models' + search,
    };
}

function selectedModel(options) {
    return (options.custom_model_name || '').trim() || (options.model || '').trim() || 'yi-lightning';
}

function publicError(err) {
    // Never expose request headers or transport errors that may contain credentials.
    let message = err && err._type ? err.message : '网络请求失败，请检查 Base URL、网络连接和服务状态。';
    const key = ($option.api_key || '').trim();
    if (key) message = message.split(key).join('[REDACTED]');
    return { type: (err && err._type) || 'network', message: message };
}

async function request(kind, body) {
    const urls = endpoints($option);
    const key = ($option.api_key || '').trim();
    const header = { 'Content-Type': 'application/json' };
    if (key) header.Authorization = 'Bearer ' + key;
    const options = {
        method: kind === 'models' ? 'GET' : 'POST',
        url: urls[kind],
        header: header,
        timeout: 45,
    };
    if (body) options.body = body;
    const resp = await $http.request(options);
    if (!resp) throw error('network', '服务没有返回响应。');
    const status = resp.response && resp.response.statusCode;
    if (status === 401 || status === 403) {
        throw error('secretKey', 'API Key 无效或没有访问权限，请检查密钥和服务地址。');
    }
    if (status === 404 && kind === 'models') {
        throw error('api', '该地址未提供 /models 接口，请检查 Base URL。仍可手动填写模型 ID 进行翻译。');
    }
    if (status === 429) throw error('api', '请求过于频繁或额度不足，请稍后重试并检查账户额度。');
    if (status && (status < 200 || status >= 300)) {
        throw error('network', '接口返回 HTTP ' + status + '，请检查 Base URL、模型名称及服务状态。');
    }
    if (resp.error) throw error('network', '网络请求失败，请检查 Base URL、网络连接和服务状态。');
    let data = resp.data;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) {
            throw error('api', '接口返回了非 JSON 内容，请检查 Base URL 是否指向 API 服务。');
        }
    }
    if (!data || typeof data !== 'object') throw error('api', '接口返回了空数据或无效数据。');
    if (data.error) {
        const detail = typeof data.error === 'string' ? data.error : data.error.message;
        throw error('api', '接口错误：' + (typeof detail === 'string' ? detail : '未知服务错误'));
    }
    return data;
}

async function listModels() {
    const data = await request('models');
    if (!Array.isArray(data.data)) throw error('api', '模型列表格式不兼容，预期为 {"data":[{"id":"模型名"}]}。');
    const ids = data.data.map(function (item) {
        return item && typeof item.id === 'string' ? item.id.trim() : '';
    }).filter(function (id) { return id.length > 0; });
    if (data.data.length && !ids.length) throw error('api', '模型列表中没有有效的模型 ID。');
    return Array.from(new Set(ids)).sort();
}

exports.error = error;
exports.endpoints = endpoints;
exports.selectedModel = selectedModel;
exports.publicError = publicError;
exports.request = request;
exports.listModels = listModels;
