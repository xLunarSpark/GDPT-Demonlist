export async function onRequest(context) {
    const clientId = context.env.DISCORD_CLIENT_ID || "1484307401745371367";
    const redirectUri = `${new URL(context.request.url).origin}/auth/callback`;
    
    const discordLoginUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    
    return Response.redirect(discordLoginUrl, 302);
}
