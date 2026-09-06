import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../supabase/functions/seller-tools-inbox/index.ts',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../video-renderer.html',import.meta.url),'utf8');
assert.match(api,/sceneHeadline\(scene\)/,'preflight must resolve headline, heading and text consistently');
assert.match(api,/APP_VERSION = 23/);
assert.match(api,/API_CAPABILITY_VERSION = "2\.3\.0"/);
assert.doesNotMatch(renderer,/Export stopped because the page was hidden/);
assert.match(renderer,/if\(audioFile\)throw new Error\('Licensed local audio is not yet supported/);
assert.match(renderer,/sampledFrameQA\(canvas\)/);
assert.match(renderer,/approved:jsonCopy\(s\)/,'raw approved scene must remain attached without simplification');
console.log('manifest and lifecycle regression: passed');
