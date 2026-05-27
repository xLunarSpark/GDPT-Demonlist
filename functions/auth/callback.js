import { parseIdSet } from '../_shared.js';

export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    
    if (!code) return new Response("No code provided", { status: 400 });

    const clientId = context.env.DISCORD_CLIENT_ID;
    const clientSecret = context.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return new Response('Missing Discord OAuth credentials in Cloudflare Env', { status: 500 });
    }
    const redirectUri = `${url.origin}/auth/callback`;

    // Exchange code for token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: redirectUri
        })
    });

    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenData?.access_token) {
        return new Response('Failed to get token', { status: 400 });
    }

    // Get user info
    const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` }
    });
    
    const userData = await userResponse.json().catch(() => null);
    if (!userResponse.ok || !userData?.id) {
        return new Response('Failed to get user info', { status: 400 });
    }

    const adminIds = parseIdSet(context.env.ADMIN_DISCORD_ID);
    const isAdmin = adminIds.has(userData.id);

    const headers = new Headers();
    // HttpOnly session
    headers.append("Set-Cookie", `session=${userData.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    // Expose info to frontend
    headers.append("Set-Cookie", `discord_username=${encodeURIComponent(userData.username)}; Path=/; Secure; SameSite=Lax; Max-Age=86400`);
    headers.append("Set-Cookie", `is_admin=${isAdmin ? '1' : '0'}; Path=/; Secure; SameSite=Lax; Max-Age=86400`);
    
    function sanitizeRedirect(value) {
        if (!value || typeof value !== 'string') {
            return '/admin.html';
        }
        if (!value.startsWith('/') || value.startsWith('//')) {
            return '/admin.html';
        }
        return value;
    }

    let decodedState = null;
    if (state) {
        try {
            decodedState = decodeURIComponent(state);
        } catch {
            decodedState = null;
        }
    }

    const redirectPath = sanitizeRedirect(decodedState);

    headers.append("Location", redirectPath);

    return new Response("", { status: 302, headers });
}
