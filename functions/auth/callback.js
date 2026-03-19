export async function onRequest(context) {
    const request = context.request;
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    
    if (!code) return new Response("No code provided", { status: 400 });

    const clientId = context.env.DISCORD_CLIENT_ID || "1484307401745371367";
    const clientSecret = context.env.DISCORD_CLIENT_SECRET || "NoCM6bNVboGhLqQg-pTvDoR89OGQmJHn";
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

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) return new Response("Failed to get token", { status: 400 });

    // Get user info
    const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` }
    });
    
    const userData = await userResponse.json();

    const adminIdsStr = context.env.ADMIN_DISCORD_ID || ""; 
    const adminIds = adminIdsStr.split(",").map(id => id.trim());
    const isAdmin = adminIds.includes(userData.id);

    const headers = new Headers();
    // HttpOnly session
    headers.append("Set-Cookie", `session=${userData.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    // Expose info to frontend
    headers.append("Set-Cookie", `discord_username=${encodeURIComponent(userData.username)}; Path=/; Secure; SameSite=Lax; Max-Age=86400`);
    headers.append("Set-Cookie", `is_admin=${isAdmin}; Path=/; Secure; SameSite=Lax; Max-Age=86400`);
    
    headers.append("Location", "/admin.html");

    return new Response("", { status: 302, headers });
}
