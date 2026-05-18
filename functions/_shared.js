const DEFAULT_USER_AGENT = 'Cloudflare-Pages';
const DEFAULT_BRANCH = 'main';

function base64ToUint8Array(base64) {
    const cleaned = String(base64 ?? '').replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

function uint8ArrayToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

function decodeBase64Utf8(base64) {
    return new TextDecoder('utf-8').decode(base64ToUint8Array(base64));
}

function encodeBase64Utf8(text) {
    return uint8ArrayToBase64(new TextEncoder().encode(String(text ?? '')));
}

export function jsonResponse(body, init = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(payload, { ...init, headers });
}

export function parseIdSet(value) {
    return new Set(
        String(value ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
    );
}

export function getCookieValue(cookieHeader, name) {
    const header = String(cookieHeader ?? '');
    if (!header) {
        return null;
    }

    // Parse as `name=value; other=value` and match exact cookie names.
    const parts = header.split(';');
    for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i].trim();
        if (!part) continue;

        const eqIndex = part.indexOf('=');
        if (eqIndex === -1) continue;

        const key = part.slice(0, eqIndex).trim();
        if (key !== name) continue;

        const value = part.slice(eqIndex + 1).trim();
        return value || null;
    }

    return null;
}

export function requireAdmin(request, env) {
    const userId = getCookieValue(request.headers.get('Cookie'), 'session');
    if (!userId) {
        return { response: new Response('Unauthorized', { status: 401 }) };
    }

    const adminIds = parseIdSet(env.ADMIN_DISCORD_ID);
    if (!adminIds.has(userId)) {
        return { response: new Response('Forbidden', { status: 403 }) };
    }

    return { userId };
}

export function createGitHubContentClient(env) {
    const token = env.GITHUB_TOKEN;
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch = env.GITHUB_BRANCH || env.CF_PAGES_BRANCH || DEFAULT_BRANCH;

    if (!token || !owner || !repo) {
        throw new Error('Missing GitHub credentials in Cloudflare Env');
    }

    const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;

    const baseHeaders = {
        Authorization: `Bearer ${token}`,
        'User-Agent': DEFAULT_USER_AGENT,
        Accept: 'application/vnd.github+json',
    };

    function withBranchRef(url) {
        const ref = encodeURIComponent(branch);
        return `${url}${url.includes('?') ? '&' : '?'}ref=${ref}`;
    }

    async function getFile(path) {
        const res = await fetch(withBranchRef(`${githubApiUrl}/${path}`), {
            headers: baseHeaders,
        });

        if (res.status === 404) {
            return null;
        }

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`GitHub GET ${path} failed: ${res.status} ${text}`);
        }

        const data = await res.json();
        if (!data || typeof data !== 'object' || typeof data.sha !== 'string') {
            throw new Error(`GitHub GET ${path} returned unexpected data`);
        }

        if (typeof data.content !== 'string') {
            return { sha: data.sha, content: '' };
        }

        return { sha: data.sha, content: decodeBase64Utf8(data.content) };
    }

    async function putFile(path, content, message, sha = null) {
        const body = {
            message,
            content: encodeBase64Utf8(content),
            branch,
        };

        if (sha) {
            body.sha = sha;
        }

        const res = await fetch(`${githubApiUrl}/${path}`, {
            method: 'PUT',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`GitHub PUT ${path} failed: ${res.status} ${text}`);
        }

        return true;
    }

    async function deleteFile(path, message, sha) {
        const res = await fetch(`${githubApiUrl}/${path}`, {
            method: 'DELETE',
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                sha,
                branch,
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${text}`);
        }

        return true;
    }

    return {
        getFile,
        putFile,
        deleteFile,
    };
}
