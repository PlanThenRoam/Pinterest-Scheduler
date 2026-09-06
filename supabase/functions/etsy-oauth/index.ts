import { createClient } from "npm:@supabase/supabase-js@2.115.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ETSY_API_KEY = Deno.env.get("ETSY_API_KEY") || "";
const ETSY_SHARED_SECRET = Deno.env.get("ETSY_SHARED_SECRET") || "";
const FUNCTION_URL = SUPABASE_URL + "/functions/v1/etsy-oauth";
const CALLBACK_URL = FUNCTION_URL + "/callback";
const APP_URL = "https://planthenroam.github.io/Pinterest-Scheduler/";
const ALLOWED_ORIGIN = "https://planthenroam.github.io";
const SCOPES = "shops_r listings_r listings_w";

const cors = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "vary": "Origin",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(title: string, message: string, ok: boolean) {
  const target = APP_URL + "?etsy=" + (ok ? "connected" : "error") + "#settings";
  const safeTitle = title.replace(/[<>&"]/g, "");
  const safeMessage = message.replace(/[<>&"]/g, "");
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="2;url=${target}"><title>${safeTitle}</title><style>body{font-family:system-ui;background:#f5f2eb;color:#17312e;display:grid;min-height:100vh;place-items:center;margin:0;padding:24px}.card{max-width:520px;background:#fffefa;border:1px solid #dadfd4;border-radius:18px;padding:28px;text-align:center}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:10px;background:#215a4b;color:white;text-decoration:none;font-weight:700}</style></head><body><main class="card"><h1>${safeTitle}</h1><p>${safeMessage}</p><a href="${target}">Return to Seller Tools</a></main><script>setTimeout(()=>location.replace(${JSON.stringify(target)}),800)</script></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function randomUrlSafe(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function challenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function credentialsReady() {
  return Boolean(ETSY_API_KEY && ETSY_SHARED_SECRET);
}

async function ownerFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sign in to Seller Tools first.");
  const token = auth.slice(7);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Your Seller Tools session has expired.");
  const { data: owner } = await admin.from("app_owners").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!owner) throw new Error("Owner access is required.");
  return data.user;
}

async function etsyFetch(path: string, accessToken: string) {
  const response = await fetch("https://api.etsy.com/v3/application" + path, {
    headers: {
      "x-api-key": ETSY_API_KEY + ":" + ETSY_SHARED_SECRET,
      "authorization": "Bearer " + accessToken,
      "accept": "application/json",
    },
  });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!response.ok) throw new Error(body?.error || body?.message || `Etsy returned HTTP ${response.status}.`);
  return body;
}

async function start(req: Request) {
  if (!credentialsReady()) return json({ error: "Etsy secrets are not configured." }, 503);
  const user = await ownerFromRequest(req);
  await admin.from("etsy_oauth_states").delete().eq("user_id", user.id);
  const state = randomUrlSafe(32);
  const verifier = randomUrlSafe(64);
  const codeChallenge = await challenge(verifier);
  const { error } = await admin.from("etsy_oauth_states").insert({
    state,
    user_id: user.id,
    code_verifier: verifier,
    redirect_to: APP_URL,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  const params = new URLSearchParams({
    response_type: "code",
    redirect_uri: CALLBACK_URL,
    scope: SCOPES,
    client_id: ETSY_API_KEY,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return json({ authorization_url: "https://www.etsy.com/oauth/connect?" + params.toString() });
}

async function callback(url: URL) {
  if (url.searchParams.get("error")) return html("Etsy was not connected", url.searchParams.get("error_description") || "Authorisation was cancelled.", false);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || !code) return html("Etsy was not connected", "The callback was missing its security state or authorisation code.", false);
  const { data: record, error } = await admin.from("etsy_oauth_states").select("*").eq("state", state).maybeSingle();
  if (error || !record) return html("Etsy was not connected", "This authorisation request is invalid or has already been used.", false);
  await admin.from("etsy_oauth_states").delete().eq("state", state);
  if (new Date(record.expires_at).getTime() < Date.now()) return html("Etsy was not connected", "This authorisation request expired. Start again from Seller Tools.", false);
  if (!credentialsReady()) return html("Etsy was not connected", "The server credentials are unavailable.", false);

  const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "accept": "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ETSY_API_KEY,
      redirect_uri: CALLBACK_URL,
      code,
      code_verifier: record.code_verifier,
    }),
  });
  const tokenText = await tokenResponse.text();
  let token: any = {};
  try { token = tokenText ? JSON.parse(tokenText) : {}; } catch { token = { error_description: tokenText }; }
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
    return html("Etsy was not connected", token.error_description || token.error || "Etsy did not issue an access token.", false);
  }

  const etsyUserId = String(token.access_token).split(".")[0];
  if (!/^\d+$/.test(etsyUserId)) return html("Etsy was not connected", "Etsy returned an unexpected user identity.", false);
  let shops: any;
  try { shops = await etsyFetch("/users/" + encodeURIComponent(etsyUserId) + "/shops", token.access_token); }
  catch (e) { return html("Etsy was not connected", String((e as Error).message || e), false); }
  const shop =
    (Array.isArray(shops?.results) ? shops.results[0] : null) ||
    (Array.isArray(shops?.shops) ? shops.shops[0] : null) ||
    (Array.isArray(shops) ? shops[0] : null) ||
    (shops?.shop_id ? shops : null) ||
    (shops?.shop?.shop_id ? shops.shop : null) ||
    (shops?.results?.shop_id ? shops.results : null);
  if (!shop?.shop_id) {
    const responseKeys = shops && typeof shops === "object" ? Object.keys(shops).slice(0, 8).join(", ") : typeof shops;
    return html("Etsy was not connected", "Etsy authorised the account but returned no active shop record. Response fields: " + responseKeys, false);
  }

  const expiresAt = new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString();
  const { error: saveError } = await admin.from("etsy_credentials").upsert({
    user_id: record.user_id,
    etsy_user_id: etsyUserId,
    shop_id: String(shop.shop_id),
    shop_name: String(shop.shop_name || shop.title || "Etsy shop"),
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    scopes: token.scope || SCOPES,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (saveError) return html("Etsy was not connected", "The secure Etsy connection could not be saved.", false);

  await admin.from("platform_connections").update({
    status: "connected",
    account_label: String(shop.shop_name || shop.title || "Etsy shop"),
    metadata: {
      api_access: "personal",
      oauth_connected: true,
      publish_enabled: false,
      shop_id: String(shop.shop_id),
      note: "Connected to " + String(shop.shop_name || shop.title || "Etsy shop") + " · publishing test pending",
    },
    updated_at: new Date().toISOString(),
  }).eq("platform", "etsy");

  return html("Etsy connected", "Your shop was verified securely. You can return to Seller Tools.", true);
}

async function status(req: Request) {
  const user = await ownerFromRequest(req);
  const { data } = await admin.from("etsy_credentials").select("etsy_user_id,shop_id,shop_name,scopes,expires_at,updated_at").eq("user_id", user.id).maybeSingle();
  return json({
    configured: credentialsReady(),
    connected: Boolean(data),
    shop: data ? { id: data.shop_id, name: data.shop_name, scopes: data.scopes } : null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname.endsWith("/callback")) return await callback(url);
    if (req.method === "GET" && url.pathname.endsWith("/health")) return json({ ok: true, configured: credentialsReady() });
    if (req.method === "POST" && url.pathname.endsWith("/start")) return await start(req);
    if (req.method === "GET" && url.pathname.endsWith("/status")) return await status(req);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    return json({ error: String((error as Error).message || error) }, 400);
  }
});
