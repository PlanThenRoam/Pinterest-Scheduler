import {readPinAsset} from '../composer/pin-asset.ts';
import {composerTools,composerToolNames,handleComposer} from '../composer/actions.ts';
import { validateAssetBlob } from '../etsy-publish/assets.ts';
import { listBoards } from '../pinterest-publish/api.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";

import { drainStorageCleanup } from './storage-cleanup.ts';
import { cancelReview } from './cancel-review.ts';

import { masterTools, masterToolNames, handleMasterTool } from './master-files.ts';

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const endpoint = projectUrl + "/functions/v1/seller-tools-inbox";
const etsyPublisher = projectUrl + "/functions/v1/etsy-publish";
const APP_VERSION = 38;
const API_CAPABILITY_VERSION = "5.0.2";
const bucketFor: Record<string,string> = {etsy:"etsy-assets",pinterest:"pinterest-media"};
const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, apikey, x-client-info, content-type, mcp-protocol-version","access-control-allow-methods":"GET,POST,OPTIONS"};

const toolDefinitions:any[] = [
 ...masterTools,...composerTools,
 {name:'attach_project_asset_from_composer',description:'Copy one current, visually approved 1000x1500 Composer PNG into its matching Pinterest review project. Verify planner, revision and checksum. Does not publish.',inputSchema:{type:'object',additionalProperties:false,required:['project_id','expected_revision','composition_id','composition_revision','checksum'],properties:{project_id:{type:'string',format:'uuid'},expected_revision:{type:'integer',minimum:1},composition_id:{type:'string',format:'uuid'},composition_revision:{type:'integer',minimum:1},checksum:{type:'string',pattern:'^[a-f0-9]{64}$'}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"list_etsy_shop_listings",description:"Find the owner's current Etsy listings by product name before preparing an update. Use this whenever the owner names an existing product; do not ask them for a listing ID.",inputSchema:{type:"object",additionalProperties:false,properties:{query:{type:"string",description:"Optional product name or destination to match."},state:{type:"string",enum:["active","draft","inactive","expired","sold_out"]}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:"prepare_etsy_listing_update",description:"Prepare an isolated update for one existing Etsy listing. Accepts title, description, exactly 13 tags, price, individual image replacements, individual image alt-text changes, and digital-file additions or replacements. Only supplied fields or assets can change; everything omitted remains untouched.",inputSchema:{type:"object",additionalProperties:false,required:["product_name"],properties:{product_name:{type:"string",minLength:2},state:{type:"string",enum:["active","draft","inactive","expired","sold_out"]},title:{type:"string",minLength:1,maxLength:140},description:{type:"string",minLength:1},tags:{type:"array",minItems:13,maxItems:13,uniqueItems:true,items:{type:"string",minLength:1,maxLength:20}},price:{type:"number",exclusiveMinimum:0},images:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:false,required:["role","rank","alt_text"],properties:{role:{type:"string",description:"Asset role to attach, such as thumbnail or listing-image-1."},rank:{type:"integer",minimum:1,maximum:20},alt_text:{type:"string",minLength:1,maxLength:500}}}},alt_text:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:false,required:["listing_image_id","rank","text"],properties:{listing_image_id:{type:"string",pattern:"^\\d+$"},rank:{type:"integer",minimum:1,maximum:20},text:{type:"string",minLength:1,maxLength:500}}}},digital_files:{type:"array",minItems:1,maxItems:5,items:{type:"object",additionalProperties:false,required:["action","role","filename"],properties:{action:{type:"string",enum:["add","replace"]},role:{type:"string",description:"Asset role to attach, such as customer-pdf or customer-docx."},filename:{type:"string",minLength:1,maxLength:70},listing_file_id:{type:"string",pattern:"^\\d+$",description:"Required only when action is replace."}}}}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},
 {name:"create_review_project",description:"Create one private Etsy or Pinterest project after the owner has approved its complete content plan.",inputSchema:{type:"object",additionalProperties:false,required:["kind","title","manifest"],properties:{kind:{type:"string",enum:["etsy","pinterest"]},title:{type:"string",minLength:1,maxLength:180},manifest:{type:"object",description:"Complete manifest. Etsy needs title, description, price, quantity, exactly 13 unique tags, six image alt texts and optional taxonomyId; Pinterest needs 1–50 pins."}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:"attach_project_asset",description:"Attach or replace one base64-encoded Etsy or Pinterest project asset. Reusing a role replaces only that asset.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","filename","role","content_type","base64_data"],properties:{project_id:{type:"string",format:"uuid"},filename:{type:"string"},role:{type:"string",description:"Examples: customer-pdf, thumbnail, listing-image-1 or pin-1."},content_type:{type:"string"},base64_data:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"attach_project_asset_from_url",description:"Copy an HTTPS asset from a trusted ChatGPT/OpenAI cloud URL into the owner's private Seller Tools storage.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","source_url","filename","role"],properties:{project_id:{type:"string",format:"uuid"},source_url:{type:"string",format:"uri"},filename:{type:"string"},role:{type:"string"},content_type:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},
 {name:"finalize_review_project",description:"Validate all attached Etsy or Pinterest assets and mark the project ready for review. This does not publish.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"list_review_projects",description:"Report the live Seller Tools app/API versions and list private Etsy or Pinterest review projects without returning binary files.",inputSchema:{type:"object",additionalProperties:false,properties:{status:{type:"string",enum:["draft","uploading_assets","ready","changes_requested","approved","scheduled","publishing","published","failed"]},kind:{type:"string",enum:["etsy","pinterest"]}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"update_review_project",description:"Update the manifest or replace the title of one existing project. Preserve fields the owner did not ask to change.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"},title:{type:"string"},manifest:{type:"object"},mark_ready:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"clear_review_project",description:"Permanently cancel a pending review submission and delete its stored assets. Does not undo published changes. Requires owner confirmation.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","confirmed"],properties:{project_id:{type:"string",format:"uuid"},confirmed:{type:"boolean",const:true}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}}
];

toolDefinitions.push(
 {name:'list_pinterest_boards',description:'Retrieve the owner’s existing Pinterest boards. Select the best matching board before preparing a pin.',inputSchema:{type:'object',additionalProperties:false,properties:{}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:'prepare_pin_review',description:'Prepare one pin for approval. Match the named planner to its existing Etsy listing and the selected existing Pinterest board. Never publishes.',inputSchema:{type:'object',additionalProperties:false,required:['product_name','board_id','title','description','idempotency_key'],properties:{product_name:{type:'string',minLength:2},board_id:{type:'string',pattern:'^[0-9]+$'},title:{type:'string',minLength:1,maxLength:100},description:{type:'string',minLength:1,maxLength:800},alt_text:{type:'string',maxLength:500},idempotency_key:{type:'string',minLength:8,maxLength:120}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true}}
);
function stableJson(value:any):string{return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
async function fingerprintOf(value:any){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function submissionId(userId:string,key:string){
 if(typeof key!=='string'||key.length<8||key.length>120)throw new Error('Provide a stable idempotency key for this submission.');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId+':'+key)));
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const h=[...bytes.subarray(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const authSchemes=[{type:'oauth2',scopes:['openid','email']}];
const supportedActions=new Set([...masterToolNames,...composerToolNames,'attach_project_asset_from_composer','list_etsy_shop_listings','prepare_etsy_listing_update','create_review_project','attach_project_asset','attach_project_asset_from_url','finalize_review_project','list_review_projects','update_review_project','clear_review_project','list_pinterest_boards','prepare_pin_review']);
for(const definition of toolDefinitions){
 if(['update_review_project','attach_project_asset','attach_project_asset_from_url','finalize_review_project'].includes(definition.name)){definition.inputSchema.properties.expected_revision={type:'integer',minimum:1};definition.inputSchema.required.push('expected_revision');}
 if(definition.name==='update_review_project')delete definition.inputSchema.properties.mark_ready;
 if(definition.name==='create_review_project'){definition.inputSchema.properties.idempotency_key={type:'string',minLength:8,maxLength:120};definition.inputSchema.required.push('idempotency_key');}
 if(definition.name==='prepare_etsy_listing_update'){
  definition.inputSchema.properties.idempotency_key={type:'string',minLength:8,maxLength:120};definition.inputSchema.required.push('idempotency_key');definition.annotations.idempotentHint=true;
  delete definition.inputSchema.properties.tags;delete definition.inputSchema.properties.price;delete definition.inputSchema.properties.alt_text;
  definition.inputSchema.properties.digital_files.items.properties.action.enum=['replace'];
  definition.description='Prepare title, description, individual image replacements with matching alt text, or PDF replacements for owner approval. Only these selected items change.';
 }
}
const tools=toolDefinitions.filter(t=>supportedActions.has(t.name)).map((t:any)=>({...t,securitySchemes:authSchemes,_meta:{...t._meta,securitySchemes:authSchemes}}));
const registration={endpoint,tool_count:tools.length,tool_names:tools.map(t=>t.name),metadata_version:API_CAPABILITY_VERSION,authentication:'owner OAuth required for every tool call',file_transfer:'upload_master_files accepts native ChatGPT DOCX attachments; prepare_master_upload provides signed upload URLs. Review assets accept actual base64 bytes or trusted ChatGPT HTTPS file URLs.',client_catalogue_note:'Server capabilities do not prove which actions the current ChatGPT connection exposes. Compare its action names with tools/list.'};
const challenge=`Bearer resource_metadata="${endpoint}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Sign in to Seller Tools to continue"`;
function unauthenticated(id:unknown,message:string){return new Response(JSON.stringify({jsonrpc:'2.0',id:id??null,result:{isError:true,content:[{type:'text',text:message}],_meta:{'mcp/www_authenticate':[challenge]}}}),{status:401,headers:{...cors,'content-type':'application/json','cache-control':'no-store','www-authenticate':challenge}});}

function rpc(id: unknown, result: unknown, status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,result}),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function fail(id: unknown, code:number,message:string,status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,error:{code,message}}),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}})}
function cleanName(value:string){return (value||"asset").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-120)||"asset"}
function validate(kind:string, manifest:any){

 if(!["etsy","pinterest"].includes(kind))throw new Error("Seller Tools supports Etsy and Pinterest projects only.");
 if(kind==="etsy"){
  if(manifest?.mode==="edit"||manifest?.updateScope==="images_only"){
   const listingId=String(manifest.listingId||manifest.etsyListingId||"");
   if(!/^\d+$/.test(listingId))throw new Error("Etsy updates require the exact existing listing ID.");
   const legacyImages=manifest.updateScope==="images_only";const fields=manifest.updateFields&&typeof manifest.updateFields==="object"?manifest.updateFields:{};
   const scopes=Array.isArray(manifest.updateScope)?manifest.updateScope.map(String):legacyImages?["images"]:[...Object.keys(fields),...(manifest.imageUpdate?["images"]:[]),...(manifest.altTextUpdates?.length?["alt_text"]:[]),...((manifest.fileUpdates?.length||manifest.fileReplacements?.length)?["files"]:[])];
   const allowed=["title","description","images","files"];
   if(!scopes.length||scopes.some((x:string)=>!allowed.includes(x)))throw new Error("Choose at least one supported Etsy field to update.");
   if(Object.keys(fields).some(x=>!allowed.includes(x)||["images","alt_text","files"].includes(x)))throw new Error("The Etsy update contains an unsupported field.");
   if(Object.keys(fields).some(x=>!scopes.includes(x))||scopes.some((x:string)=>!["images","alt_text","files"].includes(x)&&!Object.prototype.hasOwnProperty.call(fields,x)))throw new Error("Every Etsy update scope must have exactly one approved value.");
   if("title" in fields&&(!String(fields.title).trim()||String(fields.title).length>140))throw new Error("Etsy titles must be 1–140 characters.");
   if("description" in fields&&!String(fields.description).trim())throw new Error("The Etsy description cannot be empty.");
   if("price" in fields&&(!Number.isFinite(Number(fields.price))||Number(fields.price)<=0||Math.abs(Number(fields.price)*100-Math.round(Number(fields.price)*100))>1e-8))throw new Error("The Etsy price must be positive with at most two decimal places.");
   if("quantity" in fields&&!(Number.isInteger(Number(fields.quantity))&&Number(fields.quantity)>0))throw new Error("The Etsy quantity must be a positive whole number.");
   for(const key of ["isSupply","isTaxable","autoRenew"])if(key in fields&&typeof fields[key]!=="boolean")throw new Error(`Etsy ${key} must be true or false.`);
   if("whoMade" in fields&&!['i_did','collective','someone_else'].includes(String(fields.whoMade)))throw new Error("Etsy whoMade must be i_did, collective or someone_else.");
   if("whenMade" in fields&&!String(fields.whenMade).trim())throw new Error("Etsy whenMade cannot be empty.");
   if("taxonomyId" in fields&&!/^\d+$/.test(String(fields.taxonomyId)))throw new Error("The Etsy category requires a numeric taxonomy ID.");
   if("shopSectionId" in fields&&!/^\d+$/.test(String(fields.shopSectionId)))throw new Error("The Etsy shop section requires a numeric section ID.");
   if("state" in fields&&!['active','draft','inactive'].includes(String(fields.state)))throw new Error("Etsy state must be active, draft or inactive.");
   for(const key of ["materials","styles"])if(key in fields&&(!Array.isArray(fields[key])||fields[key].some((x:any)=>!String(x).trim())))throw new Error(`Etsy ${key} must be a list of non-empty values.`);
   if("tags" in fields){const tags=Array.isArray(fields.tags)?fields.tags.map((x:any)=>String(x).trim()).filter(Boolean):[];if(tags.length!==13||new Set(tags.map((x:string)=>x.toLowerCase())).size!==13||tags.some((x:string)=>x.length>20))throw new Error("Etsy tags require exactly 13 unique entries, each 20 characters or fewer.");fields.tags=tags;}
   if(scopes.includes("images")){const legacyAlt=Array.isArray(manifest.altText)?manifest.altText.map((x:any)=>String(x).trim()):[],replacements=Array.isArray(manifest.imageReplacements)&&manifest.imageReplacements.length?manifest.imageReplacements:(legacyAlt.length===6?["thumbnail","listing-image-1","listing-image-2","listing-image-3","listing-image-4","listing-image-5"].map((role,i)=>({role,rank:i+1,altText:legacyAlt[i]})):[]);if(!replacements.length||replacements.length>20)throw new Error("Image updates require one to twenty explicit replacements.");const ranks=new Set<number>();for(const [i,image] of replacements.entries()){const rank=Number(image?.rank),role=String(image?.role||""),alt=String(image?.altText||"").trim();if(!role||!Number.isInteger(rank)||rank<1||rank>20||!alt||alt.length>500)throw new Error(`Image replacement ${i+1} needs a role, rank from 1 to 20 and alt text.`);if(ranks.has(rank))throw new Error("Image replacement ranks must be unique.");ranks.add(rank);image.rank=rank;image.altText=alt;}manifest.imageReplacements=replacements;manifest.imageUpdate=true;}
   if(scopes.includes("alt_text")){const updates=Array.isArray(manifest.altTextUpdates)?manifest.altTextUpdates:[];if(!updates.length||updates.length>20)throw new Error("Alt-text updates require one to twenty existing Etsy images.");for(const [i,image] of updates.entries()){if(!/^\d+$/.test(String(image?.listingImageId||""))||!Number.isInteger(Number(image?.rank))||Number(image.rank)<1||Number(image.rank)>20||!String(image?.altText||"").trim()||String(image.altText).length>500)throw new Error(`Alt-text update ${i+1} needs an existing image ID, rank from 1 to 20 and text.`);image.altText=String(image.altText).trim().slice(0,500);}}
   if(scopes.includes("files")){const files=Array.isArray(manifest.fileUpdates)?manifest.fileUpdates:[];if(!files.length||files.length>5)throw new Error("Digital-file updates require one to five explicit additions or replacements.");for(const [i,file] of files.entries()){if(file?.action!=="replace"||!file?.role||!/\.pdf$/i.test(file.filename||""))throw new Error(`Digital-file update ${i+1} needs add or replace, an asset role and filename.`);if(file.action==="replace"&&!/^\d+$/.test(String(file.listingFileId||"")))throw new Error(`Digital-file replacement ${i+1} needs the existing Etsy file ID.`);}}
   if("personalization" in fields&&fields.personalization?.enabled!==false){const questions=fields.personalization?.personalization_questions;if(!Array.isArray(questions)||!questions.length)throw new Error("Personalisation requires at least one question or enabled:false.");for(const [i,q] of questions.entries()){if(!q?.question_text||String(q.question_text).length>45||!['text_input','dropdown','unlabeled_upload','labeled_upload'].includes(String(q.question_type)))throw new Error(`Personalisation question ${i+1} has an invalid label or type.`);if(q.instructions&&String(q.instructions).length>120)throw new Error(`Personalisation question ${i+1} instructions exceed 120 characters.`);if("required" in q&&typeof q.required!=="boolean")throw new Error(`Personalisation question ${i+1} required must be true or false.`);if(q.question_id!=null&&!/^\d+$/.test(String(q.question_id)))throw new Error(`Personalisation question ${i+1} has an invalid question ID.`);}}
   manifest.mode="edit";manifest.updateScope=[...new Set(scopes)];manifest.updateFields=fields;manifest.listingId=listingId;
  }else{
   const tags=Array.isArray(manifest?.tags)?manifest.tags.map((x:any)=>String(x).trim()).filter(Boolean):[];
   if(!manifest?.title||!manifest?.description)throw new Error("New Etsy listings require a listing title and full description.");
   if(String(manifest.title).length>140)throw new Error("Etsy listing titles must be 140 characters or fewer.");
   if(tags.length!==13||new Set(tags.map((x:string)=>x.toLowerCase())).size!==13)throw new Error("New Etsy listings require exactly 13 unique tags.");
   if(tags.some((x:string)=>x.length>20))throw new Error("Each Etsy tag must be 20 characters or fewer.");
   if(!(Number(manifest.price)>0))manifest.price=14.99;
   if(!(Number(manifest.quantity)>0))manifest.quantity=999;
   manifest.tags=tags;
  }
 }
 if(kind==="pinterest"&&(!Array.isArray(manifest?.pins)||(manifest.pins.length<1||manifest.pins.length>50)))throw new Error("Pinterest projects require 1–50 Pins.");
}
function output(data:unknown){return {content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data}}
async function publisherRequest(auth:string,path:string,init:RequestInit={}){
 const response=await fetch(etsyPublisher+path,{...init,headers:{authorization:auth,apikey:publishableKey,"content-type":"application/json",...(init.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Could not read the connected Etsy shop.");
 return data;
}
function normal(value:unknown){return String(value||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim()}
function trustedAssetUrl(raw:string){const u=new URL(raw);if(u.protocol!=="https:")return false;return ["oaiusercontent.com","blob.core.windows.net","amazonaws.com","chatgpt.com"].some(d=>u.hostname===d||u.hostname.endsWith("."+d))}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 const url=new URL(req.url);
 if(req.method==="GET"&&url.pathname.includes(".well-known/oauth-protected-resource"))return new Response(JSON.stringify({resource:endpoint,authorization_servers:[projectUrl+"/auth/v1"],scopes_supported:["openid","email"]}),{headers:{...cors,"content-type":"application/json"}});
 if(req.method!=="POST")return new Response("Method not allowed",{status:405,headers:{...cors,'cache-control':'no-store'}});
 let body:any;try{body=await req.json()}catch{return fail(null,-32700,"Invalid JSON",400)}
 const {id,method,params}=body;
 // Discovery is public metadata only. Every tools/call still requires a valid
 // owner session before any database, file, import or publishing action.
 if(method==="initialize")return rpc(id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"PlanThenRoam Seller Tools",version:API_CAPABILITY_VERSION},appVersion:APP_VERSION,apiCapabilityVersion:API_CAPABILITY_VERSION,instructions:'Storage retains one current DOCX per planner. Find its existing master identity, then upload the actual DOCX using upload_master_files or prepare_master_upload and commit_master_upload. Prepare Etsy edits, new Etsy listings, or Pinterest pins for owner approval. Only PDFs are customer downloads. Use stable submission keys for retries. Storage never publishes; all platform writes require owner approval in the app. Marketing Composer is available in the app and ChatGPT. Automatic art direction is the main workflow: get_automatic_campaign_context retrieves current assets, campaign plan, promotion and ten-campaign design history once. generate_marketing_campaign accepts exact copy, roles and page IDs for a configurable batch, default five square slides plus two portrait pins. Every output in a campaign shares typography, font sizes, colours, headline effects and CTA treatment. New campaigns have no hard back panels or filled CTA boxes. Style changes apply to the complete campaign; individual controls adjust layout and positioning. vary_marketing_campaign preserves content with locks and layout/typography/CTA controls. correct_marketing_campaign_output changes one output. Export through export_automatic_campaign with reviewed revisions and an explicit technical_test or owner_visual review kind; technical tests never grant owner approval. Save central promotions and editable priorities through save_composer_promotion and save_marketing_campaign_plan. Queued work has not started rendering. Legacy manual workflows remain supported: get_composer_campaign_brief retrieves the saved next campaign, exact copy, page titles, background scenes and typography history. Settle copy and images, submit_marketing_campaign once for five slides, then get_marketing_campaign for all previews and stage timings. Corrections resubmit five specifications with current revisions; only changed slides rerender. export_marketing_campaign returns five numbered PNGs and a ZIP after owner visual approval, expected_revision and review_token. save_composer_campaign_brief stores the queue and agreed copy across chats. preflight_marketing_campaign measures actual fonts before image rendering. Legacy single-slide actions remain supported. It renders square 1080x1080 or Pinterest 1000x1500 PNGs from approved backgrounds of the matching dimensions and current genuine pages. Pass output_type to catalogue and brief retrieval. Pinterest batches share one typography and effects system and require five different backgrounds. After visual approval and export, prepare_pin_review matches the existing Etsy listing and board, attach_project_asset_from_composer copies the reviewed PNG, and finalize_review_project sends it to the existing owner approval queue. It never publishes or schedules. Poll no more often than every 30 seconds; Immediate dispatch is used when its server credential is configured; the scheduled GitHub worker is backup. Read renderer_start for actual status.'});
 if(method==="ping")return rpc(id,{});
 if(method==="notifications/initialized")return new Response(null,{status:202,headers:cors});
 if(method==="tools/list")return rpc(id,{tools});
 if(method!=="tools/call")return fail(id,-32601,"Method not found");
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return unauthenticated(id,'Authentication required. Sign in to Seller Tools.');
 const token=auth.slice(7);
 const db=createClient(projectUrl,publishableKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:userData,error:userError}=await db.auth.getUser(token);
 if(userError||!userData.user)return unauthenticated(id,'Your Seller Tools session has expired. Sign in again.');
 const {data:owner}=await db.from("app_owners").select("user_id").eq("user_id",userData.user.id).maybeSingle();
 if(!owner)return new Response(JSON.stringify({error:"owner_access_required"}),{status:403,headers:{...cors,"content-type":"application/json",'cache-control':'no-store'}});
 const name=params?.name,args=params?.arguments||{};
 try{
  if(!supportedActions.has(name))throw new Error("This action is not part of the current Seller Studio workflow.");
  if(composerToolNames.has(name)){
   const admin=createClient(projectUrl,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
   return rpc(id,output(await handleComposer(name,args,{admin,userId:userData.user.id})));
  }
  if(masterToolNames.has(name)){
   const admin=createClient(projectUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
   return rpc(id,output(await handleMasterTool(name,args,{db,admin,userId:userData.user.id})));
  }
  if(name==='list_pinterest_boards')return rpc(id,output({boards:await listBoards(userData.user.id)}));
  if(name==='prepare_pin_review'){
   const boards=await listBoards(userData.user.id),board=boards.find((x:any)=>x.id===args.board_id);if(!board)throw new Error('Choose an existing Pinterest board from list_pinterest_boards.');
   const shop=await publisherRequest(auth,'?state=active'),q=normal(args.product_name),matches=(shop.listings||[]).filter((x:any)=>normal(x.title).includes(q));
   if(matches.length!==1)throw new Error('The planner must match exactly one active Etsy listing. Use its specific name.');
   if(!args.title?.trim()||args.title.length>100||!args.description?.trim()||args.description.length>800)throw new Error('Pin title or description exceeds the supported length.');
   const manifest={pins:[{title:args.title,description:args.description,altText:args.alt_text||args.title,board:board.name,boardId:board.id,link:'https://www.etsy.com/listing/'+matches[0].listing_id,imageRole:'pin-1'}]};
   const projectId=await submissionId(userData.user.id,args.idempotency_key);
   const fingerprint=await fingerprintOf(args);
   const existing=await db.from('review_projects').select('id,status,manifest').eq('id',projectId).maybeSingle();if(existing.error)throw existing.error;
   if(existing.data){if(existing.data.manifest.submissionFingerprint!==fingerprint)throw new Error('This idempotency key belongs to a different pin.');return rpc(id,output({project_id:projectId,status:existing.data.status,already_prepared:true}));}
   const saved=await db.from('review_projects').insert({id:projectId,kind:'pinterest',title:args.title,manifest:{...manifest,submissionFingerprint:fingerprint},media:[],source:'chatgpt',status:'editing'}).select('id,status').single();if(saved.error)throw saved.error;
   return rpc(id,output({project_id:projectId,status:saved.data.status,board:board.name,etsy_link:manifest.pins[0].link,next_action:'Attach pin-1, then finalize_review_project. Owner approval publishes.'}));
  }
  if(name==="list_etsy_shop_listings"){
   const state=args.state||"active",data=await publisherRequest(auth,`?state=${encodeURIComponent(state)}`);
   const q=normal(args.query);const listings=q?(data.listings||[]).filter((x:any)=>normal(x.title).includes(q)||q.includes(normal(x.title))):(data.listings||[]);
   return rpc(id,output({listings}));
  }
  if(name==="prepare_etsy_listing_update"){
   if(["price","tags","alt_text"].some(key=>key in args))throw new Error("Editing supports title, description, image replacements with alt text, and PDF replacements only.");
   if((args.digital_files||[]).some((f:any)=>f.action!=="replace"||!/\.pdf$/i.test(f.filename)))throw new Error("Choose an existing customer PDF to replace.");
   const projectId=await submissionId(userData.user.id,args.idempotency_key),fingerprint=await fingerprintOf(args);
   const prior=await db.from('review_projects').select('*').eq('id',projectId).maybeSingle();if(prior.error)throw prior.error;
   if(prior.data){if(prior.data.manifest.submissionFingerprint!==fingerprint)throw new Error('This submission key belongs to different content.');if(prior.data.manifest.preparationComplete)return rpc(id,output({ok:true,project:{id:projectId,status:prior.data.status},already_prepared:true}));}
   const state=args.state||"active",data=await publisherRequest(auth,`?state=${encodeURIComponent(state)}`);
   const q=normal(args.product_name),matches=(data.listings||[]).filter((x:any)=>normal(x.title).includes(q)||q.includes(normal(x.title)));
   if(matches.length===0)throw new Error(`No ${state} Etsy listing matched “${args.product_name}”. Use list_etsy_shop_listings to check the product name.`);
   if(matches.length>1)throw new Error(`More than one Etsy listing matched “${args.product_name}”. Use a more specific product name.`);
   const prepared=await publisherRequest(auth,"",{method:"POST",body:JSON.stringify({action:"prepare_edit",listing_id:matches[0].listing_id,submission_id:projectId,submission_fingerprint:fingerprint})});
   const requestedFields:any={};for(const key of ["title","description"])if(Object.prototype.hasOwnProperty.call(args,key))requestedFields[key]=args[key];
   const imageReplacements=Array.isArray(args.images)?args.images.map((x:any)=>({role:String(x.role),rank:Number(x.rank),altText:String(x.alt_text)})):[];
   const altTextUpdates=Array.isArray(args.alt_text)?args.alt_text.map((x:any)=>({listingImageId:String(x.listing_image_id),rank:Number(x.rank),altText:String(x.text)})):[];
   const fileUpdates=Array.isArray(args.digital_files)?args.digital_files.map((x:any)=>({action:String(x.action),role:String(x.role),filename:String(x.filename),listingFileId:x.listing_file_id==null?undefined:String(x.listing_file_id)})):[];
   const updateScope=[...Object.keys(requestedFields),...(imageReplacements.length?["images"]:[]),...(altTextUpdates.length?["alt_text"]:[]),...(fileUpdates.length?["files"]:[])];
   if(updateScope.length){const {data:preparedProject,error:preparedError}=await db.from("review_projects").select("*").eq("id",prepared.project.id).single();if(preparedError||!preparedProject)throw new Error("The prepared Etsy update could not be loaded.");const manifest={...(preparedProject.manifest||{}),updateFields:requestedFields,updateScope,imageReplacements,altTextUpdates,fileUpdates,imageUpdate:imageReplacements.length>0,preparationComplete:true};validate("etsy",manifest);const {error:configureError}=await db.from("review_projects").update({manifest,status:"editing",last_error:null}).eq("id",preparedProject.id).eq("revision",preparedProject.revision).eq("status",preparedProject.status).select("id").single();if(configureError)throw configureError;}
   return rpc(id,output({...prepared,matched_listing:matches[0],accepted_fields:updateScope,message:updateScope.length?"Only the supplied Etsy fields and assets were selected. Everything else remains untouched.":"The listing is prepared. Supply only the fields or assets you want changed."}));
  }
  if(name==="create_review_project"){
   if(args.kind==='pinterest')throw new Error('Use prepare_pin_review to match an existing board and Etsy listing.');
   if(!bucketFor[args.kind]||!args.title||typeof args.manifest!=="object")throw new Error("kind, title and manifest are required.");
   validate(args.kind,args.manifest);
   if(args.manifest.mode==='edit')throw new Error('Use prepare_etsy_listing_update to capture the live listing first.');
   const projectId=await submissionId(userData.user.id,args.idempotency_key),fingerprint=await fingerprintOf({kind:args.kind,title:args.title,manifest:args.manifest});
   const existing=await db.from('review_projects').select('id,kind,title,status,revision,manifest').eq('id',projectId).maybeSingle();if(existing.error)throw existing.error;
   if(existing.data){if(existing.data.manifest.submissionFingerprint!==fingerprint)throw new Error('This submission key belongs to different content.');const {manifest,...safe}=existing.data;return rpc(id,output({...safe,already_prepared:true}));}
   const defaults=await publisherRequest(auth,'?defaults=1');
   const {data,error}=await db.from("review_projects").insert({id:projectId,kind:args.kind,title:String(args.title).slice(0,180),manifest:{...args.manifest,listingDefaults:defaults.defaults,price:defaults.defaults.price,quantity:defaults.defaults.quantity,submissionFingerprint:fingerprint},media:[],source:"chatgpt",status:"editing"}).select("id,kind,title,status,revision").single();
   if(error)throw error;return rpc(id,output(data));
  }
  if(name==="list_review_projects"){
   let query=db.from("review_projects").select("id,kind,title,status,manifest,revision,revision_request,scheduled_for,updated_at").in("kind",["etsy","pinterest"]).order("updated_at",{ascending:false}).limit(50);
   if(args.kind)query=query.eq("kind",args.kind);if(args.status)query=query.eq("status",args.status);
   // Review reads must not fetch the entire Etsy shop. Live listing details have a dedicated tool.
   const {data,error}=await query;if(error)throw error;return rpc(id,output({seller_tools_status:{app_version:APP_VERSION,api_capability_version:API_CAPABILITY_VERSION,server:"PlanThenRoam Seller Tools",live:true,master_files:true},master_files_workflow:"Use list_master_files and get_master_file before editing. Save through prepare_master_upload and commit_master_upload. Master saves never publish to Etsy.",mcp_registration:registration,projects:data,etsy_listings:[],etsy_listings_included:false,etsy_listings_next_action:"Use list_etsy_shop_listings with a product query when live Etsy details are needed."}));
  }
  const {data:project,error:projectError}=await db.from("review_projects").select("*").eq("id",args.project_id).single();
  if(!project&&name==="clear_review_project"&&args.confirmed===true)return rpc(id,output({project_id:args.project_id,deleted:true,already_deleted:true}));
  if(projectError||!project)throw new Error("Project not found or access denied.");
  if(!["etsy","pinterest"].includes(project.kind))throw new Error("Seller Tools supports Etsy and Pinterest projects only.");
  if(name!=="clear_review_project"&&args.expected_revision!==project.revision)throw new Error("The submission changed. Read its current revision before saving.");
  if(name!=="clear_review_project"&&["publishing","published","changes_requested","failed"].includes(project.status))throw new Error("This submission is locked or cancelled. Refresh before making changes.");
  if(name==="attach_project_asset"||name==="attach_project_asset_from_url"||name==="attach_project_asset_from_composer"){
   let bytes:Uint8Array,contentType=String(args.content_type||"application/octet-stream");
   if(name==="attach_project_asset_from_composer"){const admin=createClient(projectUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});const pin=await readPinAsset(admin,userData.user.id,project,args);bytes=pin.bytes;args.role=pin.role;args.filename=pin.filename;args.is_preview=true;contentType="image/png";}
   else if(name==="attach_project_asset"){if(typeof args.base64_data!=="string"||args.base64_data.length>9_000_000)throw new Error("Base64 asset is missing or exceeds the 6 MB direct-upload limit. Use the trusted URL tool for larger files.");bytes=Uint8Array.from(atob(args.base64_data),c=>c.charCodeAt(0))}
   else{if(!trustedAssetUrl(args.source_url))throw new Error("Asset URL must be an HTTPS ChatGPT/OpenAI cloud file URL.");const response=await fetch(args.source_url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("Could not download the supplied asset URL.");const size=Number(response.headers.get("content-length")||0);if(size>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");const buf=await response.arrayBuffer();if(buf.byteLength>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");bytes=new Uint8Array(buf);contentType=args.content_type||response.headers.get("content-type")||contentType}
   const allowed=project.kind==='pinterest'?(project.manifest.pins||[]).map((p:any)=>p.imageRole):project.manifest.mode==='edit'?[...(project.manifest.imageReplacements||[]),...(project.manifest.fileUpdates||[])].map((p:any)=>p.role):['thumbnail','listing-image-1','listing-image-2','listing-image-3','listing-image-4','listing-image-5','customer-pdf'];
   if(!allowed.includes(args.role))throw new Error('This asset role is not selected in the submission.');
   const pdf=args.role==='customer-pdf'||(project.manifest.fileUpdates||[]).some((f:any)=>f.role===args.role);
   const verified=await validateAssetBlob({name:args.filename},new Blob([bytes],{type:contentType}),pdf?'pdf':'image');contentType=verified.mime;
   const digest=await crypto.subtle.digest("SHA-256",bytes);const checksum=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
   const prior=(Array.isArray(project.media)?project.media:[]).find((x:any)=>x.role===String(args.role));
   if(prior?.checksum===checksum&&prior?.name===args.filename)return rpc(id,output({project_id:project.id,role:args.role,stored:true,already_saved:true,revision:project.revision,size:bytes.byteLength,checksum}));
   const path=`${userData.user.id}/${project.id}/${crypto.randomUUID()}-${cleanName(args.filename)}`,bucket=bucketFor[project.kind];
   const {error:uploadError}=await db.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});if(uploadError)throw uploadError;
   const media=[...(Array.isArray(project.media)?project.media:[]).filter((x:any)=>x.role!==String(args.role)),{role:String(args.role),path,name:String(args.filename),mime:contentType,size:bytes.byteLength,checksum,upload_status:"stored",storage_status:"verified"}];
   const changes:any={media,status:"editing"};if(args.is_preview||prior?.path===project.preview_path)changes.preview_path=path;
   const {error:updateError}=await db.from("review_projects").update(changes).eq("id",project.id).eq("revision",project.revision).eq("status",project.status).select("id").single();if(updateError){await db.storage.from(bucket).remove([path]);throw updateError}
   const admin=createClient(projectUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
   await drainStorageCleanup(admin,userData.user.id);
   return rpc(id,output({project_id:project.id,role:args.role,stored:true,fetchable:true,revision:project.revision+1,size:bytes.byteLength,checksum}));
  }
  if(name==="finalize_review_project"){
   validate(project.kind,project.manifest);const media=Array.isArray(project.media)?project.media:[];
   if(project.kind==="etsy"){
    const roles=new Set(media.map((x:any)=>String(x.role)));
    if(project.manifest?.mode==="edit"){
     const scopes=Array.isArray(project.manifest.updateScope)?project.manifest.updateScope:project.manifest.updateScope==="images_only"?["images"]:[];
     if(scopes.includes("images")){for(const image of project.manifest.imageReplacements||[])if(!roles.has(String(image.role)))throw new Error(`Attach image replacement ${image.role}.`);}
     if(scopes.includes("files")){for(const file of project.manifest.fileUpdates||[])if(!roles.has(String(file.role)))throw new Error(`Attach digital file ${file.filename}.`);}
    }else{
     const required=["thumbnail","listing-image-1","listing-image-2","listing-image-3","listing-image-4","listing-image-5","customer-pdf"];
     if(required.some(role=>!roles.has(role)))throw new Error("Attach the customer PDF, thumbnail and all five listing images before finalizing.");
    }
   }
   if(project.kind==="pinterest"&&!project.manifest.pins.every((p:any,i:number)=>media.some((x:any)=>x.role===(p.imageRole||`pin-${i+1}`))))throw new Error("Attach an image for each Pin before finalizing.");
   for(const asset of media){if(typeof asset.path!=='string'||!asset.path.startsWith(userData.user.id+'/'+project.id+'/'))throw new Error('Invalid asset ownership.');const stored=await db.storage.from(bucketFor[project.kind]).download(asset.path);if(stored.error)throw stored.error;const pdf=asset.role==='customer-pdf'||(project.manifest.fileUpdates||[]).some((f:any)=>f.role===asset.role);await validateAssetBlob(asset,stored.data,pdf?'pdf':'image');}
   const status="ready";
   const {error}=await db.from("review_projects").update({status,preview_path:project.preview_path,revision_request:null,last_error:null}).eq("id",project.id).eq("revision",project.revision).eq("status",project.status).select("id").single();if(error)throw error;
   return rpc(id,output({project_id:project.id,status,revision:project.revision}));
  }
  if(name==="update_review_project"){
   const changes:any={revision:project.revision+1};if(args.title)changes.title=String(args.title).slice(0,180);if(args.manifest){
    const next={...args.manifest};
    for(const key of ['mode','listingId','existingSnapshot','existingImages','existingFiles','submissionFingerprint','etsyPublish','pinAttempted','preparationComplete','listingDefaults']){
     if(stableJson(next[key])!==stableJson(project.manifest[key]))throw new Error(`Cannot change protected submission field ${key}. Prepare a fresh submission.`);
    }
    if(project.kind==='pinterest'&&JSON.stringify((next.pins||[]).map((p:any)=>[p.boardId,p.link,p.imageRole]))!==JSON.stringify((project.manifest.pins||[]).map((p:any)=>[p.boardId,p.link,p.imageRole])))throw new Error('Prepare a fresh pin to change its planner or board.');
    validate(project.kind,next);changes.manifest=next;changes.status='editing';
   }if(args.mark_ready)throw new Error("Use finalize_review_project to verify the required assets before approval.");
   const {error}=await db.from("review_projects").update(changes).eq("id",project.id).eq("revision",project.revision).eq("status",project.status).select("id").single();if(error)throw error;return rpc(id,output({project_id:project.id,updated:true,revision:changes.revision}));
  }
  if(name==="clear_review_project"){
   if(args.confirmed!==true)throw new Error("Confirm cancellation before deleting the submission.");
   const admin=createClient(projectUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
   return rpc(id,output(await cancelReview(admin,project,userData.user.id,async(listingId:string)=>{
    for(const state of ['active','draft','inactive','expired','sold_out']){
     const data=await publisherRequest(auth,'?state='+state);
     const listing=(data.listings||[]).find((item:any)=>String(item.listing_id)===listingId);
     if(listing)return listing;
    }
    throw new Error('The Etsy listing could not be found. This submission has been kept.');
   })));
  }
  return fail(id,-32601,"Unknown tool");
 }catch(error){if((error as any)?.validation)return rpc(id,{isError:true,content:[{type:'text',text:JSON.stringify({error:(error as Error).message,validation:(error as any).validation})}],structuredContent:{error:(error as Error).message,validation:(error as any).validation}});return fail(id,-32000,error instanceof Error?error.message:"Tool failed")}
});
