import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const etsyKey = Deno.env.get("ETSY_API_KEY") || "";
const etsySecret = Deno.env.get("ETSY_SHARED_SECRET") || "";
const apiRoot = "https://openapi.etsy.com/v3/application";
const templateListingId = "4568932542";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Etsy publishing failed.";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mediaByRole(project: any, role: string) {
  return (Array.isArray(project.media) ? project.media : []).find((item: any) => item?.role === role);
}

function imageItems(project: any) {
  const ordered = [mediaByRole(project, "thumbnail")];
  for (let index = 1; index <= 5; index += 1) ordered.push(mediaByRole(project, `listing-image-${index}`));
  return ordered.filter(Boolean);
}

function validateProject(project: any) {
  if (!project || project.kind !== "etsy") throw new Error("Etsy project not found.");
  if (!["ready", "approved", "failed", "publishing"].includes(project.status)) throw new Error("This Etsy project is not ready to publish.");
  const manifest = project.manifest || {};
  const title = String(manifest.title || project.title || "").trim();
  const description = String(manifest.description || "").trim();
  const tags = Array.isArray(manifest.tags) ? manifest.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [];
  if (!title || title.length > 140) throw new Error("The Etsy title must be between 1 and 140 characters.");
  if (!description) throw new Error("The Etsy description is missing.");
  if (tags.length !== 13 || new Set(tags.map((tag: string) => tag.toLowerCase())).size !== 13) throw new Error("Etsy requires exactly 13 unique tags.");
  if (tags.some((tag: string) => tag.length > 20)) throw new Error("Each Etsy tag must be 20 characters or fewer.");
  const editMode = manifest.mode === "edit" || Boolean(manifest.listingId || manifest.etsyListingId);
  const images = editMode
    ? (Array.isArray(project.media) ? project.media : []).filter((item: any) => item?.role === "thumbnail" || String(item?.role || "").startsWith("listing-image"))
    : imageItems(project);
  if (!editMode && images.length !== 6) throw new Error("Attach the thumbnail and all five listing images before publishing.");
  if (editMode && images.length < 1 && !title && !description) throw new Error("Add at least one listing change.");
  const pdf = mediaByRole(project, "customer-pdf");
  if (!editMode && !pdf) throw new Error("Attach the customer PDF before publishing.");
  return { manifest, title, description, tags, images, pdf, editMode };
}

async function etsyFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("x-api-key", `${etsyKey}:${etsySecret}`);
  headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(apiRoot + path, { ...init, headers });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!response.ok) {
    const message = body?.error || body?.error_description || body?.message || `Etsy returned HTTP ${response.status}.`;
    throw new Error(String(message));
  }
  return body;
}

async function accessToken(admin: any, credential: any) {
  const expiresAt = new Date(credential.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60_000) return credential.access_token;
  const form = new URLSearchParams({ grant_type: "refresh_token", client_id: etsyKey, refresh_token: credential.refresh_token });
  const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || "Etsy sign-in expired. Reconnect Etsy in Settings.");
  const expires = new Date(Date.now() + numberValue(body.expires_in, 3600) * 1000).toISOString();
  const update = {
    access_token: body.access_token,
    refresh_token: body.refresh_token || credential.refresh_token,
    expires_at: expires,
    scopes: body.scope || credential.scopes,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("etsy_credentials").update(update).eq("user_id", credential.user_id);
  if (error) throw error;
  return body.access_token;
}

async function inferTaxonomy(shopId: string, token: string) {
  const body = await etsyFetch(`/shops/${shopId}/listings/active?limit=25`, token);
  const counts = new Map<number, number>();
  for (const listing of Array.isArray(body.results) ? body.results : []) {
    const id = Number(listing?.taxonomy_id);
    if (id > 0) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

function moneyValue(price: any, fallback = 14.99) {
  if (typeof price === "number") return price;
  if (price && Number(price.amount) >= 0) return Number(price.amount) / numberValue(price.divisor, 100);
  return fallback;
}

function appendArray(form: URLSearchParams, name: string, values: unknown) {
  if (!Array.isArray(values)) return;
  for (const value of values) if (String(value).trim()) form.append(name, String(value).trim());
}

async function createDraft(shopId: string, token: string, data: any, template: any) {
  const form = new URLSearchParams();
  form.set("quantity", String(Math.round(numberValue(data.manifest.quantity, 999))));
  form.set("title", data.title);
  form.set("description", data.description);
  form.set("price", numberValue(data.manifest.price, 14.99).toFixed(2));
  form.set("who_made", String(data.manifest.whoMade || template.who_made || "i_did"));
  form.set("when_made", String(data.manifest.whenMade || template.when_made || "2020_2026"));
  form.set("taxonomy_id", String(data.taxonomyId));
  form.set("type", "download");
  form.set("is_supply", String(data.manifest.isSupply ?? template.is_supply ?? false));
  form.set("is_taxable", String(data.manifest.isTaxable ?? template.is_taxable ?? true));
  form.set("should_auto_renew", String(data.manifest.autoRenew ?? template.should_auto_renew ?? true));
  for (const tag of data.tags) form.append("tags", tag);
  return await etsyFetch(`/shops/${shopId}/listings`, token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
}

async function storageFile(admin: any, item: any) {
  const { data, error } = await admin.storage.from("etsy-assets").download(item.path);
  if (error || !data) throw new Error(`Could not read ${item.name || item.role} from private storage.`);
  return data;
}

async function uploadImage(admin: any, shopId: string, listingId: string, token: string, item: any, rank: number, altText: string, overwrite = false) {
  const blob = await storageFile(admin, item);
  const form = new FormData();
  form.set("image", blob, item.name || `listing-image-${rank}.jpg`);
  form.set("rank", String(rank));
  if (overwrite) form.set("overwrite", "true");
  if (altText) form.set("alt_text", altText.slice(0, 500));
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}/images`, token, { method: "POST", body: form });
}

async function updateListing(shopId: string, listingId: string, token: string, data: any, original: any) {
  const m = data.manifest;
  const form = new URLSearchParams();
  form.set("title", data.title);
  form.set("description", data.description);
  form.set("quantity", String(Math.round(numberValue(m.quantity, original.quantity || 999))));
  form.set("price", numberValue(m.price, moneyValue(original.price)).toFixed(2));
  form.set("taxonomy_id", String(Math.round(numberValue(m.taxonomyId || m.taxonomy_id, original.taxonomy_id))));
  form.set("who_made", String(m.whoMade || original.who_made || "i_did"));
  form.set("when_made", String(m.whenMade || original.when_made || "2020_2026"));
  form.set("is_supply", String(m.isSupply ?? original.is_supply ?? false));
  form.set("is_taxable", String(m.isTaxable ?? original.is_taxable ?? true));
  form.set("should_auto_renew", String(m.autoRenew ?? original.should_auto_renew ?? true));
  form.set("type", "download");
  if (m.shopSectionId || original.shop_section_id) form.set("shop_section_id", String(m.shopSectionId || original.shop_section_id));
  appendArray(form, "tags", data.tags);
  appendArray(form, "materials", m.materials ?? original.materials);
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}`, token, {
    method: "PATCH",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
}

async function uploadPdf(admin: any, shopId: string, listingId: string, token: string, item: any) {
  const blob = await storageFile(admin, item);
  const form = new FormData();
  form.set("file", blob, item.name || "planner.pdf");
  form.set("name", String(item.name || "planner.pdf").slice(0, 70));
  form.set("rank", "1");
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}/files`, token, { method: "POST", body: form });
}

async function activate(shopId: string, listingId: string, token: string) {
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}`, token, {
    method: "PATCH",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ state: "active" }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/health")) return json({ ok: true, configured: Boolean(etsyKey && etsySecret) });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed." }, 405);
  if (!etsyKey || !etsySecret) return json({ error: "Etsy API credentials are not configured." }, 503);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in to Seller Tools first." }, 401);
  const userClient = createClient(projectUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const tokenValue = authorization.slice(7);
  const { data: userData, error: userError } = await userClient.auth.getUser(tokenValue);
  if (userError || !userData.user) return json({ error: "Your Seller Tools session has expired." }, 401);
  const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
  const { data: owner } = await admin.from("app_owners").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!owner) return json({ error: "Owner access is required." }, 403);

  let projectId = "";
  try {
    const { data: credential, error: credentialError } = await admin.from("etsy_credentials").select("*").eq("user_id", userData.user.id).single();
    if (credentialError || !credential) throw new Error("Connect your Etsy shop in Settings first.");
    const token = await accessToken(admin, credential);
    if (req.method === "GET") {
      const state = ["active", "draft", "inactive", "expired", "sold_out"].includes(url.searchParams.get("state") || "") ? url.searchParams.get("state")! : "active";
      const listings = await etsyFetch(`/shops/${credential.shop_id}/listings?state=${state}&limit=100&includes=Images,Personalization`, token);
      return json({ ok: true, listings: (listings.results || []).map((item: any) => ({
        listing_id: String(item.listing_id), title: item.title, state: item.state,
        thumbnail: item.images?.[0]?.url_170x135 || item.images?.[0]?.url_570xN || "",
        image_count: item.images?.length || 0,
      })) });
    }
    const body = await req.json();
    if (body.action === "prepare_edit") {
      const listingId = String(body.listing_id || "");
      if (!/^\d+$/.test(listingId)) throw new Error("Choose an Etsy listing.");
      const existing = await etsyFetch(`/listings/${listingId}?includes=Images,Personalization`, token);
      if (String(existing.user_id || "") && String(existing.user_id) !== String(credential.etsy_user_id)) throw new Error("That listing does not belong to the connected Etsy account.");
      const manifest = {
        mode: "edit", listingId, title: existing.title, description: existing.description,
        price: moneyValue(existing.price), quantity: existing.quantity, tags: existing.tags || [],
        taxonomyId: existing.taxonomy_id, whoMade: existing.who_made, whenMade: existing.when_made,
        isSupply: existing.is_supply, isTaxable: existing.is_taxable, autoRenew: existing.should_auto_renew,
        shopSectionId: existing.shop_section_id, materials: existing.materials || [],
        altText: (existing.images || []).map((image: any) => image.alt_text || ""),
        existingImages: (existing.images || []).map((image: any) => ({ id: String(image.listing_image_id), rank: image.rank, url: image.url_570xN, altText: image.alt_text || "" })),
        personalization: existing.personalization || null,
      };
      const { data: created, error: createError } = await admin.from("review_projects").insert({
        kind: "etsy", title: existing.title, status: "ready", source: "chatgpt",
        manifest, media: [], platform_id: listingId,
      }).select("id,title,status,platform_id").single();
      if (createError) throw createError;
      return json({ ok: true, project: created });
    }
    projectId = String(body.project_id || "");
    if (!projectId) throw new Error("Choose an Etsy project to publish.");
    const { data: project, error: projectError } = await admin.from("review_projects").select("*").eq("id", projectId).single();
    if (projectError) throw projectError;
    const listing = validateProject(project);
    const manifest = { ...(project.manifest || {}) };
    const checkpoint = { ...(manifest.etsyPublish || {}) };
    const template = await etsyFetch(`/listings/${templateListingId}?includes=Images,Personalization`, token);
    const taxonomyId = Math.round(numberValue(manifest.taxonomyId || manifest.taxonomy_id, template.taxonomy_id)) || await inferTaxonomy(credential.shop_id, token);
    if (!taxonomyId) throw new Error("Add an Etsy taxonomy ID in Edit before publishing.");
    await admin.from("review_projects").update({ status: "publishing", last_error: null }).eq("id", projectId);

    let listingId = listing.editMode ? String(manifest.listingId || manifest.etsyListingId || project.platform_id || "") : String(project.platform_id || checkpoint.listingId || "");
    if (listing.editMode) {
      if (!listingId) throw new Error("The existing Etsy listing ID is missing.");
      const original = await etsyFetch(`/listings/${listingId}?includes=Images,Personalization`, token);
      await updateListing(credential.shop_id, listingId, token, { ...listing, taxonomyId }, original);
      const altText = Array.isArray(manifest.altText) ? manifest.altText : [];
      for (const item of listing.images) {
        const rank = item.role === "thumbnail" ? 1 : Math.max(2, Number(String(item.role).replace("listing-image-", "")) + 1);
        await uploadImage(admin, credential.shop_id, listingId, token, item, rank, String(altText[rank - 1] || ""), true);
      }
      if (listing.pdf) await uploadPdf(admin, credential.shop_id, listingId, token, listing.pdf);
      const publishedAt = new Date().toISOString();
      await admin.from("review_projects").update({ status: "published", platform_id: listingId, published_at: publishedAt, last_error: null }).eq("id", projectId);
      return json({ ok: true, updated: true, listing_id: listingId, listing_url: `https://www.etsy.com/listing/${listingId}` });
    }
    if (!listingId) {
      const draft = await createDraft(credential.shop_id, token, { ...listing, taxonomyId }, template);
      listingId = String(draft.listing_id || draft.results?.[0]?.listing_id || "");
      if (!listingId) throw new Error("Etsy created a draft but did not return its listing ID.");
      checkpoint.listingId = listingId;
      checkpoint.imagesUploaded = 0;
      checkpoint.fileUploaded = false;
      manifest.etsyPublish = checkpoint;
      await admin.from("review_projects").update({ platform_id: listingId, manifest }).eq("id", projectId);
    }

    const altText = Array.isArray(manifest.altText) ? manifest.altText : [];
    let imageCount = Math.max(0, Number(checkpoint.imagesUploaded) || 0);
    for (let index = imageCount; index < listing.images.length; index += 1) {
      await uploadImage(admin, credential.shop_id, listingId, token, listing.images[index], index + 1, String(altText[index] || ""));
      checkpoint.imagesUploaded = index + 1;
      manifest.etsyPublish = checkpoint;
      await admin.from("review_projects").update({ manifest }).eq("id", projectId);
    }
    if (!checkpoint.fileUploaded) {
      await uploadPdf(admin, credential.shop_id, listingId, token, listing.pdf);
      checkpoint.fileUploaded = true;
      manifest.etsyPublish = checkpoint;
      await admin.from("review_projects").update({ manifest }).eq("id", projectId);
    }
    await activate(credential.shop_id, listingId, token);
    checkpoint.activated = true;
    checkpoint.publishedAt = new Date().toISOString();
    manifest.etsyPublish = checkpoint;
    const { error: finishError } = await admin.from("review_projects").update({
      status: "published",
      platform_id: listingId,
      manifest,
      published_at: checkpoint.publishedAt,
      last_error: null,
    }).eq("id", projectId);
    if (finishError) throw finishError;
    return json({ ok: true, listing_id: listingId, listing_url: `https://www.etsy.com/listing/${listingId}` });
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    if (projectId) await admin.from("review_projects").update({ status: "failed", last_error: message }).eq("id", projectId);
    return json({ error: message }, 400);
  }
});
