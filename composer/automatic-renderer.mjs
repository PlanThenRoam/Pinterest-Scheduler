import sharp from 'sharp';
import {resolveLayout,assert,canonical,VERSION} from '../supabase/functions/composer/core.mjs';
import {READABILITY} from '../supabase/functions/composer/art-direction.mjs';
import {inspectPng} from '../supabase/functions/composer/archive.mjs';
import {measureText} from './text-preflight.mjs';

const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rgba=(hex,a)=>'rgba('+hex.slice(1).match(/../g).map(n=>parseInt(n,16)).join(',')+','+a+')';
const position=l=>`position:absolute;left:${l.x}px;top:${l.y}px;width:${l.width}px;height:${l.height}px;z-index:${l.z};`;
const clock=()=>performance.now();
const elapsed=start=>Math.round((clock()-start)*100)/100;
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);

function markedText(text,block){
 let at=0,out='';for(const e of block.emphasis||[]){out+=escape(text.slice(at,e.start));out+=`<span style="${e.colour?`color:${e.colour};`:''}${e.weight?`font-weight:${e.weight};`:''}${e.scale?`font-size:${e.scale}em;`:''}">${escape(text.slice(e.start,e.end))}</span>`;at=e.end;}return out+escape(text.slice(at));
}

export async function renderAutomatic(session,spec,assets,loadBytes,{preflightOnly=false,scope,fontBank,sha}){
 const started=clock(),timings={},layout=resolveLayout(spec,assets),d=spec.design;
 let tick=clock();const choices=new Map();
 for(const [name,b] of Object.entries(d.blocks)){
  for(const weight of new Set([b.weight,...(b.emphasis||[]).map(e=>e.weight).filter(Boolean)])){
   const key=canonical({family:b.font_family,weight,italic:b.italic});if(!choices.has(key))choices.set(key,{family:b.font_family,weight,italic:b.italic,fonts:await fontBank(b.font_family,{weight,italic:b.italic})});
  }
  const fonts=choices.get(canonical({family:b.font_family,weight:b.weight,italic:b.italic})).fonts;
  const visualText=b.uppercase?spec[name].toLocaleUpperCase('en-GB'):spec[name];
  for(const char of visualText)if(!/\s/.test(char))assert(fonts.some(f=>f.font.hasGlyphForCodePoint(char.codePointAt(0))),`FONT_GLYPH_MISSING: ${name} ${char} in ${b.font_family}`);
 }
 timings.font_loading_ms=elapsed(tick);
 const familyNames=new Map(d.fonts.map((f,i)=>[f,'CampaignFont'+i]));
 const faces=[...choices.values()].flatMap(v=>v.fonts.map(f=>`@font-face{font-family:${familyNames.get(v.family)};src:url(data:font/${f.format==='truetype'?'ttf':'woff2'};base64,${f.bytes.toString('base64')}) format('${f.format||'woff2'}');font-weight:${v.weight};font-style:${v.italic?'italic':'normal'};font-display:block;unicode-range:${[...new Set(f.font.characterSet)].map(c=>'U+'+c.toString(16)).join(',')};}`)).join('');
 const panels=layout.panels.map(l=>`<div data-backdrop="${l.name}" style="${position(l)}${l.outline?`border:2px solid ${d.palette.ink};`:''}${l.accent?`border-left:5px solid ${l.accent};`:''}border-radius:${l.radius||0}px;background:${l.gradient?`linear-gradient(90deg,${rgba(l.colour,l.opacity)},${rgba(l.colour,l.opacity*.96)} 85%,${rgba(l.colour,l.opacity*.84)})`:rgba(l.colour,l.opacity)}"></div>`).join('');
 const layers=layout.layers.map(l=>{
  if(l.asset_id)return `<img data-layer="${l.name}" data-asset="${l.asset_id}" style="${position(l)}object-fit:contain">`;
  const b=d.blocks[l.name],cta=l.name==='cta',under=cta&&d.cta.treatment==='underlined';
  const stack=l.name==='headline'&&d.treatment==='stacked',deliberate=stack||(l.name==='headline'&&spec.headline.trim().split(/\s+/).length<=5);
  return `<div class="copy" data-layer="${l.name}" data-min="${READABILITY[l.name]}" data-deliberate-stack="${deliberate}" style="${position(l)}font-family:${familyNames.get(b.font_family)};font-weight:${b.weight};font-style:${b.italic?'italic':'normal'};font-size:${b.size}px;line-height:${b.line_height};letter-spacing:${b.tracking}px;color:${b.colour};text-align:${b.align};text-transform:${b.uppercase?'uppercase':'none'};${cta?'padding:14px 20px;':''}${under?'text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:8px;':''}"><span class="text" style="${stack?'max-width:7.8em;':''}">${markedText(spec[l.name],b)}</span></div>`;
 }).join('');
 const html=`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><style>${faces}*{box-sizing:border-box}html,body{margin:0;width:${layout.width}px;height:${layout.height}px;overflow:hidden}body{font-synthesis:none}.copy{display:flex;align-items:center;white-space:pre-wrap;overflow-wrap:normal}.copy>.text{display:block;width:100%}.copy[style*="text-align:center"]{justify-content:center}.copy[style*="text-align:right"]{justify-content:flex-end}</style></head><body><img data-asset="${spec.background_id}" style="position:absolute;inset:0;width:${layout.width}px;height:${layout.height}px">${panels}${layers}</body></html>`;
 const page=await session.browser.newPage({viewport:{width:layout.width,height:layout.height},deviceScaleFactor:1,locale:'en-GB',timezoneId:'UTC',colorScheme:'light',reducedMotion:'reduce'});
 try{
  tick=clock();page.setDefaultTimeout(45000);await page.route('**/*',r=>r.abort());await page.setContent(html);
  await page.evaluate(async()=>{await Promise.all([...document.fonts].map(f=>f.load()));await document.fonts.ready;if([...document.fonts].some(f=>f.status!=='loaded'))throw Error('FONT_LOAD_FAILED');});
  const measured=await measureText(page),preflight={valid:measured.every(x=>!x.overflow&&!x.isolated_words.length),exact_text:measured.every(x=>x.text===spec[x.name]),font_loaded:true,lines:measured,suggested_sizes:Object.fromEntries(measured.map(x=>[x.name,x.font_size])),warnings:measured.filter(x=>x.adjusted).map(x=>({field:x.name,code:'REFLOWED_WITHIN_READABILITY_FLOOR',font_size:x.font_size}))};
  timings.text_preflight_ms=elapsed(tick);
  if(!preflight.valid||!preflight.exact_text){const e=Error('COPY_DOES_NOT_FIT: '+measured.filter(x=>x.overflow||x.isolated_words.length).map(x=>x.name).join(', ')+'; choose a larger text layout or supply approved line breaks. No words were removed.');e.preflight=preflight;e.timings={...timings,total_ms:elapsed(started)};throw e;}
  await page.evaluate(()=>{for(const el of document.querySelectorAll('.copy')){const panel=document.querySelector('[data-backdrop="'+el.dataset.layer+'_panel"]');if(!panel||!panel.style.background.includes('gradient'))continue;const range=document.createRange();range.selectNodeContents(el.firstElementChild);const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);if(!rects.length)continue;const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right)),top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));panel.style.left=Math.max(0,left-30)+'px';panel.style.top=Math.max(0,top-24)+'px';panel.style.width=(right-left+60)+'px';panel.style.height=(bottom-top+48)+'px';panel.style.maskImage='linear-gradient(to right,transparent,#000 20px,#000 calc(100% - 20px),transparent),linear-gradient(to bottom,transparent,#000 16px,#000 calc(100% - 16px),transparent)';panel.style.maskComposite='intersect';}});
  const resolved={...layout,layers:layout.layers.map(l=>({...l,...measured.find(x=>x.name===l.name)}))};
  if(preflightOnly)return {preflight,layout:resolved,timings:{...timings,total_ms:elapsed(started)}};
  tick=clock();const buffers=await Promise.all(assets.map(async a=>[a.id,'data:image/png;base64,'+(await session.verifiedAsset(a,loadBytes,scope)).toString('base64')]));timings.asset_loading_ms=elapsed(tick);
  tick=clock();await page.evaluate(async rows=>{const src=new Map(rows);for(const image of document.images)image.src=src.get(image.dataset.asset);await Promise.all([...document.images].map(i=>i.decode()));},buffers);
  // Prefer readable unboxed type when the verified photograph permits it.
  // This deterministic contrast choice is saved with the resolved render.
  const localPanels=await page.evaluate(()=>{const out=[];for(const el of document.querySelectorAll('.copy')){const panel=document.querySelector('[data-backdrop="'+el.dataset.layer+'_panel"]');if(!panel?.style.background.includes('gradient'))continue;const range=document.createRange();range.selectNodeContents(el.firstElementChild);out.push({name:el.dataset.layer,rects:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),hasEmphasis:el.firstElementChild.children.length>0});panel.style.visibility='hidden';}for(const el of document.querySelectorAll('.copy>.text'))el.style.visibility='hidden';return out;});
  const photoPixels=await sharp(await page.screenshot({type:'png'})).removeAlpha().raw().toBuffer(),contrastChoices=[];
  for(const item of localPanels){const candidates=[d.blocks[item.name].colour,d.palette.panel].map(colour=>{const rgb=colour.slice(1).match(/../g).map(x=>parseInt(x,16)),ink=luminance(rgb),ratios=[];for(const r of item.rects)for(let y=Math.max(0,Math.ceil(r.y));y<Math.min(layout.height,Math.floor(r.y+r.height));y+=4)for(let x=Math.max(0,Math.ceil(r.x));x<Math.min(layout.width,Math.floor(r.x+r.width));x+=4){const i=(y*layout.width+x)*3,bg=luminance([...photoPixels.subarray(i,i+3)]);ratios.push((Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));}ratios.sort((a,b)=>a-b);return {colour,ratio:ratios[Math.floor(ratios.length*.08)]||0};});const floor=item.name==='headline'?3.3:5,chosen=candidates.find(c=>c.ratio>=floor);contrastChoices.push({name:item.name,unboxed:!!chosen&&!item.hasEmphasis&&d.colour_mode!=='fixed',colour:chosen?.colour||d.blocks[item.name].colour});}
  await page.evaluate(choices=>{for(const el of document.querySelectorAll('.copy>.text'))el.style.visibility='';for(const c of choices){const el=document.querySelector('[data-layer="'+c.name+'"]'),panel=document.querySelector('[data-backdrop="'+c.name+'_panel"]');if(c.unboxed)el.style.color=c.colour;else panel.style.visibility='';}},contrastChoices);
  resolved.contrast_choices=contrastChoices;
  const pageIntegrity=await page.evaluate(()=>[...document.images].filter(i=>i.dataset.layer).every(i=>i.complete&&i.naturalWidth>0&&getComputedStyle(i).transform==='none'&&getComputedStyle(i).objectFit==='contain'));
  assert(pageIntegrity,'GENUINE_PAGE_INTEGRITY_FAILED');
  const shot=await page.screenshot({type:'png',animations:'disabled'});timings.rendering_ms=elapsed(tick);
  tick=clock();const png=await sharp(shot,{failOn:'warning'}).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();const dimensions=inspectPng(png);assert(dimensions.width===layout.width&&dimensions.height===layout.height,'Output dimensions mismatch');await sharp(png,{failOn:'warning'}).raw().toBuffer();timings.png_encoding_ms=elapsed(tick);
  tick=clock();const visible=await sharp(png).removeAlpha().raw().toBuffer();await page.addStyleTag({content:'.copy>.text{visibility:hidden!important}'});const bare=await sharp(await page.screenshot({type:'png'})).removeAlpha().raw().toBuffer();
  const contrast=[];for(const l of measured){const ratios=[];for(let y=Math.ceil(l.y);y<Math.floor(l.y+l.height);y++)for(let x=Math.ceil(l.x);x<Math.floor(l.x+l.width);x++){
   const i=(y*layout.width+x)*3,a=[...visible.subarray(i,i+3)],b=[...bare.subarray(i,i+3)];
   if(Math.max(...a.map((v,c)=>Math.abs(v-b[c])))>85){const la=luminance(a),lb=luminance(b);ratios.push((Math.max(la,lb)+.05)/(Math.min(la,lb)+.05));}
  }assert(ratios.length>20,'Text is not visibly rendered: '+l.name);ratios.sort((a,b)=>a-b);const value=ratios[Math.floor(ratios.length*.25)],floor=l.name==='headline'?3:4.5;assert(value>=floor,'TEXT_CONTRAST_LOW: '+l.name+' '+value.toFixed(2));contrast.push({name:l.name,contrast:Number(value.toFixed(2)),minimum:floor,visible_pixels:ratios.length});}
  const phone=await sharp(png).resize({width:360}).png().toBuffer();timings.validation_ms=elapsed(tick);timings.total_ms=elapsed(started);
  return {png,phone,phone_checksum:sha(phone),checksum:sha(png),layout:resolved,preflight,timings,renderer:{version:VERSION,preset_version:d.version,browser:session.browser.version(),fonts:[...choices.values()].flatMap(v=>v.fonts.map(f=>({family:v.family,weight:v.weight,italic:v.italic,file:f.name,checksum:f.checksum}))),layout_checksum:sha(canonical(resolved)),platform:process.platform,sharp:sharp.versions.sharp},validation:{valid:true,approval:'automated_checks_only',exact_text:true,font_families:d.fonts.length,font_loaded:true,visible_text:contrast,overflow:false,isolated_words:false,...dimensions,page_contain:true,asset_checksums:true,full_decode:true,visual_review_required:true,protected_zones_checked:true,phone_preview:{width:360,height:Math.round(360*layout.height/layout.width),checksum:sha(phone)}}};
 }finally{await page.close();}
}
