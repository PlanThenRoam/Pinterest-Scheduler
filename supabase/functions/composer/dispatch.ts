// Only the owner's fixed existing renderer can be dispatched. Credentials never
// enter MCP schemas, database records, logs, workflow inputs or public source.
const workflow='https://api.github.com/repos/PlanThenRoam/Pinterest-Scheduler/actions/workflows/composer-render.yml/dispatches';
export function dispatchConfigured(){return Boolean(globalThis.Deno?.env?.get('COMPOSER_GITHUB_DISPATCH_TOKEN'));}
export async function wakeRenderer({fetcher=fetch,token=globalThis.Deno?.env?.get('COMPOSER_GITHUB_DISPATCH_TOKEN')}={}){
 if(!token)return {mode:'scheduled_backup',immediate_start:false,reason:'DISPATCH_CREDENTIAL_NOT_CONFIGURED'};
 try{const r=await fetcher(workflow,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2026-03-10'},body:JSON.stringify({ref:'main'})});
  return r.ok?{mode:'workflow_dispatch',dispatch_accepted:true,immediate_start:false,state:'queued',message:'GitHub accepted the dispatch. Rendering starts only when a worker claims the outputs.'}:{mode:'scheduled_backup',immediate_start:false,reason:'DISPATCH_REJECTED',http_status:r.status};
 }catch{return {mode:'scheduled_backup',immediate_start:false,reason:'DISPATCH_UNAVAILABLE'};}
}
