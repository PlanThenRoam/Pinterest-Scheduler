import fs from 'node:fs/promises';
import {render} from './renderer.mjs';
const root=process.argv[2];if(!root)throw Error('Private asset directory is required');
const assets=JSON.parse(await fs.readFile(root+'/asset-manifest.json','utf8'));await fs.mkdir(root+'/qa',{recursive:true});
const cases=[
 ['Christmas_in_New_York_2026','New York, beautifully planned','Make room for festive walks and memorable moments.','Cormorant Garamond'],
 ['Greece_Island_Hopping','Your Greek island escape','A thoughtful route, with the planning already started.','Lora'],
 ['Iceland_Ring_Road','Iceland at your own pace','Build your road trip around the places that move you.','Playfair Display'],
 ['Munich_Oktoberfest_2026','Make Munich your own','Plan the festival and leave room to explore.','EB Garamond']
];const out=[];
for(const [prefix,headline,copy,font_family] of cases){
 const bank=assets.filter(a=>a.logical_key.startsWith(prefix+'/'));
 const bg=bank.find(a=>a.logical_key.endsWith('background_01'));
 const page=bank.find(a=>a.kind==='page'&&a.metadata.page_number===8);
 const spec={planner_id:bg.planner_id,output_type:'square',background_id:bg.id,font_family,composition_profile:'balanced_premium',headline,supporting_copy:copy,planner_page_ids:[page.id],layout_preset:'proof_right',contrast:0.5,cta:'Explore the itinerary'};
 const selected=[bg,page],load=async a=>fs.readFile(a.local_path);const first=await render(spec,selected,load),second=await render(spec,selected,load);
 if(first.checksum!==second.checksum)throw Error('Non-reproducible output');
 const file=root+'/qa/'+prefix+'.png';await fs.writeFile(file,first.png);await fs.writeFile(root+'/qa/'+prefix+'.json',JSON.stringify({spec,assets:selected.map(({local_path,...a})=>a),...first,png:undefined},null,2));out.push({planner:prefix,file,checksum:first.checksum,reproducible:true,validation:first.validation});
 console.log(prefix+' passed');
}
await fs.writeFile(root+'/qa/results.json',JSON.stringify(out,null,2));
