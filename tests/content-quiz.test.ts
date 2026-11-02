import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { quizBlankKeys, quizExpectedBlank, normalizeQuizAnswer, shuffledQuizOrder, validQuizOrder, codeNeedsInput } from '../src/content-model';

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
test('sorting exercise starts shuffled and never at its answer, including reversed source metadata', () => {
 const options=[{text:'second',match_number:2},{text:'first',match_number:1}];
 assert.deepEqual(shuffledQuizOrder(options,true,()=>0),[0,1]);
 assert.deepEqual(shuffledQuizOrder(options,true,()=>.99),[0,1]);
 assert.deepEqual(shuffledQuizOrder([{text:'only',match_number:1}],true,()=>0),[0]);
});
test('corrupt saved order cannot duplicate or reference missing choices', () => {
 assert.equal(validQuizOrder([1,0],2),true);
 for(const value of [[0,0],[-1,0],[0,2],['0',1],[],null])assert.equal(validQuizOrder(value,2),false);
});
test('workspace detects common course stdin calls and ignores commented examples', () => {
 assert.equal(codeNeedsInput('python','name = input("姓名")'),true);
 assert.equal(codeNeedsInput('cpp','cin >> n;'),true);
 assert.equal(codeNeedsInput('java','new Scanner(System.in)'),true);
 assert.equal(codeNeedsInput('go','fmt.Scanln(&a)'),true);
 assert.equal(codeNeedsInput('python','# input("example")\nprint(42)'),false);
 assert.equal(codeNeedsInput('cpp','// cin >> n;\ncout << 42;'),false);
});
