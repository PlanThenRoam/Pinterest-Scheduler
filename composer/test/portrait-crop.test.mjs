import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {portraitAsset,digest} from '../portrait-assets.mjs';

test('portrait crop removes side columns, preserves proportions and produces deterministic 1000x1500 PNGs',async()=>{
 const source=await sharp({create:{width:1080,height:1080,channels:3,background:'#00ff00'}}).composite([{input:Buffer.from('<svg width="1080" height="1080"><path fill="#f00" d="M0 0h180v1080H0z"/><path fill="#00f" d="M900 0h180v1080H900z"/></svg>')}]).png().toBuffer();
 const original=digest(source),a=await portraitAsset(source),b=await portraitAsset(source);
 assert.equal(a.width,1000);assert.equal(a.height,1500);assert.equal(a.checksum,b.checksum);assert.equal(digest(source),original);
 assert.deepEqual(a.crop,{left:180,top:0,width:720,height:1080});
 const raw=await sharp(a.png).removeAlpha().raw().toBuffer();assert.ok(raw.every((v,i)=>v===(i%3===1?255:0)));
 const left=await portraitAsset(source,{left:0,top:0,width:720,height:1080});assert.notEqual(left.checksum,a.checksum);
});

test('portrait crop rejects invalid ratios, out-of-bounds rectangles and incorrect source dimensions',async()=>{
 const source=await sharp({create:{width:1080,height:1080,channels:3,background:'#fff'}}).png().toBuffer();
 for(const crop of [{left:-1},{left:361},{width:1000},{width:0,height:0},{top:1},{left:1.5}])await assert.rejects(portraitAsset(source,crop),/Invalid 2:3 crop/);
 await assert.rejects(portraitAsset(await sharp(source).resize(1000,1500).png().toBuffer()),/1080 square/);
 await assert.rejects(portraitAsset(source.subarray(0,source.length-12)),/Incomplete/);
});
