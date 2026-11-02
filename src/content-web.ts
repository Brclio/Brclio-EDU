import {transformNativeDialogs} from './native-dialog-transform.ts';
// Only the executable preview is adapted; the original editable lesson source
// stays intact. Native dialogs are bridged by the trusted parent when configured.
export function adaptDialogCalls(source: string) {
  let result = '', offset = 0, adapted = false;
  while (offset < source.length) {
    const char = source[offset];
    if (char === '"' || char === "'" || char === '`') {
      const start = offset++;
      while (offset < source.length) { if (source[offset] === '\\') offset += 2; else if (source[offset++] === char) break; }
      result += source.slice(start, offset); continue;
    }
    if (source.startsWith('//', offset) || source.startsWith('/*', offset)) {
      const start = offset;
      const end = source.startsWith('//', offset) ? source.indexOf('\n', offset + 2) : source.indexOf('*/', offset + 2);
      offset = end < 0 ? source.length : end + (source.startsWith('//', start) ? 0 : 2);
      result += source.slice(start, offset); continue;
    }
    const match = source.slice(offset).match(/^(prompt|confirm)\s*\(/);
    if (match && !/[\w$.]/.test(source[offset - 1] || '')) {
      result += `await window.__eduDialog.${match[1]}(`;
      offset += match[0].length; adapted = true; continue;
    }
    result += char; offset++;
  }
  return adapted ? `(async function(){\n${result}\n})().catch(error => console.error(error.message));` : source;
}

const bootstrap = String.raw`
(() => {
 let queue = Promise.resolve();
 const show = (kind, message, value) => {
  const task = queue.then(() => new Promise(resolve => {
   const dialog = document.createElement('dialog');
   dialog.setAttribute('aria-label', kind === 'prompt' ? '输入对话框' : kind === 'confirm' ? '确认对话框' : '提示对话框');
   dialog.style.cssText='max-width:calc(100% - 40px);width:340px;border:1px solid #ddd9ff;border-radius:9px;padding:20px;font:14px/1.6 system-ui;color:#333;box-shadow:0 12px 40px #0002';
   const text = document.createElement('p');text.textContent=String(message ?? '');text.style.whiteSpace='pre-wrap';dialog.append(text);
   const field = document.createElement('input');
   if(kind === 'prompt'){field.value=String(value ?? '');field.setAttribute('aria-label',String(message ?? '输入'));field.style.cssText='box-sizing:border-box;width:100%;padding:8px;border:1px solid #bbb5f2;border-radius:4px;margin-bottom:15px';dialog.append(field);}
   const bar=document.createElement('div');bar.style.cssText='display:flex;gap:10px;justify-content:flex-end';dialog.append(bar);
   const finish = accepted => {dialog.close();dialog.remove();resolve(kind==='prompt'?(accepted?field.value:null):kind==='confirm'?accepted:undefined);};
   const button = (label, accepted) => {const el=document.createElement('button');el.type='button';el.textContent=label;el.style.cssText='padding:7px 16px;background:#5851ff;color:#fff;border:0;border-radius:4px;cursor:pointer';el.onclick=()=>finish(accepted);bar.append(el);return el;};
   if(kind !== 'alert')button('取消',false);const ok=button('确定',true);
   dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
   field.addEventListener('keydown',event=>{if(event.key==='Enter')finish(true);});
   (document.body||document.documentElement).append(dialog);dialog.showModal();(kind==='prompt'?field:ok).focus();
  }));
  queue=task.catch(()=>{});return task;
 };
 window.__eduDialog={prompt:(message,value)=>show('prompt',message,value),confirm:message=>show('confirm',message)};
 window.alert=message=>{show('alert',message);};
 const print = (args, error=false, method='log') => {
  if(window.__eduConsoleChannel){const text=args.map(value=>{try{return typeof value==='string'?value:(JSON.stringify(value)??String(value));}catch{return String(value);}});window.parent.postMessage({__eduPreviewConsole:window.__eduConsoleChannel,method:error?'error':method,data:text},'*');return;}
  const write=()=>{let output=document.getElementById('__edu-console');if(!output){output=document.createElement('pre');output.id='__edu-console';output.setAttribute('aria-label','JavaScript 控制台');output.style.cssText='white-space:pre-wrap;word-break:break-word;padding:12px;border-top:1px solid #e4e5ee;background:#f8f9fb;font:13px/1.7 monospace';document.body.append(output);}const line=document.createElement('div');line.textContent=args.map(value=>typeof value==='string'?value:(JSON.stringify(value)??String(value))).join(' ');if(error)line.style.color='#bd4047';output.append(line);};
  if(document.body)write();else document.addEventListener('DOMContentLoaded',write,{once:true});
 };
 for(const key of ['log','info','warn','error']){const original=console[key];console[key]=(...args)=>{original.apply(console,args);print(args,key==='error',key);};}
 window.addEventListener('error',event=>print([event.message],true));
 window.addEventListener('unhandledrejection',event=>print([String(event.reason)],true));
})();`;
const nativeDialogBootstrap = String.raw`
(() => {
 const channel=window.__eduNativeDialogChannel,pending=new Map();let id=0,queue=Promise.resolve();
 window.addEventListener('message',event=>{const data=event.data;if(event.source!==window.parent||data?.__eduPreviewDialogResponse!==channel||!pending.has(data.id))return;const resolve=pending.get(data.id);pending.delete(data.id);resolve(data.value);});
 const show=(kind,message,value)=>{const task=queue.then(()=>new Promise(resolve=>{const requestId=++id;pending.set(requestId,resolve);window.parent.postMessage({__eduPreviewDialog:channel,id:requestId,kind,message:message===undefined?'':String(message),value:value===undefined?'':String(value)},'*');}));queue=task.catch(()=>{});return task;};
 window.__eduDialog={alert:message=>show('alert',message),prompt:(message,value)=>show('prompt',message,value),confirm:message=>show('confirm',message)};
 window.alert=window.__eduDialog.alert;window.prompt=window.__eduDialog.prompt;window.confirm=window.__eduDialog.confirm;
 const replaying=new WeakSet();
 window.__eduHandleEvent=(event,element,handler)=>{if(replaying.has(element))return true;event.preventDefault();Promise.resolve(handler.call(element,event)).then(result=>{if(result===false)return;if(event.type==='submit'&&element instanceof HTMLFormElement){setTimeout(()=>{replaying.add(element);try{element.requestSubmit(event.submitter||undefined)}finally{replaying.delete(element)}},0)}else if(event.type==='click'){if(element instanceof HTMLAnchorElement)window.location.href=element.href;else if(element.form&&element.type==='submit')element.form.requestSubmit(element)}}).catch(error=>console.error(error.message));return false;};
})();`;
const script = (value: string) => `<script>${value.replace(/<\/script/gi, '<\\/script')}</script>`;
const decodeAttribute = (value:string) => value.replace(/&(?:quot|apos|lt|gt|amp|#(\d+)|#x([\da-f]+));/gi,(match,decimal,hex)=>decimal||hex?String.fromCodePoint(parseInt(decimal||hex,decimal?10:16)):({'&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&amp;':'&'}[match.toLowerCase()]||match));
export function webPreviewDocument(html: string, css: string, js: string, hiddenJS = '', options: { consoleChannel?: string; nativeDialogChannel?:string } = {}) {
  let executableHTML=html,executableJS=js,executableHidden=hiddenJS;
  if(options.nativeDialogChannel){
    const inline:Array<{match:string;attributes:string;source:string}>=[];
    html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(match,attributes,source)=>{if(!/\bsrc\s*=/.test(attributes)&&(!/\btype\s*=/.test(attributes)||/\btype\s*=\s*["']?(?:text|application)\/(?:javascript|ecmascript)/i.test(attributes)))inline.push({match,attributes,source});return match});
    const sources=[...inline.map(item=>item.source),js,hiddenJS];let names:string[]=[],compiled=sources.map(source=>transformNativeDialogs(source));
    for(let pass=0;pass<=sources.length;pass++){const next=[...new Set([...names,...compiled.flatMap(result=>result.asyncNames)])];if(pass&&next.length===names.length)break;names=next;compiled=sources.map(source=>transformNativeDialogs(source,names));}
    if(compiled.some(result=>result.code.includes('window.__eduScriptQueue=')))compiled=sources.map(source=>transformNativeDialogs(source,names,true));
    inline.forEach((item,index)=>{executableHTML=executableHTML.replace(item.match,`<script${item.attributes}>${compiled[index].code.replace(/<\/script/gi,'<\\/script')}</script>`)});
    executableJS=compiled[inline.length].code;executableHidden=compiled[inline.length+1].code;
    executableHTML=executableHTML.replace(/\s(on[a-z]+)\s*=\s*(["'])([\s\S]*?)\2/gi,(match,event,quote,value)=>{const callback=transformNativeDialogs(`(function(event){${decodeAttribute(value)}\n})`,names);if(!callback.adapted)return match;const code=`return window.__eduHandleEvent(event,this,${callback.code});`;return ` ${event}="${code.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;});
  }
  const head = script((options.consoleChannel ? `window.__eduConsoleChannel=${JSON.stringify(options.consoleChannel)};\n` : '') + bootstrap + (options.nativeDialogChannel ? `\nwindow.__eduNativeDialogChannel=${JSON.stringify(options.nativeDialogChannel)};\n${nativeDialogBootstrap}` : ''));
  const document = /<head(?:\s[^>]*)?>/i.test(executableHTML) ? executableHTML.replace(/<head(?:\s[^>]*)?>/i, value => value + head) : head + executableHTML;
  return document + `<style>${css.replace(/<\/style/gi,'<\\/style')}</style>` + script(options.nativeDialogChannel?executableJS:adaptDialogCalls(js)) + script(executableHidden);
}
