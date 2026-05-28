import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

const LINKS_FILE = 'data/_user_links.json';
const PROFILE_FILE = 'data/_profiles.json';
const SUBMISSIONS_LOG_FILE = 'data/_submissions_log.json';
const LEADERBOARD_FILE = 'data/_list_bundled.json';

function stripDiacritics(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeName(value) {
    return stripDiacritics(String(value ?? '')).trim().toLowerCase();
}

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

function isValidDiscordId(value) {
    return /^\d{5,20}$/.test(value);
}

function buildMigratedSubmission(levelName, userId, gdName, adminId) {
    const now = new Date().toISOString();
    return {
        id: typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : Date.now() + Math.random().toString(36).substring(2, 9),
        player: gdName,
        level: levelName,
        video: 'migrated://leaderboard',
        raw: 'migrated',
        hz: 0,
        percent: 100,
        note: 'Migrated from leaderboard',
        submitted_by: {
            id: userId,
            username: gdName,
        },
        status: 'approved',
        timestamp: now,
        reviewed_by: adminId,
        reviewed_at: now,
    };
}

async function ensureMigratedProfile(github, userId, gdName, fileData) {
    const profiles = fileData ? safeParseArray(fileData.content) : [];
    const now = new Date().toISOString();
    const existingIndex = profiles.findIndex((entry) => entry?.user_id === userId);

    const nextProfile = {
        user_id: userId,
        gd_name: gdName,
        region: '',
        updated_at: now,
    };

    if (existingIndex === -1) {
        profiles.push(nextProfile);
    } else {
        profiles[existingIndex] = {
            ...profiles[existingIndex],
            gd_name: gdName || profiles[existingIndex]?.gd_name || '',
            region: profiles[existingIndex]?.region || '',
            updated_at: now,
        };
    }

    await github.putFile(
        PROFILE_FILE,
        JSON.stringify(profiles, null, 4),
        `Migrate profile for ${gdName}`,
        fileData?.sha ?? null,
    );
}

async function migrateSubmissionsFromLeaderboard(github, userId, gdName, adminId) {
    const leaderboardFile = await github.getFile(LEADERBOARD_FILE);
    const submissionsFile = await github.getFile(SUBMISSIONS_LOG_FILE);
    const leaderboard = leaderboardFile ? safeParseArray(leaderboardFile.content) : [];
    const logEntries = submissionsFile ? safeParseArray(submissionsFile.content) : [];

    const existingKeys = new Set(
        logEntries
            .filter((entry) => entry?.submitted_by?.id === userId)
            .map((entry) => `${normalizeName(entry?.player)}::${normalizeName(entry?.level)}::${Number(entry?.percent) || 0}`)
    );

    const now = new Date().toISOString();
    const nextEntries = [];

    leaderboard.forEach((entry) => {
        const records = Array.isArray(entry?.records) ? entry.records : [];
        records.forEach((record) => {
            const recordUser = normalizeName(record?.user);
            const recordPercent = Number(record?.percent);
            const levelName = String(entry?.name ?? '').trim();

            if (recordUser !== normalizeName(gdName) || recordPercent !== 100 || !levelName) {
                return;
            }

            const key = `${normalizeName(gdName)}::${normalizeName(levelName)}::100`;
            if (existingKeys.has(key)) {
                return;
            }

            const submission = buildMigratedSubmission(levelName, userId, gdName, adminId);
            submission.timestamp = now;
            nextEntries.push(submission);
            existingKeys.add(key);
        });
    });

    if (nextEntries.length === 0) {
        return { created: 0 };
    }

    const merged = [...logEntries, ...nextEntries];
    await github.putFile(
        SUBMISSIONS_LOG_FILE,
        JSON.stringify(merged, null, 4),
        `Migrate submissions for ${gdName}`,
        submissionsFile?.sha ?? null,
    );

    return { created: nextEntries.length };
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
        const gdName = String(data?.gd_name ?? '').trim();

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

        await ensureMigratedProfile(
            github,
            discordId,
            gdName,
            await github.getFile(PROFILE_FILE),
        );

        const migrated = await migrateSubmissionsFromLeaderboard(github, discordId, gdName, userId);

        await github.putFile(
            LINKS_FILE,
            JSON.stringify(links, null, 4),
            `Update Discord link for ${gdName}`,
            fileData?.sha ?? null,
        );

        return jsonResponse({ success: true, link: nextEntry, migrated });
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
