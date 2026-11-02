import assert from 'node:assert/strict';
export const editorLocator = root => root.locator('.edu-source-editor').first();
export async function readCode(root) {
 const editor=editorLocator(root);await editor.locator('[role="textbox"],textarea').first().waitFor({state:'attached'});
 await root.page().waitForFunction(e=>Boolean(e.eduEditor),await editor.elementHandle());
 return editor.evaluate(e=>e.eduEditor.getValue());
}
export async function replaceCode(root,value) {
 const editor=editorLocator(root);await readCode(root);await editor.evaluate(e=>e.eduEditor.focus());
 await root.page().keyboard.press(process.platform==='darwin'?'Meta+A':'Control+A');
 await root.page().context().grantPermissions(['clipboard-read','clipboard-write']);
 await root.page().evaluate(text=>navigator.clipboard.writeText(text),value);
 await root.page().keyboard.press(process.platform==='darwin'?'Meta+V':'Control+V');
 await root.page().waitForFunction(({element,text})=>element.eduEditor.getValue()===text,{element:await editor.elementHandle(),text:value});
 assert.equal(await readCode(root),value);
}
export async function editorReadOnly(root) {
 await readCode(root);return editorLocator(root).evaluate(e=>e.dataset.editorEngine==='monaco'?e.eduEditor.getRawOptions().readOnly:e.eduEditor.getOption('readOnly'));
}
