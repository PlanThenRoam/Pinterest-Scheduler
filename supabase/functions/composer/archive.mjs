// Deterministic ZIP STORE and complete PNG framing checks.
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const x of bytes)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function inspectPng(bytes){
 if(bytes.length<45||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('Invalid or incomplete PNG');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let p=8,info=null,idat=false,ended=false;
 while(p+12<=bytes.length){const n=d.getUint32(p),type=String.fromCharCode(...bytes.subarray(p+4,p+8));if(n>bytes.length-p-12)throw Error('Truncated PNG chunk');
  if(crc32(bytes.subarray(p+4,p+8+n))!==d.getUint32(p+8+n))throw Error('PNG chunk checksum mismatch');
  if(!info){if(type!=='IHDR'||n!==13)throw Error('Missing PNG header');info={width:d.getUint32(p+8),height:d.getUint32(p+12)};if(!info.width||!info.height||info.width*info.height>20000000)throw Error('PNG dimensions exceed limits');}
  if(type==='IDAT')idat=true;p+=n+12;if(type==='IEND'){if(n!==0||p!==bytes.length||!idat)throw Error('Invalid PNG end');ended=true;break;}
 }
 if(!ended)throw Error('Incomplete PNG: missing end chunk');return info;
}
export function zipPngs(files,{expectedCount=5}={}){
 if(files.length!==expectedCount||expectedCount<1||expectedCount>20)throw Error(expectedCount===5?'A campaign export requires five PNGs':'Campaign export count mismatch');
 const encoder=new TextEncoder(),parts=[],central=[];let offset=0;const names=new Set();
 for(const f of files){if(!/^[A-Za-z0-9_-]+\.png$/.test(f.name)||names.has(f.name))throw Error('Unsafe or duplicate export filename');names.add(f.name);inspectPng(f.bytes);const name=encoder.encode(f.name),crc=crc32(f.bytes),size=f.bytes.length;
  const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,name.length,true);local.set(name,30);
  const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,size,true);w.setUint32(24,size,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);parts.push(local,f.bytes);central.push(c);offset+=local.length+size;
 }
 const centralSize=central.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+centralSize+22);let pos=0;for(const p of [...parts,...central,end]){result.set(p,pos);pos+=p.length;}return result;
}
