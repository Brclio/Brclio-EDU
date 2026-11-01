import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { adaptDialogCalls, webPreviewDocument } from '../src/content-web';
test('actual source prompt and confirm examples await custom sandbox dialogs', () => {
 assert.match(adaptDialogCalls('var n = prompt("Enter a number", "");\nvar answer = Math.sqrt(n);\nalert("The square root of " + n + " is " + answer);'),/var n = await window\.__eduDialog\.prompt/);
 assert.match(adaptDialogCalls('var result = confirm("离开？");'),/await window\.__eduDialog\.confirm/);
});
test('strings and comments mentioning dialogs retain original source', () => {
 const source='console.log("prompt(x)"); // confirm(x)\n/* prompt(x) */';
 assert.equal(adaptDialogCalls(source),source);
});
test('preview installs handlers before source inline scripts', () => {
 const result=webPreviewDocument('<html><head><script>alert("hello")</script></head><body></body></html>','','');
 assert.ok(result.indexOf('window.alert=')<result.indexOf('alert("hello")'));
 assert.match(result,/JavaScript 控制台/);
});
