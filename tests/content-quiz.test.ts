import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { quizBlankKeys, quizExpectedBlank, normalizeQuizAnswer } from '../src/content-model';

function question(page: string, id: number) {
 const json = JSON.parse(readFileSync(`public/content/pages/${page}.json`, 'utf8'));
 function walk(value: any): any { if (!value || typeof value !== 'object') return; if (value.question_id === id && value.question_options) return value; for(const child of Object.values(value)){const found=walk(child);if(found)return found;} }
 return walk(json);
}
test('Python format braces remain code; output question has one input', () => {
 const q=question('015-969',126); assert.ok(q);
 assert.deepEqual(quizBlankKeys(q.question_type,q.question_text,q.question_options),['0']);
 assert.equal(quizExpectedBlank(q.question_type,q.question_options,0)[0].text,'abracadabra');
});
test('Go struct literal remains code; output answer is six', () => {
 const q=question('016-1001',236); assert.ok(q);
 assert.deepEqual(quizBlankKeys(q.question_type,q.question_text,q.question_options),['0']);
 assert.equal(normalizeQuizAnswer(quizExpectedBlank(q.question_type,q.question_options,0)[0].text),'6');
});
test('source matching positions sort nonconsecutive 1,2,4 into three blanks', () => {
 const q=question('025-1359',3112); assert.ok(q);
 const keys=quizBlankKeys(q.question_type,q.question_text,q.question_options);
 assert.deepEqual(keys,['0','1','2']);
 assert.deepEqual(keys.map((_,i)=>quizExpectedBlank(q.question_type,q.question_options,i)[0].text),['String','System','name']);
});
