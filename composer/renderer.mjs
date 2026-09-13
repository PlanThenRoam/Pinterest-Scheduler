import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium as playwright} from 'playwright';
import chromium from '@sparticuz/chromium';
import {browserPath} from './browser.mjs';
import sharp from 'sharp';
import {create as fontCreate} from 'fontkit';
import {FONTS,VERSION,resolveLayout,assert,canonical} from '../supabase/functions/composer/core.mjs';
import {inspectPng} from '../supabase/functions/composer/archive.mjs';
import {measureText} from './text-preflight.mjs';
import {GOOGLE_FONTS} from '../supabase/functions/composer/font-manifest.mjs';
import {renderAutomatic} from './automatic-renderer.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export const sha=b=>createHash('sha256').update(b).digest('hex');
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=b=>'data:image/png;base64,'+b.toString('base64');
const fontCache=new Map();
export async function fontBank(family,options={}){const key=canonical({family,weight:options.weight||400,italic:options.italic||false});if(!fontCache.has(key))fontCache.set(key,loadFont(family,options).catch(e=>{fontCache.delete(key);throw e;}));return fontCache.get(key);}
async function loadFont(family,{weight=400,italic=false}={}){
 const bundled=GOOGLE_FONTS.find(f=>f.family===family);
 if(bundled){const entry=bundled.files.find(f=>f.style===(italic?'italic':'normal')&&weight>=f.weight_min&&weight<=f.weight_max);assert(entry,'FONT_STYLE_UNAVAILABLE: '+family+' '+weight+(italic?' italic':''));const bytes=await fs.readFile(path.join(root,'fonts',entry.file));assert(sha(bytes)===entry.checksum,'Bundled font checksum mismatch');let font=fontCreate(bytes);if(entry.axes.wght)font=font.getVariation({wght:weight});return [{name:entry.file,bytes,font,checksum:entry.checksum,format:'truetype'}];}
 assert(FONTS.includes(family),'Unsupported font family');const slug=family.toLowerCase().replaceAll(' ','-');
 const dir=path.join(root,'node_modules','@fontsource',slug,'files');const style=italic?'italic':'normal';
 const all=await fs.readdir(dir);const chosen=all.filter(n=>n.endsWith(`-${weight}-${style}.woff2`));assert(chosen.length,'Requested font weight/style is unavailable');
 // Latin and Latin Extended are enough for current copy; reject missing glyphs rather than fall back.
 const names=chosen.filter(n=>n.includes('-latin-')||n.includes('-latin-ext-')).sort((a,b)=>Number(b.includes('-latin-'))-Number(a.includes('-latin-')));
 const fonts=await Promise.all(names.map(async name=>{const bytes=await fs.readFile(path.join(dir,name));return {name,bytes,font:fontCreate(bytes),checksum:sha(bytes)};}));assert(fonts.length,'Font files missing');return fonts;
}
export async function fontCatalog(){const out=[];for(const family of FONTS){const bundled=GOOGLE_FONTS.find(f=>f.family===family);if(bundled){out.push({family,styles:bundled.files.flatMap(f=>Array.from({length:Math.floor((f.weight_max-f.weight_min)/100)+1},(_,i)=>[String(f.weight_min+i*100),f.style]))});continue;}const slug=family.toLowerCase().replaceAll(' ','-');const files=await fs.readdir(path.join(root,'node_modules','@fontsource',slug,'files'));out.push({family,styles:files.filter(n=>n.includes('-latin-')&&n.endsWith('.woff2')).map(n=>n.match(/-(\d+)-(normal|italic)\.woff2$/).slice(1))});}return out;}
const clock=()=>performance.now(),elapsed=t=>Math.round((clock()-t)*100)/100;
async function renderInSession(session,spec,assets,loadBytes,{preflightOnly=false,scope='default'}={}){
 if(spec.design)return renderAutomatic(session,spec,assets,loadBytes,{preflightOnly,scope,fontBank,sha});
 const started=clock(),timings={},layout=resolveLayout(spec,assets);let tick=clock();const fonts=await fontBank(spec.font_family,spec.typography||{});timings.font_loading_ms=elapsed(tick);
 const texts=layout.layers.filter(l=>!l.asset_id);for(const layer of texts)for(const char of spec[layer.name])if(!/\s/.test(char))assert(fonts.some(f=>f.font.hasGlyphForCodePoint(char.codePointAt(0))),`Font lacks glyph ${char}`);
 const weight=spec.typography?.weight||400,style=spec.typography?.italic?'italic':'normal';
 // Each subset uses the same family and declared codepoint coverage; no system fallback.
 const faces=fonts.map(f=>{const range=[...new Set(f.font.characterSet)].map(c=>'U+'+c.toString(16)).join(',');return `@font-face{font-family:ComposerFont;src:url(data:font/woff2;base64,${f.bytes.toString('base64')}) format('${f.format||'woff2'}');font-weight:${weight};font-style:${style};font-display:block;unicode-range:${range};}`}).join('');
 const ink=spec.ink||'#FFF9F0',dark=ink!=='#FFF9F0',contrast=spec.contrast||0;
 const baseSizes={label:32,headline:layout.preset.endsWith('hook')?96:72,supporting_copy:40,cta:36},minSizes={label:28,headline:56,supporting_copy:32,cta:30};
 Object.assign(baseSizes,spec.typography?.sizes||{});
 const layers=layout.layers.map(l=>{
  const pos=`position:absolute;left:${l.x}px;top:${l.y}px;width:${l.width}px;height:${l.height}px;z-index:${l.z};`;
  if(l.asset_id)return `<img data-layer="${l.name}" data-asset="${l.asset_id}" style="${pos}object-fit:contain;filter:drop-shadow(0 8px 12px #0004)">`;
  return `<div data-layer="${l.name}" class="copy" data-min="${minSizes[l.name]}" style="${pos}font-size:${baseSizes[l.name]}px;text-align:${l.align};${l.name==='cta'?`border:${spec.cta_style==='text'?0:1}px solid ${ink};border-radius:2px;padding:12px;${spec.cta_style==='solid'?`background:${dark?'#fff':'#142C35'};`:''}`:''}"><span>${escape(spec[l.name])}</span></div>`;
 }).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${faces}*{box-sizing:border-box}html,body{margin:0;width:${layout.width}px;height:${layout.height}px;overflow:hidden}body{font-family:ComposerFont;font-weight:${weight};font-style:${style};font-synthesis:none;color:${ink}}.copy{opacity:${spec.typography?.opacity??1};text-shadow:${spec.typography?.shadow?'0 2px 4px #0004':'none'};display:flex;align-items:center;justify-content:center;line-height:${spec.typography?.line_height||1.12};letter-spacing:${spec.typography?.letter_spacing||0}px;white-space:pre-wrap;overflow-wrap:normal}.copy span{display:block;width:100%}</style></head><body><img id="background" data-asset="${spec.background_id}" style="position:absolute;inset:0;width:${layout.width}px;height:${layout.height}px"><div id="contrast" style="position:absolute;inset:0;background:${dark?'#fff':'#000'};opacity:${contrast}"></div>${layers}</body></html>`;
 const browser=session.browser,page=await browser.newPage({viewport:{width:layout.width,height:layout.height},deviceScaleFactor:1,locale:'en-GB',timezoneId:'UTC',colorScheme:'light',reducedMotion:'reduce'});
 try{
  tick=clock();page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(45000);await page.route('**/*',route=>route.abort());await page.setContent(html,{waitUntil:'load'});await page.evaluate(async()=>{let timer;try{await Promise.race([Promise.all([...document.fonts].map(f=>f.load())),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Font load timed out')),30000)})]);}finally{clearTimeout(timer);}await document.fonts.ready;if([...document.fonts].some(f=>f.status!=='loaded'))throw Error('Selected font did not load');});
  const measured=await measureText(page),preflight={valid:measured.every(x=>!x.overflow&&!x.isolated_words.length),exact_text:measured.every(x=>x.text===spec[x.name]),font_loaded:true,lines:measured,suggested_sizes:Object.fromEntries(measured.filter(x=>x.suggested_font_size).map(x=>[x.name,x.suggested_font_size])),warnings:measured.filter(x=>x.adjusted).map(x=>({field:x.name,code:'TYPOGRAPHY_ADJUSTED',font_size:x.font_size,wrap_mode:x.wrap_mode}))};timings.text_preflight_ms=elapsed(tick);
  assert(preflight.exact_text,'Exact copy mismatch');assert(new Set(measured.map(x=>x.font_family)).size===1,'Mixed font families');
  if(!preflight.valid){const e=Error(measured.some(x=>x.overflow)?'Copy overflow within readable font limits':'Isolated word remains: adjust line breaks or layout without changing approved wording');e.preflight=preflight;e.timings={...timings,total_ms:elapsed(started)};throw e;}
  const resolved={...layout,layers:layout.layers.map(l=>({...l,...measured.find(x=>x.name===l.name)}))};
  if(preflightOnly)return {preflight,layout:resolved,timings:{...timings,total_ms:elapsed(started)}};
  tick=clock();const buffers=await Promise.all(assets.map(async a=>[a.id,data(await session.verifiedAsset(a,loadBytes,scope))]));timings.asset_loading_ms=elapsed(tick);
  tick=clock();await page.evaluate(async rows=>{const sources=new Map(rows);for(const img of document.images)img.src=sources.get(img.dataset.asset);await Promise.all([...document.images].map(i=>i.decode()));},buffers);const shot=await page.screenshot({type:'png',animations:'disabled'});timings.rendering_ms=elapsed(tick);
  tick=clock();const png=await sharp(shot,{failOn:'warning'}).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer(),meta=inspectPng(png);assert(meta.width===layout.width&&meta.height===layout.height,'Invalid output dimensions');timings.png_encoding_ms=elapsed(tick);tick=clock();
  const visiblePixels=await sharp(png).removeAlpha().raw().toBuffer();await page.addStyleTag({content:'.copy{visibility:hidden!important}'});const barePixels=await sharp(await page.screenshot({type:'png'})).removeAlpha().raw().toBuffer();const inkRGB=ink.slice(1).match(/../g).map(x=>parseInt(x,16));const lum=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);const inkLum=lum(inkRGB);const contrastResults=[];for(const l of measured){const ratios=[];for(let y=Math.ceil(l.y);y<Math.floor(l.y+l.height);y++)for(let x=Math.ceil(l.x);x<Math.floor(l.x+l.width);x++){const i=(y*layout.width+x)*3;if(Math.max(...[0,1,2].map(c=>Math.abs(visiblePixels[i+c]-barePixels[i+c])))>40){const bgLum=lum([...barePixels.slice(i,i+3)]);ratios.push((Math.max(inkLum,bgLum)+.05)/(Math.min(inkLum,bgLum)+.05));}}assert(ratios.length>20,'Text is not visibly rendered');ratios.sort((a,b)=>a-b);const ratio=ratios[Math.floor(ratios.length*.1)];assert(ratio>=3,'Text contrast is too low: request stronger contrast treatment or different ink');contrastResults.push({name:l.name,contrast:Math.round(ratio*100)/100,visible_pixels:ratios.length});}
  timings.validation_ms=elapsed(tick);timings.total_ms=elapsed(started);const renderer={version:VERSION,browser:browser.version(),fonts:fonts.map(f=>({file:f.name,checksum:f.checksum})),layout_checksum:sha(canonical(resolved)),platform:process.platform,sharp:sharp.versions.sharp};
  return {png,checksum:sha(png),layout:resolved,renderer,preflight,timings,validation:{valid:true,exact_text:true,font_families:1,font_loaded:true,visible_text:contrastResults,overflow:false,isolated_words:false,width:layout.width,height:layout.height,page_contain:true,asset_checksums:true,full_decode:true,visual_review_required:true,protected_zones_checked:true}};
 }finally{await page.close();}
}
export async function createRendererSession({cacheBytes=128*1024*1024}={}){
 const start=clock(),browser=await playwright.launch({headless:true,executablePath:await browserPath(),args:chromium.args.filter(a=>a!=='--single-process')}),cache=new Map();let used=0;
 const statistics={browser_starts:1,browser_setup_ms:elapsed(start),asset_cache_hits:0,asset_cache_misses:0,asset_bytes_loaded:0};
 const session={browser,statistics,async verifiedAsset(a,load,scope){const key=`${scope}/${a.id}/${a.checksum}/${a.width}x${a.height}`;if(cache.has(key)){statistics.asset_cache_hits++;return cache.get(key);}statistics.asset_cache_misses++;
  const pending=(async()=>{const b=Buffer.from(await load(a));assert(sha(b)===a.checksum,'Asset checksum mismatch');const m=inspectPng(b);assert(m.width===a.width&&m.height===a.height,'Asset dimensions mismatch');await sharp(b,{failOn:'warning'}).raw().toBuffer();statistics.asset_bytes_loaded+=b.length;used+=b.length;return b;})().catch(e=>{cache.delete(key);throw e;});cache.set(key,pending);const bytes=await pending;if(used>cacheBytes){cache.clear();used=0;}return bytes;
 }};
 return {...session,render:(s,a,load,o)=>renderInSession(session,s,a,load,o),preflight:(s,a,o)=>renderInSession(session,s,a,null,{...o,preflightOnly:true}),close:()=>browser.close()};
}
export async function render(spec,assets,loadBytes){const session=await createRendererSession();try{return {...await session.render(spec,assets,loadBytes),session_metrics:session.statistics};}finally{await session.close();}}
