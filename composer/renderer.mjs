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
const root=path.dirname(fileURLToPath(import.meta.url));
export const sha=b=>createHash('sha256').update(b).digest('hex');
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=b=>'data:image/png;base64,'+b.toString('base64');
export async function fontBank(family,{weight=400,italic=false}={}){
 assert(FONTS.includes(family),'Unsupported font family');const slug=family.toLowerCase().replaceAll(' ','-');
 const dir=path.join(root,'node_modules','@fontsource',slug,'files');const style=italic?'italic':'normal';
 const all=await fs.readdir(dir);const chosen=all.filter(n=>n.endsWith(`-${weight}-${style}.woff2`));assert(chosen.length,'Requested font weight/style is unavailable');
 // Latin and Latin Extended are enough for current copy; reject missing glyphs rather than fall back.
 const names=chosen.filter(n=>n.includes('-latin-')||n.includes('-latin-ext-')).sort((a,b)=>Number(b.includes('-latin-'))-Number(a.includes('-latin-')));
 const fonts=await Promise.all(names.map(async name=>{const bytes=await fs.readFile(path.join(dir,name));return {name,bytes,font:fontCreate(bytes),checksum:sha(bytes)};}));assert(fonts.length,'Font files missing');return fonts;
}
export async function fontCatalog(){const out=[];for(const family of FONTS){const slug=family.toLowerCase().replaceAll(' ','-');const files=await fs.readdir(path.join(root,'node_modules','@fontsource',slug,'files'));out.push({family,styles:files.filter(n=>n.includes('-latin-')&&n.endsWith('.woff2')).map(n=>n.match(/-(\d+)-(normal|italic)\.woff2$/).slice(1))});}return out;}
export async function render(spec,assets,loadBytes){
 const layout=resolveLayout(spec,assets),fonts=await fontBank(spec.font_family,spec.typography||{});
 const texts=layout.layers.filter(l=>!l.asset_id);for(const layer of texts)for(const char of spec[layer.name])if(!/\s/.test(char))assert(fonts.some(f=>f.font.hasGlyphForCodePoint(char.codePointAt(0))),`Font lacks glyph ${char}`);
 const buffers=new Map();for(const a of assets){const b=Buffer.from(await loadBytes(a));assert(sha(b)===a.checksum,'Asset checksum mismatch');const m=await sharp(b).metadata();assert(m.format==='png'&&m.width===a.width&&m.height===a.height,'Asset format or dimensions mismatch');buffers.set(a.id,b);}
 const weight=spec.typography?.weight||400,style=spec.typography?.italic?'italic':'normal';
 // Each subset uses the same family and declared codepoint coverage; no system fallback.
 const faces=fonts.map(f=>{const range=[...new Set(f.font.characterSet)].map(c=>'U+'+c.toString(16)).join(',');return `@font-face{font-family:ComposerFont;src:url(data:font/woff2;base64,${f.bytes.toString('base64')}) format('woff2');font-weight:${weight};font-style:${style};font-display:block;unicode-range:${range};}`}).join('');
 const ink=spec.ink||'#FFF9F0',dark=ink!=='#FFF9F0',contrast=spec.contrast||0;
 const baseSizes={label:32,headline:layout.preset.endsWith('hook')?96:72,supporting_copy:40,cta:36},minSizes={label:28,headline:56,supporting_copy:32,cta:30};
 Object.assign(baseSizes,spec.typography?.sizes||{});
 const layers=layout.layers.map(l=>{
  const pos=`position:absolute;left:${l.x}px;top:${l.y}px;width:${l.width}px;height:${l.height}px;z-index:${l.z};`;
  if(l.asset_id)return `<img data-layer="${l.name}" src="${data(buffers.get(l.asset_id))}" style="${pos}object-fit:contain;filter:drop-shadow(0 8px 12px #0004)">`;
  return `<div data-layer="${l.name}" class="copy" data-min="${minSizes[l.name]}" style="${pos}font-size:${baseSizes[l.name]}px;text-align:${l.align};${l.name==='cta'?`border:${spec.cta_style==='text'?0:1}px solid ${ink};border-radius:2px;padding:12px;${spec.cta_style==='solid'?`background:${dark?'#fff':'#142C35'};`:''}`:''}"><span>${escape(spec[l.name])}</span></div>`;
 }).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>${faces}*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1080px;overflow:hidden}body{font-family:ComposerFont;font-weight:${weight};font-style:${style};font-synthesis:none;color:${ink}}.copy{opacity:${spec.typography?.opacity??1};text-shadow:${spec.typography?.shadow?'0 2px 4px #0004':'none'};display:flex;align-items:center;justify-content:center;line-height:${spec.typography?.line_height||1.12};letter-spacing:${spec.typography?.letter_spacing||0}px;white-space:pre-wrap;overflow-wrap:normal}.copy span{display:block;width:100%}</style></head><body><img id="background" src="${data(buffers.get(spec.background_id))}" style="position:absolute;inset:0;width:1080px;height:1080px"><div id="contrast" style="position:absolute;inset:0;background:${dark?'#fff':'#000'};opacity:${contrast}"></div>${layers}</body></html>`;
 const browser=await playwright.launch({headless:true,executablePath:await browserPath(),args:chromium.args.filter(a=>a!=='--single-process')});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:1080},deviceScaleFactor:1,locale:'en-GB',timezoneId:'UTC',colorScheme:'light',reducedMotion:'reduce'});page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(45000);await page.route('**/*',route=>route.abort());await page.setContent(html,{waitUntil:'load'});await page.evaluate(async()=>{await Promise.race([Promise.all([...document.fonts].map(f=>f.load())),new Promise((_,reject)=>setTimeout(()=>reject(Error('Font load timed out')),30000))]);await document.fonts.ready;if([...document.fonts].some(f=>f.status!=='loaded'))throw Error('Selected font did not load');await Promise.all([...document.images].map(i=>i.decode()));});
  const measured=await page.evaluate(()=>[...document.querySelectorAll('.copy')].map(el=>{
   const span=el.firstElementChild,min=Number(el.dataset.min);let size=parseFloat(getComputedStyle(el).fontSize);
   while(size>min&&(span.scrollWidth>el.clientWidth||span.getBoundingClientRect().height>el.clientHeight)){size--;el.style.fontSize=size+'px';}
   const r=el.getBoundingClientRect(),s=span.getBoundingClientRect(),style=getComputedStyle(el);
   return {name:el.dataset.layer,text:span.textContent,font_size:size,font_family:style.fontFamily,x:r.x,y:r.y,width:r.width,height:r.height,overflow:s.height<=0||s.width<=0||span.scrollWidth>el.clientWidth+0.1||s.height>el.clientHeight+0.1};
  }));
  assert(measured.every(x=>!x.overflow),'Copy overflow: shorten the supplied text or choose another preset');assert(measured.every(x=>x.text===spec[x.name]),'Exact copy mismatch');assert(new Set(measured.map(x=>x.font_family)).size===1,'Mixed font families');
  const png=await sharp(await page.screenshot({type:'png',animations:'disabled'})).png({compressionLevel:9,adaptiveFiltering:false}).toBuffer();const meta=await sharp(png).metadata();assert(meta.width===1080&&meta.height===1080,'Invalid output dimensions');
  const visiblePixels=await sharp(png).removeAlpha().raw().toBuffer();await page.addStyleTag({content:'.copy{visibility:hidden!important}'});const barePixels=await sharp(await page.screenshot({type:'png'})).removeAlpha().raw().toBuffer();const inkRGB=ink.slice(1).match(/../g).map(x=>parseInt(x,16));const lum=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);const inkLum=lum(inkRGB);const contrastResults=[];for(const l of measured){const ratios=[];for(let y=Math.ceil(l.y);y<Math.floor(l.y+l.height);y++)for(let x=Math.ceil(l.x);x<Math.floor(l.x+l.width);x++){const i=(y*1080+x)*3;if(Math.max(...[0,1,2].map(c=>Math.abs(visiblePixels[i+c]-barePixels[i+c])))>40){const bgLum=lum([...barePixels.slice(i,i+3)]);ratios.push((Math.max(inkLum,bgLum)+.05)/(Math.min(inkLum,bgLum)+.05));}}assert(ratios.length>20,'Text is not visibly rendered');ratios.sort((a,b)=>a-b);const ratio=ratios[Math.floor(ratios.length*.1)];assert(ratio>=3,'Text contrast is too low: request stronger contrast treatment or different ink');contrastResults.push({name:l.name,contrast:Math.round(ratio*100)/100,visible_pixels:ratios.length});}
  const renderer={version:VERSION,browser:browser.version(),fonts:fonts.map(f=>({file:f.name,checksum:f.checksum})),layout_checksum:sha(canonical(layout)),platform:process.platform,sharp:sharp.versions.sharp};
  return {png,checksum:sha(png),layout:{...layout,layers:layout.layers.map(l=>({...l,...measured.find(x=>x.name===l.name)}))},renderer,validation:{valid:true,exact_text:true,font_families:1,font_loaded:true,visible_text:contrastResults,overflow:false,width:1080,height:1080,page_contain:true,asset_checksums:true,visual_review_required:true,protected_zones_checked:true}};
 }finally{await browser.close();}
}
