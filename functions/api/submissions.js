import {
    createGitHubContentClient,
    jsonResponse,
    requireAdmin,
} from '../_shared.js';

export async function onRequest(context) {
    const { request, env } = context;

    const SUBMISSIONS_FILE = "data/_submissions.json";

    let github;
    try {
        github = createGitHubContentClient(env);
    } catch (e) {
        return jsonResponse({ error: String(e?.message ?? e) }, { status: 500 });
    }

    if (request.method === "GET") {
        const { response } = requireAdmin(request, env);
        if (response) {
            return response;
        }

        const fileData = await github.getFile(SUBMISSIONS_FILE);
        return jsonResponse(fileData ? fileData.content : '[]');
    }

    if (request.method === "POST") {
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

        const newSubmission = {
            id,
            player,
            level,
            video,
            raw,
            hz,
            percent,
            note,
            timestamp: new Date().toISOString(),
        };

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
        const { response } = requireAdmin(request, env);
        if (response) {
            return response;
        }

        const url = new URL(request.url);
        const subId = url.searchParams.get("id");
        const reason = url.searchParams.get("reason") || "No reason provided";
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
        
        const newSubmissions = submissions.filter(s => s.id !== subId);

        let commitMsg = `Removed submission ${subId}`;
        if (url.searchParams.has("reason")) {
            commitMsg = `Denied submission ${subId}: ${reason}`;
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