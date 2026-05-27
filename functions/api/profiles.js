import { createGitHubContentClient, jsonResponse } from '../_shared.js';

const PROFILE_FILE = 'data/_profiles.json';
const LINKS_FILE = 'data/_user_links.json';

function safeParseArray(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function sanitizeProfile(entry, linkedName) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        gd_name: entry.gd_name ?? '',
        linked_gd_name: linkedName ?? null,
        region: entry.region ?? '',
        updated_at: entry.updated_at ?? null,
    };
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    let github;
    try {
        github = createGitHubContentClient(env);
    } catch (e) {
        return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
    }

    const fileData = await github.getFile(PROFILE_FILE);
    const profiles = fileData ? safeParseArray(fileData.content) : [];
    const linksData = await github.getFile(LINKS_FILE);
    const links = linksData ? safeParseArray(linksData.content) : [];
    const linkMap = new Map(
        links
            .filter((entry) => entry?.discord_id && entry?.gd_name)
            .map((entry) => [entry.discord_id, entry.gd_name])
    );

    const sanitized = profiles
        .map((entry) => {
            const linkedName = linkMap.get(entry?.user_id) ?? null;
            return sanitizeProfile(entry, linkedName);
        })
        .filter(Boolean);

    return jsonResponse(sanitized);
}
