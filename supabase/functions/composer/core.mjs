export const VERSION='1.0.0';
export const FONTS=['Cormorant Garamond','Playfair Display','DM Serif Display','Bodoni Moda','Lora','Fraunces','Prata','Libre Baskerville','Spectral','EB Garamond','Merriweather','Source Serif 4','Libre Caslon Display','Cardo','Crimson Pro','Vollkorn','Alegreya','Noto Serif','Newsreader','Instrument Serif'];
export const PROFILES=['upper_left','upper_right','left','right','lower_third','central_vista_quiet_edges','upper_area','asymmetrical_editorial','strong_foreground_clear_upper_space','balanced_premium'];
export const PRESETS=['auto','vista_hook','editorial_hook','proof_right','proof_left','proof_centre','proof_pair'];
export const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const assert=(ok,message)=>{if(!ok)throw Error(message)};
export async function hash(x){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof x==='string'?new TextEncoder().encode(x):x))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function validateInput(s){
 const allowed=['planner_id','output_type','background_id','font_family','composition_profile','headline','supporting_copy','planner_page_ids','cta','layout_preset','label','ink','contrast','typography','cta_style'];
 assert(s&&typeof s==='object'&&!Array.isArray(s),'Composition must be an object');
 assert(Object.keys(s).every(k=>allowed.includes(k)),'Unknown composition field');
 assert(s.output_type==='square','Only square output is supported');
 for(const k of ['planner_id','background_id'])assert(/^[a-f0-9-]{36}$/i.test(s[k]||''),'Invalid '+k);
 assert(FONTS.includes(s.font_family),'Unsupported font family');assert(PROFILES.includes(s.composition_profile),'Unsupported composition profile');assert(PRESETS.includes(s.layout_preset),'Unsupported layout preset');
 for(const [key,max] of [['headline',240],['supporting_copy',450],['cta',100],['label',100]]){assert((s[key]==null&&key!=='headline')||(typeof s[key]==='string'&&s[key].length<=max),'Invalid '+key);if(s[key])assert(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s[key]),'Invalid control character');}
 assert(s.headline?.trim(),'Headline is required');
 assert(Array.isArray(s.planner_page_ids)&&s.planner_page_ids.length<=2&&new Set(s.planner_page_ids).size===s.planner_page_ids.length,'Choose zero to two distinct pages');
 const hook=s.layout_preset.endsWith('hook');assert(s.layout_preset==='auto'||s.planner_page_ids.length===(hook?0:s.layout_preset==='proof_pair'?2:1),'Incorrect page count for preset');
 assert(!s.cta||['auto','proof_right','proof_left'].includes(s.layout_preset),'CTA requires a side-proof preset');
 assert(s.ink==null||['#FFF9F0','#172724','#142C35'].includes(s.ink),'Unsupported ink');
 assert(s.contrast==null||(typeof s.contrast==='number'&&s.contrast>=0&&s.contrast<=0.8),'Contrast must be an explicit opacity from 0 to 0.8');
 if(s.typography){assert(Object.keys(s.typography).every(k=>['weight','italic','letter_spacing','line_height','alignment','opacity','shadow','sizes'].includes(k)),'Unknown typography setting');assert(s.typography.weight==null||[400,500,600,700].includes(s.typography.weight),'Unsupported weight');assert(s.typography.italic==null||typeof s.typography.italic==='boolean','Invalid italic');assert(s.typography.letter_spacing==null||Math.abs(s.typography.letter_spacing)<=2,'Letter spacing exceeds bounds');assert(s.typography.line_height==null||(s.typography.line_height>=1.04&&s.typography.line_height<=1.28),'Invalid line height');}
 if(s.cta_style)assert(['outline','solid','text'].includes(s.cta_style),'Unsupported CTA style');
 if(s.typography){const t=s.typography;assert(t.alignment==null||['left','center','right'].includes(t.alignment),'Unsupported alignment');assert(t.opacity==null||(t.opacity>=.7&&t.opacity<=1),'Text opacity must be 0.7 to 1');assert(t.shadow==null||typeof t.shadow==='boolean','Invalid text shadow');if(t.sizes){const ranges={headline:[56,120],supporting_copy:[32,60],label:[28,44],cta:[30,48]};for(const [k,v] of Object.entries(t.sizes)){const r=ranges[k];assert(r&&Number.isFinite(v)&&v>=r[0]&&v<=r[1],'Font size outside readable bounds');}}}
 return s;
}
export const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export function resolveLayout(s,assets){
 validateInput(s);if(s.layout_preset==='auto'){const p=s.composition_profile;s={...s,layout_preset:s.planner_page_ids.length===2?'proof_pair':s.planner_page_ids.length===1?(['right','upper_right'].includes(p)?'proof_left':'proof_right'):['left','right','upper_left','upper_right','asymmetrical_editorial'].includes(p)?'editorial_hook':'vista_hook'};validateInput(s);}const bg=assets.find(a=>a.id===s.background_id);assert(bg&&bg.kind==='background'&&bg.width===1080&&bg.height===1080,'Missing square background');
 assert(bg.planner_id===s.planner_id,'Background belongs to another planner');
 const box=(name,x,y,width,height,z=40)=>({name,x,y,width,height,z,visible:true,align:'center'});
 const hook=s.layout_preset.endsWith('hook');let l;
 if(hook)l=s.layout_preset==='vista_hook'?[box('label',64,64,952,48),box('headline',96,164,888,272,50),box('supporting_copy',120,462,840,120,60)]:[box('label',64,64,650,48),box('headline',64,174,650,304,50),box('supporting_copy',64,508,610,132,60)];
 else l=[box('label',64,64,952,48),box('headline',64,138,952,148,50),box('supporting_copy',64,306,952,86,60)];
 if(s.layout_preset==='proof_centre')l=[box('label',64,64,952,48),box('headline',64,132,952,144,50),box('supporting_copy',64,296,952,76,60)];
 if(hook){const p=s.composition_profile;if(['right','upper_right'].includes(p))l=l.map(b=>({...b,x:1080-b.x-b.width,align:'right'}));else if(['left','upper_left','asymmetrical_editorial'].includes(p))l=l.map(b=>({...b,align:'left'}));if(p==='lower_third')l=l.map(b=>({...b,y:b.y+418}));if(p==='central_vista_quiet_edges')l=l.map(b=>({...b,y:b.name==='supporting_copy'?888:b.y}));}
 const xs=s.layout_preset==='proof_pair'?[64,576]:s.layout_preset==='proof_left'?[48]:s.layout_preset==='proof_centre'?[320]:[592];
 s.planner_page_ids.forEach((id,i)=>{const a=assets.find(a=>a.id===id);assert(a&&a.kind==='page','Missing genuine page');assert(a.planner_id===s.planner_id,'Page belongs to another planner');const scale=Math.min(440/a.width,620/a.height);assert(scale<=0.5,'Page resolution is insufficient');const w=a.width*scale,h=a.height*scale;l.push({...box('page_'+i,xs[i]+(440-w)/2,s.layout_preset==='proof_centre'?392:412,w,h,30),asset_id:id});});
 if(s.cta)l.push(box('cta',s.layout_preset==='proof_left'?528:64,914,488,96,70));
 if(s.typography?.alignment)l=l.map(b=>({...b,align:s.typography.alignment}));
 l=l.filter(b=>b.name.startsWith('page_')||s[b.name]);
 for(const b of l){assert(b.x>=0&&b.y>=0&&b.x+b.width<=1080&&b.y+b.height<=1080,'Layer outside canvas');for(const p of bg.metadata?.protected_zones||[])assert(!overlaps(b,p),'Layer covers protected focal area');}
 for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++)assert(!overlaps(l[i],l[j]),'Content layers overlap');
 return {width:1080,height:1080,version:VERSION,layers:l,background_id:bg.id,profile:s.composition_profile,preset:s.layout_preset,review_required:!bg.metadata?.zones_reviewed};
}
