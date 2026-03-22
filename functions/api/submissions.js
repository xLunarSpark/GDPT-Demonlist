export async function onRequest(context) {
    const { request, env } = context;

    const token = env.GITHUB_TOKEN;
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;

    if (!token || !owner || !repo) {
        return new Response(JSON.stringify({ error: "Missing GitHub credentials in Cloudflare Env" }), { status: 500 });
    }

    const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;

    async function getFile(path) {
        const res = await fetch(`${githubApiUrl}/${path}`, {
            headers: { "Authorization": `Bearer ${token}`, "User-Agent": "Cloudflare-Pages" }
        });
        if (res.ok) {
            const data = await res.json();
            return { sha: data.sha, content: decodeURIComponent(escape(atob(data.content))) };
        }
        return null;
    }

    async function commitFile(path, content, message, sha = null) {
        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),
            branch: "main"
        };
        if (sha) body.sha = sha;

        const res = await fetch(`${githubApiUrl}/${path}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "User-Agent": "Cloudflare-Pages"
            },
            body: JSON.stringify(body)
        });
        return res.ok;
    }

    const SUBMISSIONS_FILE = "data/_submissions.json";

    if (request.method === "GET") {
        const cookieHeader = request.headers.get("Cookie");
        if (!cookieHeader) return new Response("Unauthorized", { status: 401 });

        const sessionMatch = cookieHeader.match(/session=([^;]+)/);
        if (!sessionMatch) return new Response("Unauthorized", { status: 401 });

        const userId = sessionMatch[1];
        const adminIdsStr = env.ADMIN_DISCORD_ID || "";
        const adminIds = adminIdsStr.split(",").map(id => id.trim());

        if (!adminIds.includes(userId)) {
            return new Response("Forbidden", { status: 403 });
        }

        const fileData = await getFile(SUBMISSIONS_FILE);
        if (!fileData) {
            return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response(fileData.content, { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "POST") {
        const data = await request.json();
        
        if (!data.player || !data.level || !data.video || !data.raw || !data.hz || !data.percent) {
            return new Response("Missing required fields", { status: 400 });
        }

        const newSubmission = {
            id: Date.now() + Math.random().toString(36).substring(2, 9),
            player: data.player,
            level: data.level,
            video: data.video,
            raw: data.raw,
            hz: data.hz,
            percent: data.percent,
            note: data.note || "",
            timestamp: new Date().toISOString()
        };

        const fileData = await getFile(SUBMISSIONS_FILE);
        let submissions = [];
        let sha = null;
        
        if (fileData) {
            try {
                submissions = JSON.parse(fileData.content);
            } catch (e) {}
            sha = fileData.sha;
        }

        submissions.push(newSubmission);

        const success = await commitFile(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 4), `New record submission for ${data.level}`, sha);
        
        if (success) {
            return new Response(JSON.stringify({ success: true }));
        } else {
            return new Response(JSON.stringify({ error: "Failed to save submission" }), { status: 500 });
        }
    }

    if (request.method === "DELETE") {
        const cookieHeader = request.headers.get("Cookie");
        if (!cookieHeader) return new Response("Unauthorized", { status: 401 });
        const sessionMatch = cookieHeader.match(/session=([^;]+)/);
        if (!sessionMatch) return new Response("Unauthorized", { status: 401 });
        const userId = sessionMatch[1];
        const adminIdsStr = env.ADMIN_DISCORD_ID || "";
        const adminIds = adminIdsStr.split(",").map(id => id.trim());
        if (!adminIds.includes(userId)) return new Response("Forbidden", { status: 403 });

        const url = new URL(request.url);
        const subId = url.searchParams.get("id");
        const reason = url.searchParams.get("reason") || "No reason provided";
        if (!subId) return new Response("Missing id", { status: 400 });

        const fileData = await getFile(SUBMISSIONS_FILE);
        if (!fileData) return new Response(JSON.stringify({ success: true }));

        let submissions = [];
        try { submissions = JSON.parse(fileData.content); } catch (e) {}
        
        const newSubmissions = submissions.filter(s => s.id !== subId);

        let commitMsg = `Removed submission ${subId}`;
        if (url.searchParams.has("reason")) {
            commitMsg = `Denied submission ${subId}: ${reason}`;
        }

        await commitFile(SUBMISSIONS_FILE, JSON.stringify(newSubmissions, null, 4), commitMsg, fileData.sha);
        
        return new Response(JSON.stringify({ success: true }));
    }

    return new Response("Method not allowed", { status: 405 });
}