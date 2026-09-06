import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../video-renderer.html',import.meta.url),'utf8');
const optionalPositive=source.match(/const optionalPositive = .*?;\n/)?.[0];
const sceneTimingAt=source.match(/function sceneTimingAt\(t\)\{.*?\}\n/)?.[0];
assert.ok(optionalPositive&&sceneTimingAt,'timeline functions must remain available');
const context={state:{duration:18,scenes:Array.from({length:6},()=>({duration:null}))},Math};
vm.createContext(context);
vm.runInContext(`const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));${optionalPositive}${sceneTimingAt};this.result=[sceneTimingAt(.7),sceneTimingAt(3.2),sceneTimingAt(15.2)];`,context);
assert.equal(context.result[0].idx,0,'0.7s must remain in scene 1');
assert.equal(context.result[1].idx,1,'3.2s must be scene 2');
assert.equal(context.result[2].idx,5,'15.2s must be scene 6');
context.state.scenes.forEach(scene=>scene.duration=.1);
vm.runInContext('this.legacyExplicit=sceneTimingAt(.7)',context);
assert.equal(context.legacyExplicit.idx,5,'the regression fixture must reproduce the former 0.1s collapse');
console.log('renderer duration regression: passed');
