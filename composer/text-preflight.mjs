// Measured in Chromium using the actual embedded selected font, before image work.
export async function measureText(page){
 return page.evaluate(()=>[...document.querySelectorAll('.copy')].map(el=>{
  const span=el.firstElementChild,text=span.textContent,min=Number(el.dataset.min),initial=parseFloat(getComputedStyle(el).fontSize);
  function inspect(){
   const style=getComputedStyle(el),r=el.getBoundingClientRect(),s=span.getBoundingClientRect(),width=el.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height=el.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),lines=[];
   const walker=document.createTreeWalker(span,NodeFilter.SHOW_TEXT),nodes=[];let node,offset=0;while(node=walker.nextNode()){nodes.push({node,start:offset,end:offset+node.length});offset+=node.length;}
   const point=index=>{const n=nodes.find(n=>index<=n.end);return [n.node,index-n.start];};
   for(const m of text.matchAll(/\S+/g)){const range=document.createRange();range.setStart(...point(m.index));range.setEnd(...point(m.index+m[0].length));const rect=range.getBoundingClientRect(),paragraph=text.slice(0,m.index).split('\n').length-1;let line=lines.find(l=>l.paragraph===paragraph&&Math.abs(l.y-rect.y)<1);if(!line){line={paragraph,y:rect.y,words:[],width:0,left:rect.x};lines.push(line);}line.words.push(m[0]);line.width=rect.right-line.left;}
   const orphans=[];for(const paragraph of new Set(lines.map(l=>l.paragraph))){const rows=lines.filter(l=>l.paragraph===paragraph),last=rows.at(-1),count=text.split('\n')[paragraph].trim().split(/\s+/).length;if(rows.length>1&&count>=3&&last.words.length===1)orphans.push({word:last.words[0],paragraph});}
   return {name:el.dataset.layer,text,font_size:parseFloat(style.fontSize),font_family:style.fontFamily,x:r.x,y:r.y,width:r.width,height:r.height,lines:lines.map(l=>({text:l.words.join(' '),width:Math.round(l.width*100)/100})),isolated_words:el.dataset.deliberateStack==='true'?[]:orphans,overflow:s.height<=0||s.width<=0||span.scrollWidth>width+0.5||s.height>height+0.5,wrap_mode:span.style.textWrap||'wrap'};
  }
  const original=inspect();let chosen=null;
  for(let size=initial;size>=min;size--){el.style.fontSize=size+'px';for(const mode of ['wrap','balance']){span.style.textWrap=mode;const trial=inspect();if(!trial.overflow&&!trial.isolated_words.length){chosen=trial;break;}}if(chosen)break;}
  if(!chosen){el.style.fontSize=min+'px';span.style.textWrap='balance';chosen=inspect();}
  return {...chosen,requested_font_size:initial,adjusted:chosen.font_size!==initial||chosen.wrap_mode!=='wrap',original_isolated_words:original.isolated_words,suggested_font_size:chosen.overflow||chosen.isolated_words.length?null:chosen.font_size};
 }));
}
