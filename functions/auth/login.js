export async function onRequest(context) {
    const clientId = context.env.DISCORD_CLIENT_ID;
    if (!clientId) {
        return new Response('Missing Discord client id in Cloudflare Env', { status: 500 });
    }

    const url = new URL(context.request.url);
    const redirectUri = `${url.origin}/auth/callback`;
    const requestedRedirect = url.searchParams.get('redirect');

    function sanitizeRedirect(value) {
        if (!value || typeof value !== 'string') {
            return '/admin.html';
        }
        if (!value.startsWith('/') || value.startsWith('//')) {
            return '/admin.html';
        }
        return value;
    }

    const redirectPath = sanitizeRedirect(requestedRedirect);
    const state = encodeURIComponent(redirectPath);
    
    const discordLoginUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify&state=${state}`;
    
    return Response.redirect(discordLoginUrl, 302);
}
