export async function onRequest(context) {
    const { request, env } = context;

    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return new Response("Unauthorized", { status: 401 });

    const sessionMatch = cookieHeader.match(/session=([^;]+)/);
    if (!sessionMatch) return new Response("Unauthorized", { status: 401 });

    const userId = sessionMatch[1];
    
    const adminIdsStr = env.ADMIN_DISCORD_ID || "";
    const adminIds = adminIdsStr.split(",").map(id => id.trim());
    
    if (!adminIds.includes(userId)) {
        return new Response("Forbidden: You do not have admin permissions.", { status: 403 });
    }

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

    if (request.method === "POST") {
        const reqData = await request.json();
        const fileId = reqData.id;
        const demonData = reqData.demonData; 
        const targetPosition = parseInt(reqData.position);
        
        const filename = `data/${fileId}.json`;

        // Save
        const demonFile = await getFile(filename);
        const fileSha = demonFile ? demonFile.sha : null;
        const successFile = await commitFile(filename, JSON.stringify(demonData, null, 4), `Admin Panel: Update ${fileId} data`, fileSha);
        
        if (!successFile) {
            return new Response(JSON.stringify({ error: "Failed to commit demon data" }), { status: 500 });
        }

        // Update _list.json and _list_bundled.json
        if (!isNaN(targetPosition) && targetPosition > 0) {
            const listFile = await getFile("data/_list.json");
            const bundledFile = await getFile("data/_list_bundled.json");

            if (listFile) {
                let listArray = [];
                try { listArray = JSON.parse(listFile.content); } catch (e) {}

                const oldIndex = listArray.indexOf(fileId);

                // Remove level from current position
                listArray = listArray.filter(x => x !== fileId);

                // Insert into new position
                const insertIndex = targetPosition - 1; // 1-based index to 0-based
                listArray.splice(insertIndex, 0, fileId);

                await commitFile("data/_list.json", JSON.stringify(listArray, null, 4), `Admin Panel: Move ${fileId} to #${targetPosition}`, listFile.sha);

                if (bundledFile) {
                    let bundledArray = [];
                    try { bundledArray = JSON.parse(bundledFile.content); } catch (e) {}

                    // Remove from bundle (trusting oldIndex, fallback to name)
                    if (oldIndex !== -1 && oldIndex < bundledArray.length) {
                        bundledArray.splice(oldIndex, 1);
                    } else {
                        const fallbackIdx = bundledArray.findIndex(x => x.name === demonData.name);
                        if (fallbackIdx !== -1) bundledArray.splice(fallbackIdx, 1);
                    }

                    // Insert into new position
                    bundledArray.splice(insertIndex, 0, demonData);

                    await commitFile("data/_list_bundled.json", JSON.stringify(bundledArray), `Admin Panel: Update bundled data for ${fileId}`, bundledFile.sha);
                }
            }
        }

        return new Response(JSON.stringify({ success: true, message: `Updated ${fileId} and placements.` }));
    }
    
    if (request.method === "DELETE") {
        const url = new URL(request.url);
        const fileId = url.searchParams.get("id");
        const filename = `data/${fileId}.json`;
        
        const fileData = await getFile(filename);
        if (!fileData) return new Response(JSON.stringify({ error: "File not found" }), { status: 404 });

        // Delete the demon file
        const resDel = await fetch(`${githubApiUrl}/${filename}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                "User-Agent": "Cloudflare-Pages"
            },
            body: JSON.stringify({
                message: `Admin Panel: Delete ${fileId}`,
                sha: fileData.sha,
                branch: "main"
            })
        });

        // Also remove from _list.json and _list_bundled.json
        const listFile = await getFile("data/_list.json");
        const bundledFile = await getFile("data/_list_bundled.json");
        if (listFile) {
            let listArray = [];
            try { listArray = JSON.parse(listFile.content); } catch (e) {}
            
            const oldIndex = listArray.indexOf(fileId);
            const newArray = listArray.filter(x => x !== fileId);
            await commitFile("data/_list.json", JSON.stringify(newArray, null, 4), `Admin Panel: Remove ${fileId} from list`, listFile.sha);
            
            if (bundledFile && oldIndex !== -1) {
                let bundledArray = [];
                try { bundledArray = JSON.parse(bundledFile.content); } catch (e) {}
                
                if (oldIndex < bundledArray.length) {
                    bundledArray.splice(oldIndex, 1);
                    await commitFile("data/_list_bundled.json", JSON.stringify(bundledArray), `Admin Panel: Remove ${fileId} from bundled list`, bundledFile.sha);
                }
            }
        }

        if (resDel.ok) return new Response(JSON.stringify({ success: true }));
        return new Response(JSON.stringify({ error: "Failed to delete" }), { status: 500 });
    }

    return new Response("Method not allowed", { status: 405 });
}
