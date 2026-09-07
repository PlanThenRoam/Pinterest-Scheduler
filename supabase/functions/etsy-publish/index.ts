import {resumeImages} from './resume-images.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";
import { validateAssetBlob, verifyNewListingAssets } from './assets.ts';
import {readImageState,syncConfirmedImageAlt} from './image-state.ts';
import { reconcileEdit } from './reconcile-edit.ts';
import { runEdit } from './safe-edit.ts';
import { listingSnapshot, verifyFields, equivalent } from './safety.ts';

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const etsyKey = Deno.env.get("ETSY_API_KEY") || "";
const etsySecret = Deno.env.get("ETSY_SHARED_SECRET") || "";
const apiRoot = "https://openapi.etsy.com/v3/application";
const templateListingId = "4568932542";
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
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
  if(project.manifest?.archived)throw new Error('Restore this archived project before editing it.');
  if (!["ready", "approved", "failed"].includes(project.status)) throw new Error("This Etsy project is not ready to publish, or another request is running.");
  const manifest = structuredClone(project.manifest || {});
  const editMode = manifest.mode === "edit" || Boolean(manifest.listingId || manifest.etsyListingId);
  const title = String(manifest.title || project.title || "").trim();
  const description = String(manifest.description || "").trim();
  const tags = Array.isArray(manifest.tags) ? manifest.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean) : [];
  if (editMode) {
    const fields = manifest.updateFields && typeof manifest.updateFields === "object" ? manifest.updateFields : {};
    const scopes = Array.isArray(manifest.updateScope) ? manifest.updateScope.map(String) : manifest.updateScope === "images_only" ? ["images"] : [];
    const allowed = new Set(["title","description","images","files"]);
    if (!scopes.length) throw new Error("This Etsy update has no approved fields.");
    if (scopes.some((scope: string) => !allowed.has(scope))) throw new Error("This Etsy update contains an unsupported scope.");
    if (Object.keys(fields).some((key) => !allowed.has(key) || ["images","alt_text","files"].includes(key))) throw new Error("This Etsy update contains an unsupported field.");
    if (Object.keys(fields).some((key) => !scopes.includes(key)) || scopes.some((scope: string) => !["images","alt_text","files"].includes(scope) && !Object.prototype.hasOwnProperty.call(fields, scope))) throw new Error("The approved Etsy fields do not match the update scope.");
    if ("title" in fields && (!String(fields.title).trim() || String(fields.title).length > 140)) throw new Error("Etsy titles must be 1–140 characters.");
    if ("description" in fields && !String(fields.description).trim()) throw new Error("The Etsy description cannot be empty.");
    if ("price" in fields && (!Number.isFinite(Number(fields.price)) || Number(fields.price)<=0 || Math.abs(Number(fields.price)*100-Math.round(Number(fields.price)*100))>1e-8)) throw new Error("The Etsy price must be positive with at most two decimal places.");
    if ("tags" in fields) { const fieldTags=Array.isArray(fields.tags)?fields.tags.map((x:any)=>String(x).trim()).filter(Boolean):[]; if(fieldTags.length!==13||new Set(fieldTags.map((x:string)=>x.toLowerCase())).size!==13||fieldTags.some((x:string)=>x.length>20)) throw new Error("Etsy tags require exactly 13 unique entries, each 20 characters or fewer."); fields.tags=fieldTags; }
    const allImages = (Array.isArray(project.media) ? project.media : []).filter((item: any) => item?.role === "thumbnail" || String(item?.role || "").startsWith("listing-image"));
    let imageReplacements = Array.isArray(manifest.imageReplacements) ? manifest.imageReplacements : [];
    if (scopes.includes("images")) {
      if (!imageReplacements.length && Array.isArray(manifest.altText) && manifest.altText.length === 6) imageReplacements = ["thumbnail","listing-image-1","listing-image-2","listing-image-3","listing-image-4","listing-image-5"].map((role,i)=>({role,rank:i+1,altText:manifest.altText[i]}));
      if (!imageReplacements.length) throw new Error("Choose at least one Etsy image to replace.");
      for (const replacement of imageReplacements) { replacement.item=mediaByRole(project,String(replacement.role)); if(!replacement.item)throw new Error(`Attach image replacement ${replacement.role}.`); if(!(Number.isInteger(Number(replacement.rank))&&Number(replacement.rank)>=1&&Number(replacement.rank)<=20&&String(replacement.altText||"").trim()&&String(replacement.altText).length<=500))throw new Error(`Image replacement ${replacement.role} needs a valid rank and alt text.`); }
    }
    const altTextUpdates = Array.isArray(manifest.altTextUpdates) ? manifest.altTextUpdates : [];
    if (scopes.includes("alt_text")) { if (!altTextUpdates.length || altTextUpdates.length > 20) throw new Error("Choose one to twenty existing Etsy images for alt-text updates."); for (const [i,image] of altTextUpdates.entries()) { if (!/^\d+$/.test(String(image?.listingImageId||"")) || !Number.isInteger(Number(image?.rank)) || Number(image.rank)<1 || Number(image.rank)>20 || !String(image?.altText||"").trim() || String(image.altText).length>500) throw new Error(`Alt-text update ${i+1} is incomplete.`); image.altText=String(image.altText).trim().slice(0,500); } }
    const fileUpdates = Array.isArray(manifest.fileUpdates) ? manifest.fileUpdates.map((file: any) => ({ ...file, item: mediaByRole(project, String(file.role)) })) : [];
    if (scopes.includes("files")) { if (!fileUpdates.length || fileUpdates.length > 5) throw new Error("Choose one to five digital-file additions or replacements."); for (const [i,file] of fileUpdates.entries()) { if (!["add","replace"].includes(String(file?.action)) || !file?.role || !file.filename || !file.item) throw new Error(`Digital-file update ${i+1} is incomplete or its asset is not attached.`); if (file.action==="replace" && !/^\d+$/.test(String(file.listingFileId||""))) throw new Error(`Digital-file replacement ${i+1} needs the existing Etsy file ID.`); } }
    return { manifest, title: project.title, description: "", tags: [], images: scopes.includes("images") ? imageReplacements : [], altTextUpdates: scopes.includes("alt_text") ? altTextUpdates : [], fileUpdates: scopes.includes("files") ? fileUpdates : [], fields, scopes, pdf: null, editMode: true };
  }
  if (!title || title.length > 140) throw new Error("The Etsy title must be between 1 and 140 characters.");
  if (!description) throw new Error("The Etsy description is missing.");
  if (tags.length !== 13 || new Set(tags.map((tag: string) => tag.toLowerCase())).size !== 13) throw new Error("Etsy requires exactly 13 unique tags.");
  if (tags.some((tag: string) => tag.length > 20)) throw new Error("Each Etsy tag must be 20 characters or fewer.");
  const images = imageItems(project);
  if (!editMode && images.length !== 6) throw new Error("Attach the thumbnail and all five listing images before publishing.");
  const altText = Array.isArray(manifest.altText) ? manifest.altText.map((value: unknown) => String(value).trim()) : [];
  if (!editMode && (altText.length < 6 || altText.slice(0, 6).some((value: string) => !value || value.length>500))) throw new Error("Add alt text for all six Etsy listing images.");
  const pdf = mediaByRole(project, "customer-pdf");
  if (!editMode && !pdf) throw new Error("Attach the customer PDF before publishing.");
  return { manifest, title, description, tags, images, pdf, editMode };
}

async function etsyFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("x-api-key", `${etsyKey}:${etsySecret}`);
  headers.set("authorization", `Bearer ${accessToken}`);
  for(let attempt=0;attempt<4;attempt++){
    const response = await fetch(apiRoot + path, { ...init, headers, signal: AbortSignal.timeout(25000) });
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
    // A definite 429 rejects the request; retry it after Etsy's stated delay.
    // Network errors and ambiguous write responses are deliberately not retried.
    if(response.status===429&&attempt<3){
      const retry=Number(response.headers.get('retry-after'));
      if(Number.isFinite(retry)&&retry>15)throw new Error('Etsy rate limit requires a longer pause. The current result is retained.');
      await new Promise(resolve=>setTimeout(resolve,Math.max(1100,Number.isFinite(retry)?retry*1000:0,1100*(attempt+1))));
      continue;
    }
    if (!response.ok) {
      const message = body?.error || body?.error_description || body?.message || `Etsy returned HTTP ${response.status}.`;
      throw new Error(String(message));
    }
    return body;
  }
  throw new Error('Etsy request rate limit persists. The current result is retained.');
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

function listingDefaults(template:any){return {price:moneyValue(template.price),quantity:Number(template.quantity)||999,taxonomy_id:template.taxonomy_id,who_made:template.who_made||'i_did',when_made:template.when_made||'2020_2026',is_supply:template.is_supply??false,is_taxable:template.is_taxable??true,should_auto_renew:template.should_auto_renew??true,shop_section_id:template.shop_section_id||null,materials:template.materials||[],styles:template.styles||[],is_customizable:template.is_customizable??false,readiness_state_id:template.readiness_state_id||null,currency:template.price?.currency_code||'GBP'};}
async function createDraft(shopId: string, token: string, data: any, template: any) {
  const form = new URLSearchParams();
  form.set("quantity", String(Math.round(numberValue(data.manifest.quantity, 999))));
  form.set("title", data.title);
  form.set("description", data.description);
  form.set("price", numberValue(data.manifest.price, 14.99).toFixed(2));
  form.set("who_made", String(template.who_made || "i_did"));
  form.set("when_made", String(template.when_made || "2020_2026"));
  form.set("taxonomy_id", String(data.taxonomyId));
  form.set("type", "download");
  form.set("is_supply", String(template.is_supply ?? false));
  form.set("is_taxable", String(template.is_taxable ?? true));
  form.set("should_auto_renew", String(template.should_auto_renew ?? true));
  if (template.shop_section_id) form.set("shop_section_id", String(template.shop_section_id));
  appendArray(form, "materials", template.materials);
  appendArray(form, "styles", template.styles);
  if (template.is_customizable) form.set("is_customizable", "true");
  if (template.readiness_state_id) form.set("readiness_state_id", String(template.readiness_state_id));
  for (const tag of data.tags) form.append("tags", tag);
  return await etsyFetch(`/shops/${shopId}/listings`, token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
}

async function storageFile(admin: any, item: any) {
  if (item?.blob instanceof Blob) return item.blob;
  if (!item?.path) throw new Error('An attachment is missing.');
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

async function updateExistingImageAltText(shopId:string,listingId:string,token:string,image:any){
  const form=new FormData();form.set("listing_image_id",String(image.listingImageId));form.set("rank",String(image.rank));form.set("alt_text",String(image.altText).slice(0,500));form.set("overwrite","false");
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}/images`,token,{method:"POST",body:form});
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

async function updateSelectedListingFields(shopId: string, listingId: string, token: string, fields: any) {
  const form = new URLSearchParams();
  const direct: Record<string,string> = { title:"title", description:"description", quantity:"quantity", price:"price", taxonomyId:"taxonomy_id", shopSectionId:"shop_section_id", whoMade:"who_made", whenMade:"when_made", isSupply:"is_supply", isTaxable:"is_taxable", autoRenew:"should_auto_renew", state:"state" };
  for (const [key, apiKey] of Object.entries(direct)) if (Object.prototype.hasOwnProperty.call(fields, key)) form.set(apiKey, String(fields[key]));
  for (const key of ["tags","materials","styles"]) if (Object.prototype.hasOwnProperty.call(fields,key)) appendArray(form,key,fields[key]);
  if (![...form.keys()].length) return null;
  return await etsyFetch(`/shops/${shopId}/listings/${listingId}`, token, { method:"PATCH", headers:{"content-type":"application/x-www-form-urlencoded"}, body:form });
}

async function updatePersonalization(shopId: string, listingId: string, token: string, personalization: any) {
  const path=`/shops/${shopId}/listings/${listingId}/personalization`;
  const questions=Array.isArray(personalization?.personalization_questions)?personalization.personalization_questions:[];
  if(personalization?.enabled===false||questions.length===0)return await etsyFetch(path,token,{method:"DELETE"});
  return await etsyFetch(path,token,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({personalization_questions:questions})});
}

async function uploadPdf(admin: any, shopId: string, listingId: string, token: string, item: any, rank = 1) {
  const blob = await storageFile(admin, item);
  const form = new FormData();
  form.set("file", blob, item.name || "planner.pdf");
  form.set("name", String(item.name || "planner.pdf").slice(0, 70));
  form.set("rank", String(rank));
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
  if (req.method === "GET" && url.pathname.endsWith("/health")) return json({ ok: true, app_version:36, api_version:'4.0.1', configured: Boolean(etsyKey && etsySecret) });
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

  let projectId = "", ownsPublish = false;
  try {
    const { data: credential, error: credentialError } = await admin.from("etsy_credentials").select("*").eq("user_id", userData.user.id).single();
    if (credentialError || !credential) throw new Error("Connect your Etsy shop in Settings first.");
    const token = await accessToken(admin, credential);
    if (req.method === "GET") {
      if(url.searchParams.get('defaults')==='1'){const template=await etsyFetch(`/listings/${templateListingId}?includes=Personalization`,token);return json({defaults:listingDefaults(template)});}
      const state = ["active", "draft", "inactive", "expired", "sold_out"].includes(url.searchParams.get("state") || "") ? url.searchParams.get("state")! : "active";
      const listings = await etsyFetch(`/shops/${credential.shop_id}/listings?state=${state}&limit=100&includes=Images,Personalization`, token);
      return json({ ok: true, listings: (listings.results || []).map((item: any) => ({
        listing_id: String(item.listing_id), title: item.title, state: item.state,
        snapshot: listingSnapshot(item),
        thumbnail: item.images?.[0]?.url_170x135 || item.images?.[0]?.url_570xN || "",
        image_count: item.images?.length || 0, price: moneyValue(item.price), currency: item.price?.currency_code || "GBP", url: item.url,
        images: (item.images || []).map((image: any) => ({ listing_image_id: String(image.listing_image_id), rank: Number(image.rank), alt_text: image.alt_text ?? null, url_fullxfull: image.url_fullxfull, url_570xN: image.url_570xN })),
      })) });
    }
    const body = await req.json();
    if (body.action === "acknowledge_run") {
      if (body.confirmed_review !== true) throw new Error("Review the current Etsy listing before releasing this update.");
      const {data:run,error:readError}=await admin.from('seller_publish_runs').select('*').eq('id',String(body.run_id)).single();
      if(readError||!run)throw new Error('Publishing attempt not found.');
      if(run.status!=='needs_review'&&!(run.status==='running'&&Date.now()-Date.parse(run.created_at)>5*60_000))throw new Error('Only unresolved or stalled publishing attempts can be acknowledged.');
      if(!run.after_state?.checked_at||Date.now()-Date.parse(run.after_state.checked_at)>600000)throw new Error('Check the current Etsy result before discarding this submission.');
      const {error} = await admin.from("seller_publish_runs").update({status:"dismissed",finished_at:new Date().toISOString()}).eq("id",run.id).eq("status",run.status);
      if(error)throw error;
      if(run.status==='running')await admin.from('review_projects').update({status:'failed',last_error:'Stalled publishing attempt acknowledged. Prepare a fresh update after checking Etsy.'}).eq('id',run.project_id).eq('status','publishing');
      return json({ok:true});
    }
    if (body.action === "prepare_edit") {
      const listingId = String(body.listing_id || "");
      if (!/^\d+$/.test(listingId)) throw new Error("Choose an Etsy listing.");
      const submissionId=String(body.submission_id||'');
      if(!/^[a-f0-9-]{36}$/i.test(submissionId)||typeof body.submission_fingerprint!=='string')throw new Error('A stable submission identity is required.');
      const previous=await admin.from('review_projects').select('id,title,status,platform_id,manifest').eq('id',submissionId).maybeSingle();
      if(previous.error)throw previous.error;
      if(previous.data){if(previous.data.manifest.submissionFingerprint!==body.submission_fingerprint)throw new Error('Submission identity conflict.');const {manifest,...project}=previous.data;return json({ok:true,project,already_prepared:true});}
      const existing = await etsyFetch(`/listings/${listingId}?includes=Images,Personalization`, token);
      existing.images=(await etsyFetch(`/listings/${listingId}/images`,token)).results;
      if(!Array.isArray(existing.images))throw new Error("Etsy image readback is unavailable.");
      const files = await etsyFetch(`/shops/${credential.shop_id}/listings/${listingId}/files`, token);
      if (String(existing.user_id || "") && String(existing.user_id) !== String(credential.etsy_user_id)) throw new Error("That listing does not belong to the connected Etsy account.");
      const manifest = {
        mode: "edit", updateScope: [], updateFields: {}, listingId, submissionFingerprint:body.submission_fingerprint,
        altText: (existing.images || []).map((image: any) => image.alt_text || ""),
        existingImages: (existing.images || []).map((image: any) => ({ id: String(image.listing_image_id), rank: image.rank, url: image.url_570xN, altText: image.alt_text || "" })),
        existingFiles: (files.results || []).map((file:any)=>({id:String(file.listing_file_id),rank:file.rank,name:file.filename||file.display_name||"Digital file"})),
        existingSnapshot:listingSnapshot(existing),
      };
      const createQuery = admin.from("review_projects").insert({
          id:submissionId,kind: "etsy", title: existing.title, status: "editing", source: "chatgpt",
          manifest, media: [], platform_id: listingId,
        }).select("id,title,status,platform_id");
      const { data: rows, error: createError } = await createQuery;
      const created = Array.isArray(rows) ? rows[0] : rows;
      if (createError) throw createError;
      if (!created) throw new Error("The existing Seller Tools draft could not be prepared.");
      return json({ ok: true, project: created });
    }
    projectId = String(body.project_id || "");
    if (!projectId) throw new Error("Choose an Etsy project to publish.");
    const { data: project, error: projectError } = await admin.from("review_projects").select("*").eq("id", projectId).single();
    if (projectError) throw projectError;
    if(project.status === "published") return json({ok:true,already_published:true,listing_id:project.platform_id,listing_url:`https://www.etsy.com/listing/${project.platform_id}`});
    if(body.expected_revision != null && Number(body.expected_revision)!==project.revision) throw new Error("The project changed. Refresh and review its latest revision.");
    if(body.action==='resume_images')return json(await resumeImages(admin,credential,token,project,{fetch:etsyFetch,storageFile,uploadImage,altText:updateExistingImageAltText}));
    if(body.action==='check_result')return json(await reconcileEdit(admin,credential,token,project,{fetch:etsyFetch}));
    const listing = validateProject(project);
    if(listing.editMode){
      projectId="";
      return json(await runEdit(admin,credential,token,project,listing,{
        userId:userData.user.id,
        fetch:etsyFetch,storageFile,updateFields:updateSelectedListingFields,personalization:updatePersonalization,
        uploadImage,altText:updateExistingImageAltText,uploadFile:uploadPdf,
      }));
    }
    for(const item of listing.images) Object.assign(item,await validateAssetBlob(item,await storageFile(admin,item),'image'));
    Object.assign(listing.pdf,await validateAssetBlob(listing.pdf,await storageFile(admin,listing.pdf),'pdf'));
    const manifest = { ...(project.manifest || {}) };
    const checkpoint = { ...(manifest.etsyPublish || {}) };
    const {data:claimed,error:claimError}=await admin.from("review_projects").update({status:"publishing",last_error:null}).eq("id",projectId).eq("revision",project.revision).in("status",["ready","approved","failed"]).select("id").maybeSingle();
    if(claimError||!claimed)throw new Error("This project changed or is already publishing.");
    ownsPublish=true;

    let listingId = listing.editMode ? String(manifest.listingId || manifest.etsyListingId || project.platform_id || "") : String(project.platform_id || checkpoint.listingId || "");
    const template = await etsyFetch(`/listings/${templateListingId}?includes=Images,Personalization`, token);
    if(!manifest.listingDefaults)throw new Error('Prepare a fresh listing so its shared defaults can be reviewed.');
    if(!equivalent(manifest.listingDefaults,listingDefaults(template)))throw new Error('Shared Etsy listing defaults changed. Prepare a fresh submission for approval.');
    manifest.price=manifest.listingDefaults.price;manifest.quantity=manifest.listingDefaults.quantity;
    const taxonomyId = Math.round(numberValue(manifest.listingDefaults.taxonomy_id, template.taxonomy_id)) || await inferTaxonomy(credential.shop_id, token);
    if (!taxonomyId) throw new Error("Add an Etsy taxonomy ID in Edit before publishing.");
    if (!listingId) {
      if(checkpoint.creationAttempted)throw new Error("A previous draft-creation request has an uncertain outcome. Inspect Etsy before creating another listing.");
      checkpoint.creationAttempted=true;
      manifest.etsyPublish=checkpoint;
      const {error:checkpointError}=await admin.from("review_projects").update({manifest}).eq("id",projectId);
      if(checkpointError)throw checkpointError;
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
      if(checkpoint.imageUploadAttempted)throw new Error('A previous image upload has an uncertain outcome. Inspect the Etsy draft before retrying.');
      checkpoint.imageUploadAttempted=true;manifest.etsyPublish=checkpoint;
      const {error:attemptError}=await admin.from('review_projects').update({manifest}).eq('id',projectId);if(attemptError)throw attemptError;
      const response=await uploadImage(admin, credential.shop_id, listingId, token, listing.images[index], index + 1, String(altText[index] || ""));
      const uploaded=response?.results?.[0]||response;
      if(!uploaded?.listing_image_id)throw new Error('Etsy did not confirm the new image ID. Inspect the draft before retrying.');
      checkpoint.imageIds=checkpoint.imageIds||[];checkpoint.imageIds[index]=String(uploaded.listing_image_id);
      checkpoint.imageUploadAttempted=false;
      checkpoint.imagesUploaded = index + 1;
      manifest.etsyPublish = checkpoint;
      await admin.from("review_projects").update({ manifest }).eq("id", projectId);
    }
    if (!checkpoint.fileUploaded) {
      if(checkpoint.fileUploadAttempted)throw new Error('A previous file upload has an uncertain outcome. Inspect Etsy before retrying this new listing.');
      checkpoint.fileUploadAttempted=true;
      manifest.etsyPublish=checkpoint;
      const {error:beforeUploadError}=await admin.from('review_projects').update({manifest}).eq('id',projectId);
      if(beforeUploadError)throw beforeUploadError;
      const response=await uploadPdf(admin, credential.shop_id, listingId, token, listing.pdf);
      const uploaded=response?.results?.[0]||response;
      if(!uploaded?.listing_file_id)throw new Error('Etsy did not confirm the new PDF ID. Inspect the draft before retrying.');
      checkpoint.fileId=String(uploaded.listing_file_id);
      checkpoint.fileUploaded = true;
      manifest.etsyPublish = checkpoint;
      await admin.from("review_projects").update({ manifest }).eq("id", projectId);
    }
    const draft=await etsyFetch(`/listings/${listingId}?includes=Images,Personalization`,token);
    const expectedDraftImages=checkpoint.imageIds.map((id:string,i:number)=>({listing_image_id:id,rank:i+1,alt_text:String(altText[i])}));
    let draftLayout=await readImageState({fetch:etsyFetch},listingId,token,expectedDraftImages,[1,2,3,4,5,6]);
    for(const image of expectedDraftImages){
      draftLayout=draftLayout.map((x:any)=>Number(x.rank)===image.rank?image:x);
      await syncConfirmedImageAlt(admin,credential,token,listingId,{rank:image.rank,altText:image.alt_text},draftLayout,{fetch:etsyFetch,altText:updateExistingImageAltText},async(name:string,action:any)=>{
        checkpoint.altTextAttempt=name;manifest.etsyPublish=checkpoint;
        const saved=await admin.from('review_projects').update({manifest}).eq('id',projectId);if(saved.error)throw saved.error;
        return await action();
      });
    }
    draft.images=await readImageState({fetch:etsyFetch},listingId,token,expectedDraftImages);
    const draftFiles=(await etsyFetch(`/shops/${credential.shop_id}/listings/${listingId}/files`,token)).results||[];
    verifyNewListingAssets(draft,draftFiles,checkpoint,altText);
    verifyFields({title:listing.title,description:listing.description,tags:listing.tags,price:numberValue(manifest.price,14.99)},listingSnapshot(draft),{});
    if(draft.state!=='active')await activate(credential.shop_id, listingId, token);
    const activated=await etsyFetch(`/listings/${listingId}`,token);
    if(activated.state!=='active')throw new Error('Etsy has not confirmed activation. Inspect the existing draft before retrying.');
    checkpoint.activated = true;
    checkpoint.publishedAt = new Date().toISOString();
    manifest.etsyPublish = checkpoint;
    const { error: finishError } = await admin.from("review_projects").update({
      status: "published",
      platform_id: listingId,
      manifest:{submissionFingerprint:manifest.submissionFingerprint,published:true},media:[],preview_path:null,title:'Published submission',
      published_at: checkpoint.publishedAt,
      last_error: null,
    }).eq("id", projectId);
    if (finishError) throw finishError;
    return json({ ok: true, listing_id: listingId, listing_url: `https://www.etsy.com/listing/${listingId}` });
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    if (projectId && ownsPublish) await admin.from("review_projects").update({ status: "failed", last_error: message }).eq("id", projectId);
    return json({ error: message }, 400);
  }
});
