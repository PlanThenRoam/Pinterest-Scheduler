const requireValue=(v,message)=>{if(!v)throw Error(message);};
export function promotionStage(p,publicationAt){
 requireValue(p?.timezone,'BUSINESS_TIMEZONE_REQUIRED');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:p.timezone}).format(new Date());}catch{throw Error('INVALID_BUSINESS_TIMEZONE');}
 const at=Date.parse(publicationAt),start=Date.parse(p.starts_at),end=Date.parse(p.ends_at);
 requireValue([at,start,end].every(Number.isFinite)&&end>start,'INVALID_PROMOTION_TIMESTAMPS');
 return at<start?'advance':at<end?'active':'expired';
}
export function validatePromotion(brief,promotions,{now=new Date().toISOString(),reuse=false,plan=null}={}){
 const issues=[],requirements=[],snapshots=[];
 const date=Date.parse(brief.publication_at);
 if(!Number.isFinite(date))return {valid:false,issues:[{code:'PUBLICATION_DATE_REQUIRED',output:'campaign'}],requirements,snapshots};
 const applicable=promotions.filter(p=>p.planner_ids.includes(brief.planner_id)&&p.enabled!==false);
 for(const p of applicable){
  const stage=promotionStage(p,brief.publication_at),currentStage=promotionStage(p,now);
  const relevant=brief.promotion_id===p.id||stage==='active'||(stage==='advance'&&date>=Date.parse(p.announce_from||p.starts_at));
  if(!relevant)continue;
  snapshots.push({id:p.id,revision:p.revision,stage,timezone:p.timezone,starts_at:p.starts_at,ends_at:p.ends_at,discount_percent:p.discount_percent,confirmation_status:p.confirmation_status,enforced:brief.outputs.some(o=>(o.format==='pinterest'?o.promotion_mode:brief.promotion_mode)==='promotion')});
  for(const o of brief.outputs){
   const mode=o.format==='pinterest'?o.promotion_mode:brief.promotion_mode;
   if(mode==='evergreen'){
    if(o.format==='pinterest'){if(/\b\d+%|\bdiscount\b|\boff\b|\bsale\b/i.test([o.headline,o.supporting_copy,o.cta].join(' ')))issues.push({code:'EVERGREEN_CONTAINS_PROMOTION',output:o.key});continue;}
    if(relevant&&stage!=='expired')issues.push({code:'PROMOTION_REQUIRED',output:o.key,message:'The campaign plan requires this offer. Explicit evergreen selection applies to independent pins.'});continue;
   }
   const required=o.role==='cover_cta'||o.role==='pin'||p.required_roles?.includes(o.role);
   if(!required)continue;
   if(stage==='expired'||(reuse&&currentStage==='expired')){issues.push({code:'PROMOTION_EXPIRED_STALE',output:o.key,promotion_id:p.id,ended_at:p.ends_at,timezone:p.timezone});continue;}
   const wording=p.approved_wording?.[stage],copy=[o.headline,o.supporting_copy,o.cta].filter(Boolean).join('\n'),correction=wording||{discount_percent:p.discount_percent,date_wording:p.date_wording,wording_status:'pending approval'};
   if(!copy.includes(p.discount_percent+'%'))issues.push({code:'PROMOTION_DISCOUNT_MISSING',output:o.key,required_correction:correction});
   if(!copy.includes(p.date_wording))issues.push({code:'PROMOTION_DATES_MISSING',output:o.key,required_correction:correction});
   if(p.confirmation_status!=='confirmed'||!wording){issues.push({code:'PROMOTION_WORDING_UNCONFIRMED',output:o.key,promotion_id:p.id,stage,required_correction:{discount_percent:p.discount_percent,dates:p.date_wording,wording_status:'Owner-approved '+stage+' wording must be saved centrally.'}});continue;}
   requirements.push({output:o.key,promotion_id:p.id,stage,approved_wording:wording,discount_percent:p.discount_percent,date_wording:p.date_wording});
   if(!copy.includes(wording))issues.push({code:'PROMOTION_WORDING_MISMATCH',output:o.key,stage,required_correction:wording});
  }
 }
 if(!snapshots.length){const affected=brief.outputs.filter(o=>o.format==='pinterest'?o.promotion_mode==='promotion':o.role==='cover_cta'&&(brief.promotion_mode==='promotion'||plan?.promotion_required));for(const o of affected)issues.push({code:'PROMOTION_NOT_FOUND',output:o.key,planner_id:brief.planner_id});}
 return {valid:issues.length===0,issues,requirements,snapshots,checked_at:now,publication_at:brief.publication_at,copy_rewritten:false};
}
export function assertPromotion(result){if(!result.valid){const e=Error(result.issues.map(x=>x.code+': '+x.output).join('; '));e.validation=result;throw e;}return result;}
export function validatePromotionRecord(p){
 requireValue(Array.isArray(p.planner_ids)&&p.planner_ids.length>0,'Promotion needs planner IDs');
 requireValue(Number.isFinite(p.discount_percent)&&p.discount_percent>0&&p.discount_percent<100,'Invalid discount percentage');
 promotionStage(p,p.starts_at);
 requireValue(typeof p.date_wording==='string'&&p.date_wording.trim(),'Exact date wording is required');
 requireValue(['pending_wording','confirmed','withdrawn'].includes(p.confirmation_status),'Invalid promotion confirmation status');
 if(p.confirmation_status==='confirmed')for(const stage of ['advance','active']){
  const text=p.approved_wording?.[stage];requireValue(typeof text==='string'&&text.includes(p.discount_percent+'%')&&text.includes(p.date_wording),'Approved '+stage+' wording must include exact discount and dates');
  requireValue(!/\u2014|ends tonight|countdown/i.test(text),'Unsupported invented urgency or em dash');
 }
 return p;
}
