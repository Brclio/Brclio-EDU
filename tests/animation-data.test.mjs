import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const data=JSON.parse(fs.readFileSync(new URL('./animation-data-audit.json',import.meta.url)));
const pixels=JSON.parse(fs.readFileSync(new URL('./animation-rendering-audit.json',import.meta.url)));
const publicRoot=new URL('../public/',import.meta.url);
test('every animation export matches its corresponding source frame, including nested graphics',()=>{
 assert.equal(data.summary.animations,163);assert.equal(data.summary.frames,964);
 assert.deepEqual(data.errors,[]);assert.deepEqual(data.unresolved_image_dependencies,[]);
 for(const animation of data.animations){
  for(const frame of animation.frames){
   const bytes=fs.readFileSync(new URL('.'+frame.actual_path,publicRoot));
   const digest=createHash('sha256').update(bytes).digest('hex');
   assert.equal(digest,frame.expected_sha256,`${animation.page}/${animation.animation_id}/${frame.index} changed its visual source`);
  }
 }
});
test('the browser renders all source frames without blank images or collapsed differing scenes',()=>{
 assert.equal(pixels.frames.length,964);assert.equal(pixels.summary.render_errors,0);assert.equal(pixels.summary.blank_frames,0);
 assert.deepEqual(pixels.review_required,[]);
});
test('004-117 changes the book graphics across all five steps, excluding captions',()=>{
 const frames=pixels.frames.filter(f=>f.page==='004-117');
 assert.equal(frames.length,5);assert.equal(new Set(frames.map(f=>f.graphic_crop_sha256)).size,5);
 for(const frame of frames)assert.ok(frame.nonwhite_bbox);
});
