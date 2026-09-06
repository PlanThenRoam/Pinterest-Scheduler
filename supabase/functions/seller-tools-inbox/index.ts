import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const endpoint = projectUrl + "/functions/v1/seller-tools-inbox";
const etsyPublisher = projectUrl + "/functions/v1/etsy-publish";
const bucketFor: Record<string,string> = {tiktok:"tiktok-media",etsy:"etsy-assets",pinterest:"pinterest-media"};
const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type, mcp-protocol-version","access-control-allow-methods":"GET,POST,OPTIONS"};

const tools = [
 {name:"list_etsy_shop_listings",description:"Find the owner's current Etsy listings by product name before preparing an update. Use this whenever the owner names an existing product; do not ask them for a listing ID.",inputSchema:{type:"object",additionalProperties:false,properties:{query:{type:"string",description:"Optional product name or destination to match."},state:{type:"string",enum:["active","draft","inactive","expired","sold_out"]}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}},
 {name:"prepare_etsy_listing_update",description:"Create a private field-scoped Seller Tools update project for one existing Etsy product. Only fields explicitly supplied later in manifest.updateFields, imageUpdate or fileReplacements can change; all omitted Etsy fields remain untouched.",inputSchema:{type:"object",additionalProperties:false,required:["product_name"],properties:{product_name:{type:"string",minLength:2},state:{type:"string",enum:["active","draft","inactive","expired","sold_out"]}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},
 {name:"create_review_project",description:"Create one private TikTok, Etsy or Pinterest project after the owner has approved its complete content plan. For TikTok, send the exact scene copy and rendering recipe; Seller Tools creates the MP4.",inputSchema:{type:"object",additionalProperties:false,required:["kind","title","manifest"],properties:{kind:{type:"string",enum:["tiktok","etsy","pinterest"]},title:{type:"string",minLength:1,maxLength:180},manifest:{type:"object",description:"Complete manifest. TikTok needs 6-8 scenes, five hashtags and the full approved render recipe; Etsy needs title, description, price, quantity, exactly 13 unique tags, six image alt texts and optional taxonomyId; Pinterest needs exactly 10 pins."}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:"attach_project_asset",description:"Attach or replace one base64-encoded project asset. TikTok backgrounds use scene-N and genuine PDF-rendered overlays use planner-page-N. Reusing a role replaces only that asset.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","filename","role","content_type","base64_data"],properties:{project_id:{type:"string",format:"uuid"},filename:{type:"string"},role:{type:"string",description:"Examples: scene-1, planner-page-1, customer-pdf, thumbnail, listing-image-1, pin-1. Do not attach a TikTok video."},content_type:{type:"string"},base64_data:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"attach_project_asset_from_url",description:"Copy an HTTPS asset from a trusted ChatGPT/OpenAI cloud URL into the owner's private Seller Tools storage.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","source_url","filename","role"],properties:{project_id:{type:"string",format:"uuid"},source_url:{type:"string",format:"uri"},filename:{type:"string"},role:{type:"string"},content_type:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},
 {name:"finalize_review_project",description:"Validate all attached assets. TikTok is handed to Seller Tools for MP4 rendering; Etsy and Pinterest are marked ready for review. This does not publish.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"list_review_projects",description:"List private Seller Tools projects and revision requests without returning binary files.",inputSchema:{type:"object",additionalProperties:false,properties:{status:{type:"string",enum:["draft","uploading_assets","assets_verified","ready_to_render","rendering","ready","changes_requested","approved","scheduled","publishing","published","failed"]},kind:{type:"string",enum:["tiktok","etsy","pinterest"]}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"update_review_project",description:"Update the manifest or replace the title of one existing project. Preserve fields the owner did not ask to change.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"},title:{type:"string"},manifest:{type:"object"},mark_ready:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"clear_review_project",description:"Permanently delete one named review project and all of its stored media. Always ask the owner to confirm immediately before calling.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","confirmed"],properties:{project_id:{type:"string",format:"uuid"},confirmed:{type:"boolean",const:true}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}}
];

function rpc(id: unknown, result: unknown, status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,result}),{status,headers:{...cors,"content-type":"application/json"}})}
function fail(id: unknown, code:number,message:string,status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,error:{code,message}}),{status,headers:{...cors,"content-type":"application/json"}})}
function cleanName(value:string){return (value||"asset").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-120)||"asset"}
function validate(kind:string, manifest:any){
 if(kind==="tiktok"){
  if(!Array.isArray(manifest?.scenes)||manifest.scenes.length!==6)throw new Error("Planner TikTok projects require exactly six scenes.");
  if(!Array.isArray(manifest?.hashtags)||manifest.hashtags.length!==5)throw new Error("TikTok projects require exactly five hashtags.");
  if(!manifest.coverTitle||!manifest.caption||!manifest.soundRecommendation)throw new Error("TikTok projects require a cover title, caption and sound recommendation.");
  if(manifest.videoFile||manifest.previewFile)throw new Error("Do not attach or name a finished TikTok video. Seller Tools renders the MP4.");
  const recipe=manifest.render||manifest.renderRecipe;
  const required=["style","typography","photoTreatment","textColour","textProtection","transition","transitionSpeed","motionIntensity","speedCurve","overlay","atmosphere","framing","effectIntensity","textAnimation"];
  if(!recipe||required.some(k=>!recipe[k]))throw new Error("TikTok projects require the complete approved rendering recipe.");
  manifest.scenes.forEach((scene:any,i:number)=>{
   const bg=scene?.background||{};const page=scene?.plannerPage||null;
   if(!(scene?.imageFile||bg.imageFile)||!(scene.heading||scene.text)||!(Number(scene.duration)>0)||!(scene.motion||bg.motion)||!(scene.position||scene.textPosition)||!(scene.transition||scene.transitionOverride)||!(scene.textAnimation||scene.textAnimationOverride))throw new Error(`TikTok scene ${i+1} is missing its background, exact text, duration, movement, placement, transition or text animation.`);
   if(page){if(!page.imageFile||!(Number(page.sourcePdfPage)>0))throw new Error(`TikTok scene ${i+1} planner page needs an exact filename and source PDF page.`);if((page.motion||"none")!=="none"||page.lockedToViewport!==true)throw new Error(`TikTok scene ${i+1} planner page must be static and locked to the viewport.`);if(!["centre","centre-upper","centre-lower","left","right","full-page","cover"].includes(page.position||"centre"))throw new Error(`TikTok scene ${i+1} has an unsupported planner-page position.`);}
   const fx=Number(bg.focalX??scene.focalX??.5),fy=Number(bg.focalY??scene.focalY??.5);if(fx<0||fx>1||fy<0||fy>1)throw new Error(`TikTok scene ${i+1} focal coordinates must be between 0 and 1.`);
  });
 }
 if(kind==="etsy"){
  if(manifest?.mode==="edit"||manifest?.updateScope==="images_only"){
   const listingId=String(manifest.listingId||manifest.etsyListingId||"");
   if(!/^\d+$/.test(listingId))throw new Error("Etsy updates require the exact existing listing ID.");
   const legacyImages=manifest.updateScope==="images_only";const fields=manifest.updateFields&&typeof manifest.updateFields==="object"?manifest.updateFields:{};
   const scopes=Array.isArray(manifest.updateScope)?manifest.updateScope.map(String):legacyImages?["images"]:[...Object.keys(fields),...(manifest.imageUpdate?["images"]:[]),...(manifest.fileReplacements?.length?["files"]:[])];
   const allowed=["title","description","price","quantity","tags","taxonomyId","shopSectionId","materials","styles","whoMade","whenMade","isSupply","isTaxable","autoRenew","state","personalization","images","files"];
   if(!scopes.length||scopes.some((x:string)=>!allowed.includes(x)))throw new Error("Choose at least one supported Etsy field to update.");
   if(Object.keys(fields).some(x=>!allowed.includes(x)||["images","files"].includes(x)))throw new Error("The Etsy update contains an unsupported field.");
   if(Object.keys(fields).some(x=>!scopes.includes(x))||scopes.some((x:string)=>!["images","files"].includes(x)&&!Object.prototype.hasOwnProperty.call(fields,x)))throw new Error("Every Etsy update scope must have exactly one approved value.");
   if("title" in fields&&(!String(fields.title).trim()||String(fields.title).length>140))throw new Error("Etsy titles must be 1–140 characters.");
   if("description" in fields&&!String(fields.description).trim())throw new Error("The Etsy description cannot be empty.");
   if("price" in fields&&!(Number(fields.price)>0))throw new Error("The Etsy price must be greater than zero.");
   if("quantity" in fields&&!(Number.isInteger(Number(fields.quantity))&&Number(fields.quantity)>0))throw new Error("The Etsy quantity must be a positive whole number.");
   for(const key of ["isSupply","isTaxable","autoRenew"])if(key in fields&&typeof fields[key]!=="boolean")throw new Error(`Etsy ${key} must be true or false.`);
   if("whoMade" in fields&&!['i_did','collective','someone_else'].includes(String(fields.whoMade)))throw new Error("Etsy whoMade must be i_did, collective or someone_else.");
   if("whenMade" in fields&&!String(fields.whenMade).trim())throw new Error("Etsy whenMade cannot be empty.");
   if("taxonomyId" in fields&&!/^\d+$/.test(String(fields.taxonomyId)))throw new Error("The Etsy category requires a numeric taxonomy ID.");
   if("shopSectionId" in fields&&!/^\d+$/.test(String(fields.shopSectionId)))throw new Error("The Etsy shop section requires a numeric section ID.");
   if("state" in fields&&!['active','draft','inactive'].includes(String(fields.state)))throw new Error("Etsy state must be active, draft or inactive.");
   for(const key of ["materials","styles"])if(key in fields&&(!Array.isArray(fields[key])||fields[key].some((x:any)=>!String(x).trim())))throw new Error(`Etsy ${key} must be a list of non-empty values.`);
   if("tags" in fields){const tags=Array.isArray(fields.tags)?fields.tags.map((x:any)=>String(x).trim()).filter(Boolean):[];if(tags.length!==13||new Set(tags.map((x:string)=>x.toLowerCase())).size!==13||tags.some((x:string)=>x.length>20))throw new Error("Etsy tags require exactly 13 unique entries, each 20 characters or fewer.");fields.tags=tags;}
   if(scopes.includes("images")){const legacyAlt=Array.isArray(manifest.altText)?manifest.altText.map((x:any)=>String(x).trim()):[],replacements=Array.isArray(manifest.imageReplacements)&&manifest.imageReplacements.length?manifest.imageReplacements:(legacyAlt.length===6?["thumbnail","listing-image-1","listing-image-2","listing-image-3","listing-image-4","listing-image-5"].map((role,i)=>({role,rank:i+1,altText:legacyAlt[i]})):[]);if(!replacements.length||replacements.length>10)throw new Error("Image updates require one to ten explicit replacements.");const ranks=new Set<number>();for(const [i,image] of replacements.entries()){const rank=Number(image?.rank),role=String(image?.role||""),alt=String(image?.altText||"").trim();if(!role||!Number.isInteger(rank)||rank<1||rank>10||!alt)throw new Error(`Image replacement ${i+1} needs a role, rank from 1 to 10 and alt text.`);if(ranks.has(rank))throw new Error("Image replacement ranks must be unique.");ranks.add(rank);image.rank=rank;image.altText=alt;}manifest.imageReplacements=replacements;manifest.imageUpdate=true;}
   if(scopes.includes("files")){const files=Array.isArray(manifest.fileReplacements)?manifest.fileReplacements:[];if(!files.length||files.length>5)throw new Error("Digital-file updates require one to five explicit file replacements.");for(const [i,file] of files.entries()){if(!file?.role||!/^\d+$/.test(String(file.listingFileId||""))||!file.filename)throw new Error(`Digital-file replacement ${i+1} needs a role, existing Etsy file ID and filename.`);}}
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
 if(kind==="pinterest"&&(!Array.isArray(manifest?.pins)||manifest.pins.length!==10))throw new Error("Pinterest projects require exactly 10 Pins.");
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
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return new Response(JSON.stringify({error:"authentication_required"}),{status:401,headers:{...cors,"content-type":"application/json","www-authenticate":`Bearer resource_metadata="${endpoint}/.well-known/oauth-protected-resource"`}});
 const token=auth.slice(7);
 const db=createClient(projectUrl,publishableKey,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:userData,error:userError}=await db.auth.getUser(token);
 if(userError||!userData.user)return new Response(JSON.stringify({error:"invalid_token"}),{status:401,headers:{...cors,"content-type":"application/json"}});
 const {data:owner}=await db.from("app_owners").select("user_id").eq("user_id",userData.user.id).maybeSingle();
 if(!owner)return new Response(JSON.stringify({error:"owner_access_required"}),{status:403,headers:{...cors,"content-type":"application/json"}});
 if(req.method!=="POST")return new Response("Method not allowed",{status:405,headers:cors});
 let body:any;try{body=await req.json()}catch{return fail(null,-32700,"Invalid JSON",400)}
 const {id,method,params}=body;
 if(method==="initialize")return rpc(id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"PlanThenRoam Seller Tools",version:"1.1.0"}});
 if(method==="ping")return rpc(id,{});
 if(method==="notifications/initialized")return new Response(null,{status:202,headers:cors});
 if(method==="tools/list")return rpc(id,{tools});
 if(method!=="tools/call")return fail(id,-32601,"Method not found");
 const name=params?.name,args=params?.arguments||{};
 try{
  if(name==="list_etsy_shop_listings"){
   const state=args.state||"active",data=await publisherRequest(auth,`?state=${encodeURIComponent(state)}`);
   const q=normal(args.query);const listings=q?(data.listings||[]).filter((x:any)=>normal(x.title).includes(q)||q.includes(normal(x.title))):(data.listings||[]);
   return rpc(id,output({listings}));
  }
  if(name==="prepare_etsy_listing_update"){
   const state=args.state||"active",data=await publisherRequest(auth,`?state=${encodeURIComponent(state)}`);
   const q=normal(args.product_name),matches=(data.listings||[]).filter((x:any)=>normal(x.title).includes(q)||q.includes(normal(x.title)));
   if(matches.length===0)throw new Error(`No ${state} Etsy listing matched “${args.product_name}”. Use list_etsy_shop_listings to check the product name.`);
   if(matches.length>1)throw new Error(`More than one Etsy listing matched “${args.product_name}”. Use a more specific product name.`);
   const {data:drafts}=await db.from("review_projects").select("id,title,media").eq("kind","etsy").is("platform_id",null).in("status",["editing","ready","failed"]).order("created_at",{ascending:false}).limit(20);
   const reusable=(drafts||[]).find((p:any)=>normal(p.title).includes(q)||q.includes(normal(p.title).replace(" etsy listing update","")));
   const prepared=await publisherRequest(auth,"",{method:"POST",body:JSON.stringify({action:"prepare_edit",listing_id:matches[0].listing_id,reuse_project_id:reusable?.id||null})});
   return rpc(id,output({...prepared,matched_listing:matches[0],message:"Add only requested values to manifest.updateFields and updateScope. Omitted Etsy fields remain untouched."}));
  }
  if(name==="create_review_project"){
   if(!bucketFor[args.kind]||!args.title||typeof args.manifest!=="object")throw new Error("kind, title and manifest are required.");
   validate(args.kind,args.manifest);
   const {data,error}=await db.from("review_projects").insert({kind:args.kind,title:String(args.title).slice(0,180),manifest:args.manifest,media:[],source:"chatgpt",status:"editing"}).select("id,kind,title,status,revision").single();
   if(error)throw error;return rpc(id,output(data));
  }
  if(name==="list_review_projects"){
   let query=db.from("review_projects").select("id,kind,title,status,manifest,revision,revision_request,scheduled_for,updated_at").order("updated_at",{ascending:false}).limit(50);
   if(args.kind)query=query.eq("kind",args.kind);if(args.status)query=query.eq("status",args.status);
   const {data,error}=await query;if(error)throw error;let etsy_listings:any[]=[];if(args.kind==="etsy"){const shop=await publisherRequest(auth,"?state=active");etsy_listings=shop.listings||[]}return rpc(id,output({projects:data,etsy_listings}));
  }
  const {data:project,error:projectError}=await db.from("review_projects").select("*").eq("id",args.project_id).single();
  if(projectError||!project)throw new Error("Project not found or access denied.");
  if(name==="attach_project_asset"||name==="attach_project_asset_from_url"){
   if(project.kind==="tiktok"&&(args.role==="video"||args.role==="preview"||args.is_preview===true))throw new Error("Attach the approved scene images only. Seller Tools creates the TikTok MP4.");
   let bytes:Uint8Array,contentType=String(args.content_type||"application/octet-stream");
   if(name==="attach_project_asset"){if(typeof args.base64_data!=="string"||args.base64_data.length>9_000_000)throw new Error("Base64 asset is missing or exceeds the 6 MB direct-upload limit. Use the trusted URL tool for larger files.");bytes=Uint8Array.from(atob(args.base64_data),c=>c.charCodeAt(0))}
   else{if(!trustedAssetUrl(args.source_url))throw new Error("Asset URL must be an HTTPS ChatGPT/OpenAI cloud file URL.");const response=await fetch(args.source_url);if(!response.ok)throw new Error("Could not download the supplied asset URL.");const size=Number(response.headers.get("content-length")||0);if(size>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");const buf=await response.arrayBuffer();if(buf.byteLength>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");bytes=new Uint8Array(buf);contentType=args.content_type||response.headers.get("content-type")||contentType}
   const path=`${userData.user.id}/${project.id}/${crypto.randomUUID()}-${cleanName(args.filename)}`,bucket=bucketFor[project.kind];
   const {error:uploadError}=await db.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});if(uploadError)throw uploadError;
   const digest=await crypto.subtle.digest("SHA-256",bytes);const checksum=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
   const prior=(Array.isArray(project.media)?project.media:[]).find((x:any)=>x.role===String(args.role));
   const media=[...(Array.isArray(project.media)?project.media:[]).filter((x:any)=>x.role!==String(args.role)),{role:String(args.role),path,name:String(args.filename),mime:contentType,size:bytes.byteLength,checksum,upload_status:"stored",storage_status:"verified"}];
   const changes:any={media,status:"editing"};if(args.is_preview||args.role==="video")changes.preview_path=path;
   const {error:updateError}=await db.from("review_projects").update(changes).eq("id",project.id);if(updateError){await db.storage.from(bucket).remove([path]);throw updateError}if(prior?.path)await db.storage.from(bucket).remove([prior.path]);
   return rpc(id,output({project_id:project.id,role:args.role,stored:true,fetchable:true,size:bytes.byteLength,checksum}));
  }
  if(name==="finalize_review_project"){
   validate(project.kind,project.manifest);const media=Array.isArray(project.media)?project.media:[];
   if(project.kind==="tiktok"){
    const roles=media.map((x:any)=>String(x.role));if(new Set(roles).size!==roles.length)throw new Error("Duplicate asset roles are not allowed.");
    for(let i=0;i<project.manifest.scenes.length;i++){const scene=project.manifest.scenes[i],bgRole=scene.imageRole||`scene-${i+1}`;if(!roles.includes(bgRole))throw new Error(`Scene ${i+1} background ${scene.background?.imageFile||scene.imageFile||bgRole} is missing.`);if(scene.plannerPage&&!roles.includes(scene.plannerPage.role||`planner-page-${i+1}`))throw new Error(`Scene ${i+1} planner overlay ${scene.plannerPage.imageFile} is missing.`);}
   }
   if(project.kind==="etsy"){
    const roles=new Set(media.map((x:any)=>String(x.role)));
    if(project.manifest?.mode==="edit"){
     const scopes=Array.isArray(project.manifest.updateScope)?project.manifest.updateScope:project.manifest.updateScope==="images_only"?["images"]:[];
     if(scopes.includes("images")){for(const image of project.manifest.imageReplacements||[])if(!roles.has(String(image.role)))throw new Error(`Attach image replacement ${image.role}.`);}
     if(scopes.includes("files")){for(const file of project.manifest.fileReplacements||[])if(!roles.has(String(file.role)))throw new Error(`Attach digital-file replacement ${file.filename}.`);}
    }else{
     const required=["thumbnail","listing-image-1","listing-image-2","listing-image-3","listing-image-4","listing-image-5","customer-pdf"];
     if(required.some(role=>!roles.has(role)))throw new Error("Attach the customer PDF, thumbnail and all five listing images before finalizing.");
    }
   }
   if(project.kind==="pinterest"&&!project.manifest.pins.every((p:any,i:number)=>media.some((x:any)=>x.role===(p.imageRole||`pin-${i+1}`))))throw new Error("Attach an image for each of the 10 Pins before finalizing.");
   const status=project.kind==="tiktok"?"assets_verified":"ready";
   const {error}=await db.from("review_projects").update({status,preview_path:project.kind==="tiktok"?null:project.preview_path,revision_request:null,last_error:null}).eq("id",project.id);if(error)throw error;
   return rpc(id,output(project.kind==="tiktok"?{project_id:project.id,status,render_pending:true,message:"All assets are verified. Seller Tools will create the silent MP4 when the owner opens the TikTok Review Box."}:{project_id:project.id,status}));
  }
  if(name==="update_review_project"){
   const changes:any={revision:project.revision+1};if(args.title)changes.title=String(args.title).slice(0,180);if(args.manifest){validate(project.kind,args.manifest);changes.manifest=args.manifest}if(args.mark_ready){changes.status=project.kind==="tiktok"?"assets_verified":"ready";changes.revision_request=null}
   const {error}=await db.from("review_projects").update(changes).eq("id",project.id);if(error)throw error;return rpc(id,output({project_id:project.id,updated:true,revision:changes.revision}));
  }
  if(name==="clear_review_project"){
   if(args.confirmed!==true)throw new Error("The owner must explicitly confirm deletion.");const paths=[...new Set([project.preview_path,...(project.media||[]).map((x:any)=>x.path)].filter(Boolean))] as string[];if(paths.length){const {error}=await db.storage.from(bucketFor[project.kind]).remove(paths);if(error)throw error}const {error}=await db.from("review_projects").delete().eq("id",project.id);if(error)throw error;return rpc(id,output({project_id:project.id,deleted:true}));
  }
  return fail(id,-32601,"Unknown tool");
 }catch(error){return fail(id,-32000,error instanceof Error?error.message:"Tool failed")}
});
