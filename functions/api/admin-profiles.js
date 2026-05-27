import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const PROFILE_FILE = 'data/_profiles.json';
const VALID_REGIONS = new Set([
    'Viana do Castelo',
    'Braga',
    'Vila Real',
    'Braganca',
    'Porto',
    'Aveiro',
    'Viseu',
    'Guarda',
    'Coimbra',
    'Castelo Branco',
    'Leiria',
    'Santarem',
    'Lisboa',
    'Setubal',
    'Portalegre',
    'Evora',
    'Beja',
    'Faro',
    'Azores',
    'Acores',
    'Madeira',
]);

function safeParseArray(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function sanitizeProfile(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    return {
        user_id: entry.user_id ?? '',
        gd_name: entry.gd_name ?? '',
        region: entry.region ?? '',
        updated_at: entry.updated_at ?? null,
    };
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
        const fileData = await github.getFile(PROFILE_FILE);
        const profiles = fileData ? safeParseArray(fileData.content) : [];
        const sanitized = profiles.map((entry) => sanitizeProfile(entry)).filter(Boolean);
        return jsonResponse(sanitized);
    }

    if (request.method === 'POST') {
        let data;
        try {
            data = await request.json();
        } catch {
            return new Response('Invalid JSON', { status: 400 });
        }

        const userId = String(data?.user_id ?? '').trim();
        const gdName = String(data?.gd_name ?? '').trim();
        const region = String(data?.region ?? '').trim();

        if (!userId || !gdName) {
            return new Response('Missing user_id or gd_name', { status: 400 });
        }

        if (region && !VALID_REGIONS.has(region)) {
            return new Response('Invalid region', { status: 400 });
        }

        const fileData = await github.getFile(PROFILE_FILE);
        const profiles = fileData ? safeParseArray(fileData.content) : [];
        const now = new Date().toISOString();

        const existingIndex = profiles.findIndex((entry) => entry?.user_id === userId);
        const nextProfile = {
            user_id: userId,
            gd_name: gdName,
            region: region || '',
            updated_at: now,
        };

        if (existingIndex === -1) {
            profiles.push(nextProfile);
        } else {
            profiles[existingIndex] = { ...profiles[existingIndex], ...nextProfile };
        }

        await github.putFile(
            PROFILE_FILE,
            JSON.stringify(profiles, null, 4),
            `Admin update profile for ${gdName}`,
            fileData?.sha ?? null,
        );

        return jsonResponse({ success: true, profile: sanitizeProfile(nextProfile) });
    }

    return new Response('Method not allowed', { status: 405 });
}
