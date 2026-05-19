import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const PENDING_FILE = 'data/_pending_placements.json';
const MAX_GITHUB_WRITE_RETRIES = 2;

function safeParseArray(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function isShaConflict(error) {
    const msg = String(error?.message ?? error);
    return msg.includes(' failed: 409') && msg.includes('sha is at');
}

async function updatePendingPlacements(github, nextValues, commitMessage, initialFile = null) {
    let pendingFile = initialFile;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_GITHUB_WRITE_RETRIES; attempt += 1) {
        if (!pendingFile) {
            pendingFile = await github.getFile(PENDING_FILE);
        }

        const sha = pendingFile?.sha ?? null;

        try {
            await github.putFile(
                PENDING_FILE,
                JSON.stringify(nextValues, null, 4),
                commitMessage,
                sha,
            );
            return true;
        } catch (e) {
            lastError = e;
            if (!isShaConflict(e) || attempt === MAX_GITHUB_WRITE_RETRIES - 1) {
                throw e;
            }
            pendingFile = null;
        }
    }

    throw lastError;
}

function normalizePendingValues(value) {
    return safeParseArray(value)
        .filter((x) => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean);
}

export async function onRequest(context) {
    const { request, env } = context;

    const { response } = requireAdmin(request, env);
    if (response) {
        return response;
    }

    let github;
    try {
        github = createGitHubContentClient(env);
    } catch (e) {
        return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
    }

    if (request.method === 'GET') {
        const fileData = await github.getFile(PENDING_FILE);
        if (!fileData) {
            return jsonResponse([]);
        }

        return jsonResponse(normalizePendingValues(fileData.content));
    }

    if (request.method === 'POST') {
        let data;
        try {
            data = await request.json();
        } catch {
            return new Response('Invalid JSON', { status: 400 });
        }

        const id = String(data?.id ?? data?.slug ?? '').trim();
        if (!id) {
            return new Response('Missing id', { status: 400 });
        }

        const fileData = await github.getFile(PENDING_FILE);
        const values = fileData ? normalizePendingValues(fileData.content) : [];
        if (!values.includes(id)) {
            values.push(id);
            await updatePendingPlacements(
                github,
                values,
                `Admin Panel: Mark ${id} as pending placement`,
                fileData,
            );
        }

        return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
        const url = new URL(request.url);
        const id = String(url.searchParams.get('id') ?? '').trim();
        if (!id) {
            return new Response('Missing id', { status: 400 });
        }

        const fileData = await github.getFile(PENDING_FILE);
        if (!fileData) {
            return jsonResponse({ success: true });
        }

        const values = normalizePendingValues(fileData.content);
        const nextValues = values.filter((slug) => slug !== id);
        if (nextValues.length !== values.length) {
            await updatePendingPlacements(
                github,
                nextValues,
                `Admin Panel: Confirm ${id} (remove pending placement)`,
                fileData,
            );
        }

        return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
}
