import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const LINKS_FILE = 'data/_user_links.json';

function safeParseArray(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeDiscordId(value) {
    return String(value ?? '').trim();
}

function normalizeName(value) {
    return String(value ?? '').trim();
}

function isValidDiscordId(value) {
    return /^\d{5,20}$/.test(value);
}

export async function onRequest(context) {
    const { request, env } = context;

    const { response, userId } = requireAdmin(request, env);
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
        const fileData = await github.getFile(LINKS_FILE);
        const links = fileData ? safeParseArray(fileData.content) : [];
        return jsonResponse(links);
    }

    if (request.method === 'POST') {
        let data;
        try {
            data = await request.json();
        } catch {
            return new Response('Invalid JSON', { status: 400 });
        }

        const discordId = normalizeDiscordId(data?.discord_id);
        const gdName = normalizeName(data?.gd_name);

        if (!discordId || !gdName) {
            return new Response('Missing discord_id or gd_name', { status: 400 });
        }

        if (!isValidDiscordId(discordId)) {
            return new Response('Invalid discord_id', { status: 400 });
        }

        const fileData = await github.getFile(LINKS_FILE);
        const links = fileData ? safeParseArray(fileData.content) : [];
        const now = new Date().toISOString();

        const nextEntry = {
            discord_id: discordId,
            gd_name: gdName,
            updated_at: now,
            updated_by: userId,
        };

        const existingIndex = links.findIndex((entry) => entry?.discord_id === discordId);
        if (existingIndex === -1) {
            links.push(nextEntry);
        } else {
            links[existingIndex] = { ...links[existingIndex], ...nextEntry };
        }

        await github.putFile(
            LINKS_FILE,
            JSON.stringify(links, null, 4),
            `Update Discord link for ${gdName}`,
            fileData?.sha ?? null,
        );

        return jsonResponse({ success: true, link: nextEntry });
    }

    if (request.method === 'DELETE') {
        const url = new URL(request.url);
        const discordId = normalizeDiscordId(url.searchParams.get('discord_id'));
        if (!discordId) {
            return new Response('Missing discord_id', { status: 400 });
        }

        const fileData = await github.getFile(LINKS_FILE);
        if (!fileData) {
            return jsonResponse({ success: true });
        }

        const links = safeParseArray(fileData.content);
        const nextLinks = links.filter((entry) => entry?.discord_id !== discordId);

        if (nextLinks.length !== links.length) {
            await github.putFile(
                LINKS_FILE,
                JSON.stringify(nextLinks, null, 4),
                `Remove Discord link ${discordId}`,
                fileData.sha,
            );
        }

        return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
}
