import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
    requireAuth,
    getDiscordUsername,
} from '../_shared.js';

export async function onRequest(context) {
    const { request, env } = context;

    const SUBMISSIONS_FILE = "data/_submissions.json";
    const LOG_FILE = "data/_submissions_log.json";
    const PROFILE_FILE = "data/_profiles.json";

    function safeParseArray(text) {
        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    async function getUserSubmissionHistory(userId) {
        const fileData = await github.getFile(SUBMISSIONS_FILE);
        const pending = fileData ? safeParseArray(fileData.content) : [];
        const minePending = pending
            .filter((entry) => entry?.submitted_by?.id === userId)
            .map((entry) => ({ ...entry, status: 'pending' }));

        const logFile = await github.getFile(LOG_FILE);
        const history = logFile ? safeParseArray(logFile.content) : [];
        const mineHistory = history.filter((entry) => entry?.submitted_by?.id === userId);

        return [...minePending, ...mineHistory].sort((a, b) => {
            const aTime = Date.parse(a?.timestamp || a?.reviewed_at || 0) || 0;
            const bTime = Date.parse(b?.timestamp || b?.reviewed_at || 0) || 0;
            return bTime - aTime;
        });
    }

    async function ensureProfileForUser(userId, gdName) {
        if (!userId) return;

        const fileData = await github.getFile(PROFILE_FILE);
        const profiles = fileData ? safeParseArray(fileData.content) : [];
        const idx = profiles.findIndex((entry) => entry?.user_id === userId);
        const now = new Date().toISOString();
        let changed = false;

        if (idx === -1) {
            profiles.push({
                user_id: userId,
                gd_name: gdName,
                region: '',
                updated_at: now,
            });
            changed = true;
        } else if (!profiles[idx]?.gd_name && gdName) {
            profiles[idx] = {
                ...profiles[idx],
                gd_name: gdName,
                updated_at: now,
            };
            changed = true;
        }

        if (changed) {
            await github.putFile(
                PROFILE_FILE,
                JSON.stringify(profiles, null, 4),
                `Auto-create profile for ${gdName || userId}`,
                fileData?.sha ?? null,
            );
        }
    }

    let github;
    try {
        github = createGitHubContentClient(env);
    } catch (e) {
        return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
    }

    if (request.method === "GET") {
        const url = new URL(request.url);
        const isMine = url.searchParams.get('mine') === '1'
            || url.searchParams.get('scope') === 'mine';
        const userIdParam = url.searchParams.get('user_id');

        if (isMine) {
            const { response, userId } = requireAuth(request);
            if (response) {
                return response;
            }
            const combined = await getUserSubmissionHistory(userId);
            return jsonResponse(combined);
        }

        if (userIdParam) {
            const { response } = requireAdmin(request, env);
            if (response) {
                return response;
            }

            const combined = await getUserSubmissionHistory(userIdParam);
            return jsonResponse(combined);
        }

        const { response } = requireAdmin(request, env);
        if (response) {
            return response;
        }

        const fileData = await github.getFile(SUBMISSIONS_FILE);
        return jsonResponse(fileData ? fileData.content : '[]');
    }

    if (request.method === "POST") {
        const auth = requireAuth(request);
        if (auth.response) {
            return auth.response;
        }

        let data;
        try {
            data = await request.json();
        } catch {
            return new Response('Invalid JSON', { status: 400 });
        }

        const player = String(data?.player ?? '').trim();
        const level = String(data?.level ?? '').trim();
        const video = String(data?.video ?? '').trim();
        const raw = String(data?.raw ?? '').trim();
        const hz = Number(data?.hz);
        const percent = Number(data?.percent);
        const note = String(data?.note ?? '').trim();

        if (!player || !level || !video || !raw || !Number.isFinite(hz) || !Number.isFinite(percent)) {
            return new Response('Missing required fields', { status: 400 });
        }

        const id = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : Date.now() + Math.random().toString(36).substring(2, 9);

        const submittedByName = getDiscordUsername(request);
        const submittedBy = {
            id: auth.userId,
            username: submittedByName,
        };

        const newSubmission = {
            id,
            player,
            level,
            video,
            raw,
            hz,
            percent,
            note,
            submitted_by: submittedBy,
            timestamp: new Date().toISOString(),
        };

        await ensureProfileForUser(auth.userId, player);

        const fileData = await github.getFile(SUBMISSIONS_FILE);
        const sha = fileData?.sha ?? null;
        let submissions = [];

        if (fileData) {
            try {
                submissions = JSON.parse(fileData.content);
                if (!Array.isArray(submissions)) {
                    submissions = [];
                }
            } catch {
                submissions = [];
            }
        }

        submissions.push(newSubmission);

        await github.putFile(
            SUBMISSIONS_FILE,
            JSON.stringify(submissions, null, 4),
            `New record submission for ${level}`,
            sha,
        );

        return jsonResponse({ success: true });
    }

    if (request.method === "DELETE") {
        const { response, userId: adminId } = requireAdmin(request, env);
        if (response) {
            return response;
        }

        const url = new URL(request.url);
        const subId = url.searchParams.get("id");
        const reason = url.searchParams.get("reason") || "No reason provided";
        const status = url.searchParams.get("status")
            || (url.searchParams.has("reason") ? 'denied' : 'approved');
        if (!subId) return new Response("Missing id", { status: 400 });

        const fileData = await github.getFile(SUBMISSIONS_FILE);
        if (!fileData) return jsonResponse({ success: true });

        let submissions = [];
        try {
            submissions = JSON.parse(fileData.content);
            if (!Array.isArray(submissions)) {
                submissions = [];
            }
        } catch {
            submissions = [];
        }

        const removed = submissions.find((s) => s.id === subId);
        const newSubmissions = submissions.filter(s => s.id !== subId);

        let commitMsg = `Removed submission ${subId}`;
        if (url.searchParams.has("reason")) {
            commitMsg = `Denied submission ${subId}: ${reason}`;
        }

        if (removed) {
            const logFile = await github.getFile(LOG_FILE);
            const logEntries = logFile ? safeParseArray(logFile.content) : [];
            const logEntry = {
                ...removed,
                status,
                review_reason: url.searchParams.has("reason") ? reason : null,
                reviewed_by: adminId,
                reviewed_at: new Date().toISOString(),
            };

            logEntries.push(logEntry);

            await github.putFile(
                LOG_FILE,
                JSON.stringify(logEntries, null, 4),
                `Submission ${status}: ${removed.level}`,
                logFile?.sha ?? null,
            );
        }

        await github.putFile(
            SUBMISSIONS_FILE,
            JSON.stringify(newSubmissions, null, 4),
            commitMsg,
            fileData.sha,
        );

        return jsonResponse({ success: true });
    }

    return new Response("Method not allowed", { status: 405 });
}