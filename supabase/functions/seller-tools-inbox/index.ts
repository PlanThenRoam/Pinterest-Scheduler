import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";

const projectUrl = Deno.env.get("SUPABASE_URL")!;
const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const endpoint = projectUrl + "/functions/v1/seller-tools-inbox";
const bucketFor: Record<string,string> = {tiktok:"tiktok-media",etsy:"etsy-assets",pinterest:"pinterest-media"};
const cors = {"access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type, mcp-protocol-version","access-control-allow-methods":"GET,POST,OPTIONS"};

const tools = [
 {name:"create_review_project",description:"Create one private TikTok, Etsy or Pinterest project in the owner's Seller Tools Review Box. This changes cloud data but does not publish.",inputSchema:{type:"object",additionalProperties:false,required:["kind","title","manifest"],properties:{kind:{type:"string",enum:["tiktok","etsy","pinterest"]},title:{type:"string",minLength:1,maxLength:180},manifest:{type:"object",description:"Complete manifest. TikTok needs 6-8 scenes; Etsy needs 13 tags; Pinterest needs exactly 10 pins."}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:"attach_project_asset",description:"Attach a base64-encoded image, PDF or compact video to an existing review project. Use the returned project only after all assets are attached.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","filename","role","content_type","base64_data"],properties:{project_id:{type:"string",format:"uuid"},filename:{type:"string"},role:{type:"string",description:"Examples: video, scene-1, customer-pdf, thumbnail, listing-image-1, pin-1."},content_type:{type:"string"},base64_data:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},
 {name:"attach_project_asset_from_url",description:"Copy an HTTPS asset from a trusted ChatGPT/OpenAI cloud URL into the owner's private Seller Tools storage.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","source_url","filename","role"],properties:{project_id:{type:"string",format:"uuid"},source_url:{type:"string",format:"uri"},filename:{type:"string"},role:{type:"string"},content_type:{type:"string"},is_preview:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true}},
 {name:"finalize_review_project",description:"Validate a project after its assets are attached and mark it ready for the owner to review. This does not publish.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"list_review_projects",description:"List private Seller Tools projects and revision requests without returning binary files.",inputSchema:{type:"object",additionalProperties:false,properties:{status:{type:"string",enum:["ready","editing","approved","scheduled","publishing","published","failed"]},kind:{type:"string",enum:["tiktok","etsy","pinterest"]}}},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"update_review_project",description:"Update the manifest or replace the title of one existing project. Preserve fields the owner did not ask to change.",inputSchema:{type:"object",additionalProperties:false,required:["project_id"],properties:{project_id:{type:"string",format:"uuid"},title:{type:"string"},manifest:{type:"object"},mark_ready:{type:"boolean"}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"clear_review_project",description:"Permanently delete one named review project and all of its stored media. Always ask the owner to confirm immediately before calling.",inputSchema:{type:"object",additionalProperties:false,required:["project_id","confirmed"],properties:{project_id:{type:"string",format:"uuid"},confirmed:{type:"boolean",const:true}}},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:false}}
];

function rpc(id: unknown, result: unknown, status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,result}),{status,headers:{...cors,"content-type":"application/json"}})}
function fail(id: unknown, code:number,message:string,status=200){return new Response(JSON.stringify({jsonrpc:"2.0",id,error:{code,message}}),{status,headers:{...cors,"content-type":"application/json"}})}
function cleanName(value:string){return (value||"asset").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(-120)||"asset"}
function validate(kind:string, manifest:any){
 if(kind==="tiktok"&&(!Array.isArray(manifest?.scenes)||manifest.scenes.length<6||manifest.scenes.length>8))throw new Error("TikTok projects require 6–8 scenes.");
 if(kind==="etsy"&&(!Array.isArray(manifest?.tags)||manifest.tags.length!==13))throw new Error("Etsy projects require exactly 13 tags.");
 if(kind==="pinterest"&&(!Array.isArray(manifest?.pins)||manifest.pins.length!==10))throw new Error("Pinterest projects require exactly 10 Pins.");
}
function output(data:unknown){return {content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data}}
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
 if(method==="initialize")return rpc(id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"PlanThenRoam Seller Tools",version:"1.0.0"}});
 if(method==="ping")return rpc(id,{});
 if(method==="notifications/initialized")return new Response(null,{status:202,headers:cors});
 if(method==="tools/list")return rpc(id,{tools});
 if(method!=="tools/call")return fail(id,-32601,"Method not found");
 const name=params?.name,args=params?.arguments||{};
 try{
  if(name==="create_review_project"){
   if(!bucketFor[args.kind]||!args.title||typeof args.manifest!=="object")throw new Error("kind, title and manifest are required.");
   validate(args.kind,args.manifest);
   const {data,error}=await db.from("review_projects").insert({kind:args.kind,title:String(args.title).slice(0,180),manifest:args.manifest,media:[],source:"chatgpt",status:"editing"}).select("id,kind,title,status,revision").single();
   if(error)throw error;return rpc(id,output(data));
  }
  if(name==="list_review_projects"){
   let query=db.from("review_projects").select("id,kind,title,status,manifest,revision,revision_request,scheduled_for,updated_at").order("updated_at",{ascending:false}).limit(50);
   if(args.kind)query=query.eq("kind",args.kind);if(args.status)query=query.eq("status",args.status);
   const {data,error}=await query;if(error)throw error;return rpc(id,output({projects:data}));
  }
  const {data:project,error:projectError}=await db.from("review_projects").select("*").eq("id",args.project_id).single();
  if(projectError||!project)throw new Error("Project not found or access denied.");
  if(name==="attach_project_asset"||name==="attach_project_asset_from_url"){
   let bytes:Uint8Array,contentType=String(args.content_type||"application/octet-stream");
   if(name==="attach_project_asset"){if(typeof args.base64_data!=="string"||args.base64_data.length>9_000_000)throw new Error("Base64 asset is missing or exceeds the 6 MB direct-upload limit. Use the trusted URL tool for larger files.");bytes=Uint8Array.from(atob(args.base64_data),c=>c.charCodeAt(0))}
   else{if(!trustedAssetUrl(args.source_url))throw new Error("Asset URL must be an HTTPS ChatGPT/OpenAI cloud file URL.");const response=await fetch(args.source_url);if(!response.ok)throw new Error("Could not download the supplied asset URL.");const size=Number(response.headers.get("content-length")||0);if(size>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");const buf=await response.arrayBuffer();if(buf.byteLength>50_000_000)throw new Error("Asset exceeds the 50 MB transfer limit.");bytes=new Uint8Array(buf);contentType=args.content_type||response.headers.get("content-type")||contentType}
   const path=`${userData.user.id}/${project.id}/${crypto.randomUUID()}-${cleanName(args.filename)}`,bucket=bucketFor[project.kind];
   const {error:uploadError}=await db.storage.from(bucket).upload(path,bytes,{contentType,upsert:false});if(uploadError)throw uploadError;
   const media=[...(Array.isArray(project.media)?project.media:[]),{role:String(args.role),path,name:String(args.filename),mime:contentType}];
   const changes:any={media,status:"editing"};if(args.is_preview||args.role==="video")changes.preview_path=path;
   const {error:updateError}=await db.from("review_projects").update(changes).eq("id",project.id);if(updateError){await db.storage.from(bucket).remove([path]);throw updateError}
   return rpc(id,output({project_id:project.id,role:args.role,stored:true}));
  }
  if(name==="finalize_review_project"){
   validate(project.kind,project.manifest);const media=Array.isArray(project.media)?project.media:[];
   if(project.kind==="tiktok"&&!project.preview_path)throw new Error("Attach the finished preview video before finalizing.");
   if(project.kind==="etsy"&&(!media.some((x:any)=>x.role==="customer-pdf")||!media.some((x:any)=>String(x.role).startsWith("listing-image"))))throw new Error("Attach the customer PDF and listing images before finalizing.");
   if(project.kind==="pinterest"&&!project.manifest.pins.every((p:any,i:number)=>media.some((x:any)=>x.role===(p.imageRole||`pin-${i+1}`))))throw new Error("Attach an image for each of the 10 Pins before finalizing.");
   const {error}=await db.from("review_projects").update({status:"ready",revision_request:null,last_error:null}).eq("id",project.id);if(error)throw error;return rpc(id,output({project_id:project.id,status:"ready"}));
  }
  if(name==="update_review_project"){
   const changes:any={revision:project.revision+1};if(args.title)changes.title=String(args.title).slice(0,180);if(args.manifest){validate(project.kind,args.manifest);changes.manifest=args.manifest}if(args.mark_ready){changes.status="ready";changes.revision_request=null}
   const {error}=await db.from("review_projects").update(changes).eq("id",project.id);if(error)throw error;return rpc(id,output({project_id:project.id,updated:true,revision:changes.revision}));
  }
  if(name==="clear_review_project"){
   if(args.confirmed!==true)throw new Error("The owner must explicitly confirm deletion.");const paths=[...new Set([project.preview_path,...(project.media||[]).map((x:any)=>x.path)].filter(Boolean))] as string[];if(paths.length){const {error}=await db.storage.from(bucketFor[project.kind]).remove(paths);if(error)throw error}const {error}=await db.from("review_projects").delete().eq("id",project.id);if(error)throw error;return rpc(id,output({project_id:project.id,deleted:true}));
  }
  return fail(id,-32601,"Unknown tool");
 }catch(error){return fail(id,-32000,error instanceof Error?error.message:"Tool failed")}
});
