import {BUCKET,checked,selectedAssets} from './actions.ts';
import {assert,hash,outputSize} from './core.mjs';
import {inspectPng} from './archive.mjs';

// Copies a previously reviewed snapshot. Publication still belongs to the app's
// existing owner approval flow, not the Composer or this transfer helper.
export async function readPinAsset(admin:any,userId:string,project:any,args:any){
 assert(project.kind==='pinterest'&&project.manifest?.pins?.length===1,'Choose a single-pin Pinterest review project');
 const c=checked(await admin.from('composer_compositions').select('*').eq('id',args.composition_id).eq('user_id',userId).single());
 assert(c&&c.spec.output_type==='pinterest','Choose a portrait Pinterest composition');
 assert(c.revision===args.composition_revision&&c.approved_revision===c.revision,'Export the current composition after visual approval first');
 assert(c.status==='ready'&&c.result?.validation?.valid===true&&c.result.checksum===args.checksum,'Reviewed PNG changed or is not ready');
 await selectedAssets(admin,userId,c.spec);
 const master=checked(await admin.from('seller_master_records').select('listing_id').eq('id',c.spec.planner_id).eq('user_id',userId).single());
 const pin=project.manifest.pins[0];
 assert(master?.listing_id&&pin.link==='https://www.etsy.com/listing/'+master.listing_id,'Pin Etsy link must match the composition planner');
 assert(c.result.path.startsWith(userId+'/exports/'+c.id+'/'),'Invalid Composer output ownership');
 const blob=checked(await admin.storage.from(BUCKET).download(c.result.path));assert(blob.size<=50_000_000,'Pin image exceeds transfer limit');
 const bytes=new Uint8Array(await blob.arrayBuffer()),size=inspectPng(bytes),expected=outputSize('pinterest');
 assert(size.width===expected.width&&size.height===expected.height,'Pin image must be 1000 by 1500');
 assert(await hash(bytes)===args.checksum,'Stored reviewed PNG checksum mismatch');
 const current=checked(await admin.from('composer_compositions').select('revision,status,approved_revision,result').eq('id',c.id).eq('user_id',userId).single());
 assert(current.revision===c.revision&&current.approved_revision===c.revision&&current.status==='ready'&&current.result?.checksum===args.checksum,'Composition changed during transfer');
 await selectedAssets(admin,userId,c.spec);
 return {bytes,role:pin.imageRole||'pin-1',filename:`${c.id}_r${c.revision}_pinterest.png`};
}
