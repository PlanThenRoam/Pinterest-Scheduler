import {GOOGLE_FONTS} from './font-manifest.mjs';
import {FONT_CATALOG} from './fonts.mjs';

export const PRESET_VERSION='2.0.0';
export const NEW_FONTS=GOOGLE_FONTS.map(f=>f.family);
export const LAYOUT_FAMILIES=['editorial_left','editorial_right','central_proof','split_left','split_right','top_statement','bottom_statement','inset_left','inset_right','horizontal_split','generous_cover','open_vista'];
export const TREATMENTS=['condensed_poster','oversized_sans','editorial_serif','restrained_slab','asymmetric_left','subject_right','stacked','spacious_minimal','phrase_emphasis','solid_panel','local_gradient','oversized_numeral'];
export const CTA_TREATMENTS=['text','underlined','rectangular','rounded','outlined','footer_band','side_panel','integrated','offer_panel'];
export const LOCK_FIELDS=['backgrounds','typography','layout','cta','colour'];
export const SIMILARITY_THRESHOLD=0.69;
export const READABILITY={headline:56,supporting_copy:32,cta:30};
const ok=(v,message)=>{if(!v)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hex=v=>/^#[0-9a-f]{6}$/i.test(v);
const copyKeys=['headline','supporting_copy','cta'];
export const sourceIdentity=a=>a.metadata?.source_asset_id||a.id;
export function random(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const pick=(rng,values)=>values[Math.floor(rng()*values.length)];
const shuffle=(rng,values)=>{const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
export function fontSupported(family,weight=400,italic=false){const f=GOOGLE_FONTS.find(f=>f.family===family);return f?f.files.some(x=>x.style===(italic?'italic':'normal')&&weight>=x.weight_min&&weight<=x.weight_max):!!FONT_CATALOG.find(f=>f.family===family)?.styles.some(x=>Number(x[0])===weight&&x[1]===(italic?'italic':'normal'));}

// Each entry is a compatible typography/hierarchy system. Arrangement, palette
// and CTA compatibility are resolved as a whole, not randomised per property.
export const SYSTEMS=[
 {id:'poster',category:'condensed',headline:'Anton',support:'DM Sans',weight:400,treatment:'condensed_poster',hierarchy:'monumental',align:'left',layouts:['split_left','editorial_left','bottom_statement'],ctas:['rectangular','footer_band','integrated'],size:112},
 {id:'tall',category:'condensed',headline:'Bebas Neue',support:'Manrope',weight:400,treatment:'stacked',hierarchy:'stacked',align:'right',layouts:['editorial_right','inset_right','top_statement'],ctas:['underlined','side_panel','outlined'],size:116},
 {id:'broad',category:'geometric',headline:'Montserrat',support:'Montserrat',weight:800,treatment:'oversized_sans',hierarchy:'wide',align:'center',layouts:['top_statement','central_proof','generous_cover'],ctas:['rounded','footer_band'],size:100},
 {id:'editorial',category:'serif',headline:'Lora',support:'DM Sans',weight:400,treatment:'editorial_serif',hierarchy:'editorial',align:'left',layouts:['editorial_left','horizontal_split','inset_left'],ctas:['text','underlined','integrated'],size:88},
 {id:'slab',category:'slab',headline:'Arvo',support:'Manrope',weight:700,treatment:'restrained_slab',hierarchy:'substantial',align:'center',layouts:['central_proof','split_right','bottom_statement'],ctas:['outlined','offer_panel'],size:86},
 {id:'asymmetric',category:'expressive',headline:'Syne',support:'DM Sans',weight:700,treatment:'asymmetric_left',hierarchy:'offset',align:'left',layouts:['inset_left','editorial_left','horizontal_split'],ctas:['side_panel','rectangular'],size:94},
 {id:'subject',category:'grotesk',headline:'Space Grotesk',support:'Space Grotesk',weight:600,treatment:'subject_right',hierarchy:'subject_edge',align:'right',layouts:['editorial_right','split_right','inset_right'],ctas:['text','underlined'],size:96},
 {id:'minimal',category:'geometric',headline:'Raleway',support:'Raleway',weight:500,treatment:'spacious_minimal',hierarchy:'quiet',align:'center',layouts:['open_vista','generous_cover','central_proof'],ctas:['text','outlined'],size:78},
 {id:'character',category:'expressive',headline:'Bricolage Grotesque',support:'DM Sans',weight:700,treatment:'phrase_emphasis',hierarchy:'phrase',align:'left',layouts:['editorial_left','bottom_statement','inset_left'],ctas:['offer_panel','rounded'],size:96},
 {id:'panel',category:'condensed',headline:'Oswald',support:'Barlow Condensed',weight:600,treatment:'solid_panel',hierarchy:'panel',align:'left',layouts:['split_left','horizontal_split','split_right'],ctas:['footer_band','rectangular'],size:100},
 {id:'atmosphere',category:'slab',headline:'Zilla Slab',support:'DM Sans',weight:600,treatment:'local_gradient',hierarchy:'floating',align:'right',layouts:['inset_right','bottom_statement','editorial_right'],ctas:['rounded','integrated'],size:94},
 {id:'number',category:'grotesk',headline:'Outfit',support:'Outfit',weight:600,treatment:'oversized_numeral',hierarchy:'numeric',align:'left',layouts:['top_statement','split_left','editorial_left'],ctas:['offer_panel','side_panel'],size:100},
 {id:'compact',category:'condensed',headline:'Barlow Condensed',support:'Barlow Condensed',weight:700,treatment:'condensed_poster',hierarchy:'stacked',align:'center',layouts:['central_proof','top_statement','horizontal_split'],ctas:['rounded','footer_band'],size:110},
 {id:'black',category:'grotesk',headline:'Archivo Black',support:'DM Sans',weight:400,treatment:'oversized_sans',hierarchy:'monumental',align:'left',layouts:['bottom_statement','split_left','inset_left'],ctas:['rectangular','integrated'],size:96},
 {id:'clean',category:'geometric',headline:'Poppins',support:'Poppins',weight:600,treatment:'spacious_minimal',hierarchy:'quiet',align:'left',layouts:['generous_cover','editorial_left','open_vista'],ctas:['rounded','text'],size:84},
 {id:'restrained',category:'grotesk',headline:'Manrope',support:'Manrope',weight:600,treatment:'asymmetric_left',hierarchy:'editorial',align:'left',layouts:['horizontal_split','inset_left','central_proof'],ctas:['underlined','outlined'],size:84},
 {id:'vintage',category:'geometric',headline:'Josefin Sans',support:'Josefin Sans',weight:600,treatment:'stacked',hierarchy:'offset',align:'right',layouts:['inset_right','split_right','generous_cover'],ctas:['underlined','side_panel'],size:104},
 {id:'contemporary',category:'geometric',headline:'Sora',support:'DM Sans',weight:700,treatment:'phrase_emphasis',hierarchy:'wide',align:'center',layouts:['top_statement','central_proof','horizontal_split'],ctas:['footer_band','rounded'],size:90},
 {id:'soft',category:'rounded',headline:'Rubik',support:'Rubik',weight:600,treatment:'oversized_sans',hierarchy:'floating',align:'right',layouts:['editorial_right','bottom_statement','inset_right'],ctas:['rounded','integrated'],size:98},
 {id:'substantial',category:'slab',headline:'Roboto Slab',support:'DM Sans',weight:600,treatment:'restrained_slab',hierarchy:'substantial',align:'left',layouts:['split_left','generous_cover','editorial_left'],ctas:['offer_panel','outlined'],size:86}
];
export const PALETTES=[
 {id:'ink_cream',ink:'#FFF9F0',panel:'#142C35',accent:'#FFD39A'},
 {id:'navy_ice',ink:'#F4F8FF',panel:'#142638',accent:'#B8E2EA'},
 {id:'forest_linen',ink:'#FFF9EB',panel:'#173A31',accent:'#E6D3A7'},
 {id:'wine_blush',ink:'#FFF2EC',panel:'#41242E',accent:'#FFD1BD'},
 {id:'charcoal_gold',ink:'#FFFCF4',panel:'#282827',accent:'#F2D57A'},
 {id:'plum_lilac',ink:'#FCF7FF',panel:'#302A45',accent:'#E1C3F3'}
];

export function validateBlocks(blocks,text,fonts){
 ok(blocks&&typeof blocks==='object','Text blocks are required');
 for(const [name,b] of Object.entries(blocks)){
  ok(copyKeys.includes(name)&&text[name],'Unknown or empty text block: '+name);
  ok(Object.keys(b).every(k=>['font_family','weight','italic','size','min_size','line_height','tracking','align','colour','uppercase','emphasis','x','y','width','height'].includes(k)),'Unknown text block setting');
  ok(fonts.includes(b.font_family),'Text font is outside the design system');
  ok(fontSupported(b.font_family,b.weight,b.italic),'FONT_STYLE_UNAVAILABLE: '+b.font_family+' '+b.weight+(b.italic?' italic':''));
  ok(Number.isInteger(b.weight)&&b.weight>=100&&b.weight<=1000,'Invalid real font weight');
  ok(b.size>=READABILITY[name]&&b.size<=(name==='headline'?180:70),'Text size outside readability limits');
  ok(b.line_height>=1&&b.line_height<=1.5&&Math.abs(b.tracking)<=5,'Invalid text spacing');
  ok(['left','center','right'].includes(b.align)&&hex(b.colour),'Invalid text alignment or colour');
  if(['x','y','width','height'].some(k=>b[k]!=null))ok(['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.width>0&&b.height>0,'A manual block position requires x, y, width and height');
  let end=0;for(const e of b.emphasis||[]){ok(Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=end&&e.end>e.start&&e.end<=text[name].length,'Emphasis ranges must be ordered, disjoint and within exact copy');end=e.end;ok(e.colour==null||hex(e.colour),'Invalid emphasis colour');ok(e.weight==null||fontSupported(b.font_family,e.weight,b.italic),'FONT_STYLE_UNAVAILABLE: emphasis weight');ok(e.scale==null||(e.scale>=1&&e.scale<=1.65),'Emphasis scale outside limits');}
 }
 ok(copyKeys.filter(k=>text[k]).every(k=>blocks[k]),'Every supplied text block requires styling');
}

export function validateDesign(s){
 const d=s.design;
 ok(d?.version===PRESET_VERSION,'Unsupported art direction preset version');
 ok(LAYOUT_FAMILIES.includes(d.layout_family)&&TREATMENTS.includes(d.treatment),'Unsupported layout or headline treatment');
 ok(CTA_TREATMENTS.includes(d.cta?.treatment),'Unsupported CTA treatment');
 ok(['below_copy','below_headline','footer','side','offer'].includes(d.cta.location),'Unsupported CTA location');
 ok(Array.isArray(d.fonts)&&d.fonts.length>=1&&d.fonts.length<=2&&new Set(d.fonts).size===d.fonts.length,'Use at most two distinct families in a design system');
 ok(d.palette&&['ink','panel','accent'].every(k=>hex(d.palette[k])),'Invalid colour treatment');
 ok(['hook','proof','cover_cta','pin'].includes(d.role),'Invalid output role');
 ok(!s.label,'Eyebrow labels are not permitted in automatic campaigns');
 for(const k of copyKeys)ok(!s[k]||(!/\u2014/.test(s[k])&&!/\b\d+\s*pages?\b/i.test(s[k])),'COPY_POLICY: em dashes and total page counts are not permitted');
 validateBlocks(d.blocks,s,d.fonts);
 ok(d.fonts.includes(s.font_family),'Headline font must belong to the design system');
 return s;
}

const rect=(name,x,y,width,height,extra={})=>({name,x,y,width,height,z:40,visible:true,align:'left',...extra});
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

// Twelve geometric families. All rectangles are resolved in output pixels and
// persisted. The photograph is always full bleed; local panels sit behind text.
export function automaticLayout(s,assets){
 validateDesign(s);const d=s.design,W=s.output_type==='square'?1080:1000,H=s.output_type==='square'?1080:1500;
 const p=s.output_type==='pinterest',m=p?60:56,g=28,w=W-2*m,h=H-2*m;
 const f=d.layout_family,hasPage=s.planner_page_ids.length>0,hasCTA=!!s.cta;
 let head,body,slot,cta,panels=[];
 const side=['editorial_left','editorial_right','split_left','split_right','inset_left','inset_right'].includes(f);
 if(!hasPage){
  const lower=['bottom_statement','inset_left','inset_right'].includes(f),center=['central_proof','generous_cover','open_vista'].includes(f);
  const tw=center?w:side?w*.77:w,x=f.endsWith('right')?W-m-tw:m,y=lower?H-m-(p?390:330)-g-(p?200:180):f==='open_vista'?H*.32:m+(p?90:56);
  head=rect('headline',x,y,tw,p?390:330);body=rect('supporting_copy',x,y+head.height+g,tw,p?200:180);
 }else if(side&&!p){
  const right=f.endsWith('right'),textWidth=f.startsWith('split')?434:f.startsWith('inset')?422:446;
  const tx=right?W-m-textWidth:m,px=right?m:W-m-444,top=f.startsWith('inset')?154:80;
  head=rect('headline',tx,top,textWidth,310);body=rect('supporting_copy',tx,top+338,textWidth,hasCTA?210:280);
  slot=rect('page',px,90,444,hasCTA?800:890);
  if(hasCTA)cta=rect('cta',tx,850,textWidth,142);
 }else if(f==='top_statement'){
  head=rect('headline',m,m,w,p?300:220);
  if(p){body=rect('supporting_copy',m,440,340,380);slot=rect('page',W-m-440,500,440,hasCTA?780:900);if(hasCTA)cta=rect('cta',m,H-m-90,w,90);}
  else{body=rect('supporting_copy',m,330,400,hasCTA?360:480);slot=rect('page',W-m-470,330,470,hasCTA?590:690);if(hasCTA)cta=rect('cta',m,850,400,142);}
 }else if(f==='horizontal_split'){
  head=rect('headline',m,m,w,p?240:170);body=rect('supporting_copy',m,head.y+head.height+18,w,p?180:126);
  const sy=p?540:425;slot=rect('page',m+(p?130:250),sy,w-(p?260:440),H-sy-m-(hasCTA?118:0));
  if(hasCTA)cta=rect('cta',m,H-m-96,w,96);
 }else if(f==='bottom_statement'){
  slot=rect('page',m+(p?115:250),m,w-(p?230:440),p?750:580);
  const y=slot.y+slot.height+24;head=rect('headline',m,y,w,p?220:160);body=rect('supporting_copy',m,y+head.height+16,w,p?145:100);
  if(hasCTA)cta=rect('cta',m,H-m-90,w,90);
 }else if(f==='generous_cover'){
  const sw=p?580:490,sy=p?410:260,sh=p?870:hasCTA?650:720;
  head=rect('headline',m,m,w,p?185:100);body=rect('supporting_copy',m,head.y+head.height+16,w,p?110:70);slot=rect('page',(W-sw)/2,sy,sw,sh);
  if(hasCTA)cta=rect('cta',m,H-m-92,w,92);
 }else{
  // Portrait side systems retain a broad headline and shift the large proof
  // within the lower image. Square central systems give the page a full column.
  head=rect('headline',m,m,w,p?250:158);body=rect('supporting_copy',m,head.y+head.height+24,w,p?170:122);
  const sy=p?550:390,sh=H-sy-m-(hasCTA?118:0),sw=p?560:450;
  const px=p&&f.endsWith('left')?m:p&&f.endsWith('right')?W-m-sw:(W-sw)/2;
  slot=rect('page',px,sy,sw,sh);if(hasCTA)cta=rect('cta',m,H-m-90,w,90);
 }
 let layers=[head,body].filter(b=>s[b.name]);
 if(slot){
  const count=s.planner_page_ids.length;
  s.planner_page_ids.forEach((id,i)=>{const a=assets.find(a=>a.id===id);ok(a?.kind==='page'&&a.planner_id===s.planner_id,'Missing current genuine planner page');
   const sw=count===2?(W-2*m-g)/2:slot.width,px=count===2?m+i*(sw+g):slot.x;
   const scale=Math.min(sw/a.width,slot.height/a.height,.5),width=a.width*scale,height=a.height*scale;
   ok(width>=(p?300:280)&&height>=(p?440:390),'PAGE_TOO_SMALL: choose a larger proof layout');
   layers.push(rect('page_'+i,px+(sw-width)/2,slot.y+(slot.height-height)/2,width,height,{asset_id:id,z:30}));
  });
 }
 if(cta){
  if(d.cta.treatment==='footer_band')Object.assign(cta,{x:m,y:H-m-90,width:w,height:90});
  if(d.cta.treatment==='side_panel'&&p){ok(side,'SIDE_CTA_LAYOUT_INCOMPATIBLE');const page=layers.find(l=>l.asset_id);const leftSpace=page.x-m,rightSpace=W-m-page.x-page.width;ok(Math.max(leftSpace,rightSpace)>=280,'SIDE_CTA_SPACE_INSUFFICIENT');Object.assign(cta,{x:leftSpace>rightSpace?m:page.x+page.width+24,y:page.y+page.height*.55,width:Math.max(leftSpace,rightSpace)-24,height:180});}
  if(d.cta.treatment==='integrated'&&side&&!p){const cy=head.y+head.height+20;Object.assign(cta,{x:head.x,y:cy,width:head.width,height:108});if(body)Object.assign(body,{y:cy+132,height:Math.min(body.height,H-m-cy-132)});}
  if(d.cta.treatment==='integrated'&&p){ok(!['bottom_statement','horizontal_split','generous_cover'].includes(f),'INTEGRATED_CTA_LAYOUT_INCOMPATIBLE');head.height=180;Object.assign(cta,{x:head.x,y:head.y+head.height+20,width:head.width,height:86});if(body)Object.assign(body,{y:cta.y+cta.height+20,height:150});}
  if(d.cta.treatment==='integrated'&&!p&&!side)throw Error('INTEGRATED_CTA_LAYOUT_INCOMPATIBLE');
  // Footer placement is only selected with a footer slot, never over a page.
  if(d.cta.location==='footer')ok(cta.y>H*.75,'CTA placement incompatible with layout');
  if(['rectangular','rounded','outlined','footer_band','side_panel','offer_panel'].includes(d.cta.treatment))panels.push({...cta,...(d.cta.treatment==='footer_band'?{x:0,width:W,height:H-cta.y}:{}),name:'cta_panel',z:35,colour:d.palette.panel,opacity:1,radius:d.cta.treatment==='rounded'?30:0,outline:d.cta.treatment==='outlined'});
  layers.push(cta);
 }
 for(const layer of layers.filter(l=>!l.asset_id)){
  const b=d.blocks[layer.name];if(b.x!=null)Object.assign(layer,{x:b.x,y:b.y,width:b.width,height:b.height});layer.align=b.align;
 }
  const textLayers=layers.filter(l=>!l.asset_id&&l.name!=='cta');
 for(const l of textLayers){const solid=['solid_panel','split_left','split_right','horizontal_split'].includes(d.treatment)||f.startsWith('split')||f==='horizontal_split'||(d.cta.treatment==='offer_panel'&&l.name==='supporting_copy');panels.push({name:l.name+'_panel',x:Math.max(0,l.x-18),y:Math.max(0,l.y-10),width:Math.min(W-l.x+18,l.width+36),height:l.height+20,z:20,colour:d.palette.panel,opacity:solid?1:.90,gradient:!solid,...(d.cta.treatment==='offer_panel'&&l.name==='supporting_copy'?{accent:d.palette.accent}:{})});}
 if(cta&&!panels.some(x=>x.name==='cta_panel'))panels.push({...cta,name:'cta_backdrop',z:20,colour:d.palette.panel,opacity:.9,gradient:true});
 const bg=assets.find(a=>a.id===s.background_id);ok(bg?.kind==='background'&&bg.width===W&&bg.height===H&&bg.planner_id===s.planner_id,'Approved matching background required');
 for(const l of layers){ok(l.x>=m-1&&l.y>=m-1&&l.x+l.width<=W-m+1&&l.y+l.height<=H-m+1,'MARGIN_VIOLATION: '+l.name);for(const zone of bg.metadata?.protected_zones||[])ok(!overlap(l,zone),'SUBJECT_OBSTRUCTED: '+l.name);}
 for(let i=0;i<layers.length;i++)for(let j=i+1;j<layers.length;j++)ok(!overlap(layers[i],layers[j]),'CONTENT_OVERLAP: '+layers[i].name+'/'+layers[j].name);
 for(const panel of panels)for(const page of layers.filter(l=>l.asset_id))ok(!overlap(panel,page),'PANEL_OBSTRUCTS_PAGE');
 return {width:W,height:H,version:PRESET_VERSION,layers,panels,background_id:bg.id,preset:f,profile:s.composition_profile,review_required:true};
}

export function designSignature(specs){
 const first=specs[0]?.design;if(!first)return null;
 return {font_pairing:first.fonts,font_category:first.font_category,headline_treatment:first.treatment,layout_structure:specs.map(s=>s.design.layout_family),hierarchy:first.hierarchy,alignment:first.blocks.headline.align,cta:specs.filter(s=>s.cta).map(s=>s.design.cta),colour:first.palette.id,background_ids:specs.map(s=>s.background_id),source_images:specs.map(s=>s.design.background_source_id)};
}
const shared=(a,b)=>{const x=new Set(a||[]),y=new Set(b||[]);return x.size&&y.size?[...x].filter(v=>y.has(v)).length/Math.max(x.size,y.size):0;};
export function compareDesign(a,b){
 if(!a||!b)return {score:0,major_differences:6};
 const factors={font_category:a.font_category===b.font_category,headline_treatment:a.headline_treatment===b.headline_treatment,layout_structure:shared(a.layout_structure,b.layout_structure),hierarchy:a.hierarchy===b.hierarchy,alignment:a.alignment===b.alignment,cta:same(a.cta,b.cta)};
 const weights={font_category:.14,headline_treatment:.16,layout_structure:.24,hierarchy:.14,alignment:.06,cta:.16};
 const score=Object.entries(factors).reduce((n,[k,v])=>n+Number(v)*weights[k],0)+(a.colour===b.colour?.04:0)+shared(a.source_images,b.source_images)*.06;
 return {score:Number(score.toFixed(4)),major_differences:Object.values(factors).filter(v=>Number(v)<.5).length,factors};
}
export function acceptableDesign(sig,recent,{partial=false}={}){return recent.every(h=>{const c=compareDesign(sig,h);return partial?c.score<.999:c.score<SIMILARITY_THRESHOLD&&c.major_differences>=3;});}

export function validateBrief(brief,assets){
 ok(brief&&typeof brief==='object','Campaign brief is required');ok(typeof brief.angle==='string'&&brief.angle.trim(),'Campaign angle is required');
 ok(typeof brief.publication_at==='string'&&Number.isFinite(Date.parse(brief.publication_at))&&/([zZ]|[+-]\d\d:\d\d)$/.test(brief.publication_at),'PUBLICATION_DATE_REQUIRED: include an explicit timezone offset');
 ok(['evergreen','promotion'].includes(brief.promotion_mode),'Choose evergreen or promotion explicitly');
 const outputs=brief.outputs;ok(Array.isArray(outputs)&&outputs.length>0&&outputs.length<=20,'Choose one to twenty outputs');
 ok(new Set(outputs.map(o=>o.key)).size===outputs.length,'Output keys must be unique');
 const slides=outputs.filter(o=>o.format==='square'),pins=outputs.filter(o=>o.format==='pinterest');
 if(!brief.structure_override){ok(slides.length===0||slides.length>=2,'A carousel needs a hook and cover');slides.forEach((s,i)=>ok(s.role===(i===0?'hook':i===slides.length-1?'cover_cta':'proof'),'ROLE_MISMATCH: '+s.key));}
 for(const o of outputs){
  ok(/^[a-z0-9_-]{1,40}$/.test(o.key),'Invalid output key');ok(['square','pinterest'].includes(o.format),'Unsupported output format');
  ok(o.headline?.trim()&&o.headline.length<=240&&(!o.supporting_copy||o.supporting_copy.length<=450)&&(!o.cta||o.cta.length<=100),'Invalid exact text: '+o.key);
  ok(Array.isArray(o.page_ids)&&o.page_ids.length<=2&&new Set(o.page_ids).size===o.page_ids.length,'Invalid page selection: '+o.key);
  const pages=o.page_ids.map(id=>assets.find(a=>a.id===id&&a.kind==='page'&&a.planner_id===brief.planner_id));ok(pages.every(Boolean),'CURRENT_PAGE_REQUIRED: '+o.key);
  if(o.role==='hook')ok(!pages.length&&!o.cta,'HOOK_ROLE: '+o.key+' must have no preview or sales CTA');
  else if(o.role==='proof')ok(pages.length>0&&!o.cta,'PROOF_ROLE: '+o.key+' requires genuine proof without a sales CTA');
  else if(o.role==='cover_cta')ok(pages.length===1&&pages[0].metadata?.page_number===1&&o.cta?.trim(),'COVER_CTA_ROLE: '+o.key+' requires the genuine cover and CTA');
  else ok(o.role==='pin'&&o.format==='pinterest'&&pages.length>0&&o.cta?.trim(),'PIN_ROLE: '+o.key+' requires a genuine preview and CTA');
  if(o.format==='pinterest'){ok(o.role==='pin'&&typeof o.product_identification==='string'&&o.product_identification.trim(),'PIN_PRODUCT_REQUIRED: '+o.key);ok([o.headline,o.supporting_copy,o.cta].join('\n').includes(o.product_identification),'PIN_PRODUCT_MISSING_FROM_COPY: '+o.key);ok(['evergreen','promotion'].includes(o.promotion_mode),'PIN_MODE_REQUIRED: '+o.key);}
  for(const k of copyKeys)ok(!o[k]||(!o[k].includes('\u2014')&&!/\b\d+\s*pages?\b/i.test(o[k])),'COPY_POLICY: '+o.key);
 }
 if(brief.quantities)ok(slides.length===brief.quantities.slides&&pins.length===brief.quantities.pins,'OUTPUT_COUNT_MISMATCH');
 return brief;
}

function blockStyles(system,o,palette){
 const blocks={};for(const key of copyKeys){if(!o[key])continue;
  blocks[key]={font_family:key==='headline'?system.headline:system.support,weight:key==='headline'?system.weight:400,italic:false,size:key==='headline'?system.size:key==='supporting_copy'?38:34,line_height:key==='headline'?1.06:1.2,tracking:system.treatment==='spacious_minimal'?2:key==='headline'&&system.category==='condensed'?.5:0,align:system.align,colour:palette.ink};
  if(key==='headline'&&system.treatment==='condensed_poster')blocks[key].uppercase=true;
  if(o.emphasis?.[key])blocks[key].emphasis=o.emphasis[key];
 }
 if(system.treatment==='oversized_numeral'){const m=o.headline.match(/\b\d+(?:%|\.\d+)?\b/);if(m)blocks.headline.emphasis=[{start:m.index,end:m.index+m[0].length,colour:palette.accent,scale:1.4}];}
 if(system.treatment==='phrase_emphasis'&&!blocks.headline.emphasis){const m=o.headline.match(/^\S+(?:\s+\S+)?/);blocks.headline.emphasis=[{start:0,end:m[0].length,colour:palette.accent}];}
 return blocks;
}

function chooseBackground(rng,bank,history,used,format,exceptions){
 const eligible=bank.filter(a=>a.kind==='background'&&a.ready!==false&&a.width===(format==='square'?1080:1000)&&a.height===(format==='square'?1080:1500));
 ok(eligible.length,'NO_APPROVED_BACKGROUNDS: '+format);
 const lastUse=id=>history.findIndex(h=>(h.source_images||[]).includes(id));
 const distinct=eligible.filter(a=>!used.has(sourceIdentity(a)));
 ok(distinct.length,'INSUFFICIENT_DISTINCT_BACKGROUNDS: outputs need separate suitable photographs');
 const unused=distinct.filter(a=>lastUse(sourceIdentity(a))===-1);
 let choices=unused;
 if(!choices.length){const oldest=Math.max(...distinct.map(a=>lastUse(sourceIdentity(a))));choices=distinct.filter(a=>lastUse(sourceIdentity(a))===oldest);}
 const chosen=pick(rng,choices);used.add(sourceIdentity(chosen));
 if(!unused.length)exceptions.push({code:'BACKGROUND_LRU_REUSE',background_id:chosen.id,source_image_id:sourceIdentity(chosen),last_used_campaigns_ago:lastUse(sourceIdentity(chosen))+1,reason:'The approved destination bank has no suitable unused photograph in the last ten campaigns.'});
 return chosen;
}

export function resolveAutomatic(brief,assets,history=[],{seed,previous=null,mode='all',locks=[]}={}){
 validateBrief(brief,assets);ok(seed!=null&&String(seed).length<=120,'A stable seed is required');ok(['all','layout','typography','cta','correction'].includes(mode),'Unknown variation mode');
 ok(locks.every(l=>LOCK_FIELDS.includes(l)),'Unknown locked element');
 if(previous)ok(same(previous.brief,brief)||mode==='correction','LOCKED_CONTENT_CHANGED: variation must preserve exact copy, offers, pages, roles and dates');
 if(previous&&String(seed)===String(previous.seed)&&mode==='all')return structuredClone(previous);
 const rng=random(seed),recent=history.slice(0,10),recentCarousel=recent.map(h=>h.carousel).filter(Boolean),recentPins=recent.flatMap(h=>h.pins||[]);
 if(previous){recentCarousel.unshift(previous.signatures.carousel);recentPins.unshift(...previous.signatures.pins);}
 const backgroundsHistory=recent.map(h=>({source_images:[...(h.carousel?.source_images||[]),...(h.pins||[]).flatMap(p=>p.source_images||[])]}));
 const isLocked=field=>locks.includes(field)||(previous&&mode==='correction')||(previous&&mode!=='all'&&mode!=='correction'&&mode!==({backgrounds:'backgrounds',layout:'layout',typography:'typography',cta:'cta',colour:'colour'}[field]));
 const oldByKey=new Map((previous?.outputs||[]).map(o=>[o.key,o]));
 for(let attempt=0;attempt<240;attempt++){
  const used=new Set(),exceptions=[],outputs=[],selectedSystems=[];
  let carouselSystem=pick(rng,SYSTEMS.filter(s=>s.treatment!=='oversized_numeral'||brief.outputs.some(o=>/\d/.test(o.headline))));
  const palette=pick(rng,PALETTES),carouselCTA=pick(rng,carouselSystem.ctas),carouselLayouts=shuffle(rng,carouselSystem.layouts);
  try{
   for(let i=0;i<brief.outputs.length;i++){
    const o=brief.outputs[i],old=oldByKey.get(o.key),pin=o.format==='pinterest';
    if(mode==='correction'&&old&&same(previous.brief.outputs.find(x=>x.key===o.key),o)){outputs.push({...structuredClone(old),expected_revision:old.revision});used.add(old.composition.design.background_source_id);continue;}
    let system=pin?pick(rng,SYSTEMS.filter(s=>s.treatment!=='oversized_numeral'||/\d/.test(o.headline))):carouselSystem;
    if(isLocked('typography')&&old)system=SYSTEMS.find(s=>s.id===old.composition.design.system_id)||system;
    let colour=isLocked('colour')&&old?old.composition.design.palette:pin?pick(rng,PALETTES):palette;
    const bg=isLocked('backgrounds')&&old?assets.find(a=>a.id===old.composition.background_id):chooseBackground(rng,assets,backgroundsHistory,used,o.format,exceptions);
    ok(bg,'LOCKED_BACKGROUND_UNAVAILABLE');used.add(sourceIdentity(bg));
    const layouts=pin?shuffle(rng,system.layouts):carouselLayouts,family=isLocked('layout')&&old?old.composition.design.layout_family:layouts[i%layouts.length];
    const ctaTreatment=isLocked('cta')&&old?old.composition.design.cta.treatment:pin?pick(rng,system.ctas):carouselCTA;
    const d={version:PRESET_VERSION,system_id:system.id,font_category:system.category,hierarchy:system.hierarchy,treatment:system.treatment,layout_family:family,role:o.role,fonts:[...new Set([system.headline,system.support])],blocks:blockStyles(system,o,colour),palette:colour,cta:{treatment:ctaTreatment,location:ctaTreatment==='integrated'?'below_headline':['footer_band'].includes(ctaTreatment)?'footer':ctaTreatment==='side_panel'?'side':ctaTreatment==='offer_panel'?'offer':'below_copy'},seed:String(seed),background_source_id:sourceIdentity(bg)};
    if(isLocked('typography')&&old){const generated=d.blocks;d.blocks=structuredClone(old.composition.design.blocks);d.fonts=old.composition.design.fonts;if(mode==='correction'){const prior=previous.brief.outputs.find(x=>x.key===o.key);for(const key of copyKeys){if(!o[key]){delete d.blocks[key];continue;}d.blocks[key]??=generated[key];if(o.emphasis?.[key])d.blocks[key].emphasis=o.emphasis[key];else if(prior[key]!==o[key]){if(generated[key]?.emphasis)d.blocks[key].emphasis=generated[key].emphasis;else delete d.blocks[key].emphasis;}}}}
    // A correction retains the entire design of unchanged outputs.
    const composition=mode==='correction'&&old&&same(previous.brief.outputs.find(x=>x.key===o.key),o)?structuredClone(old.composition):{planner_id:brief.planner_id,output_type:o.format,background_id:bg.id,font_family:d.blocks.headline.font_family,composition_profile:bg.metadata?.composition_profile||'balanced_premium',layout_preset:'auto',headline:o.headline,...(o.supporting_copy?{supporting_copy:o.supporting_copy}:{}),...(o.cta?{cta:o.cta}:{}),planner_page_ids:o.page_ids,design:d};
    const selected=[bg,...o.page_ids.map(id=>assets.find(a=>a.id===id))];
    const layout=automaticLayout(composition,selected);
    outputs.push({key:o.key,composition,layout,asset_versions:selected.map(a=>({id:a.id,checksum:a.checksum,source_checksum:a.source_checksum||null})),...(old?{composition_id:old.composition_id,expected_revision:old.revision}:{} )});selectedSystems.push(system.id);
   }
   const carousel=designSignature(outputs.filter(o=>o.composition.output_type==='square').map(o=>o.composition)),pins=outputs.filter(o=>o.composition.output_type==='pinterest').map(o=>designSignature([o.composition]));
   const partial=mode!=='all';
   if(mode!=='correction'){
    if(carousel&&!acceptableDesign(carousel,recentCarousel,{partial}))continue;
    if(pins.some((p,i)=>!acceptableDesign(p,[...recentPins,...pins.slice(0,i)],{partial})))continue;
   }
   return {version:PRESET_VERSION,seed:String(seed),brief:structuredClone(brief),locks:[...locks],outputs,signatures:{carousel,pins},exceptions,similarity:{threshold:SIMILARITY_THRESHOLD,minimum_major_differences:partial?null:3,partial_control:partial,history_campaigns:recent.length,carousel:recentCarousel.map(x=>compareDesign(carousel,x)),pins:pins.map(p=>recentPins.map(x=>compareDesign(p,x)))},asset_versions:outputs.flatMap(o=>o.asset_versions)};
  }catch(e){if(/LOCKED_|NO_APPROVED_|INSUFFICIENT_DISTINCT_/.test(e.message))throw e;if(attempt===239)throw e;}
 }
 throw Error('NO_DISTINCT_COMPATIBLE_DESIGN: unlock more design elements or expand the approved bank; exact recent combinations are rejected');
}
