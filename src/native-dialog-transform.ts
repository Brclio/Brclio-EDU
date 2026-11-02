import {parse} from 'acorn';
type Node = any;
type Binding = {fn?:Node};
type Scope = {parent?:Scope;kind:'program'|'function'|'block';fn?:Node;bindings:Map<string,Binding>};
type Edit = {start:number;end:number;text:string};
const functionTypes=new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression']);
function names(pattern:Node):string[]{if(!pattern)return[];if(pattern.type==='Identifier')return[pattern.name];if(pattern.type==='RestElement')return names(pattern.argument);if(pattern.type==='AssignmentPattern')return names(pattern.left);if(pattern.type==='ArrayPattern')return pattern.elements.flatMap(names);if(pattern.type==='ObjectPattern')return pattern.properties.flatMap((p:Node)=>names(p.value||p.argument));return[]}

/** Adapt the execution copy of course examples, preserving comments and literals. */
export function transformNativeDialogs(source:string, externalAsyncNames:string[]=[], forceQueue=false){
  if(!source.trim())return {code:source,asyncNames:[] as string[],adapted:false};
  let ast:Node;
  try{ast=parse(source,{ecmaVersion:'latest',sourceType:'script',allowAwaitOutsideFunction:true})}catch{return {code:source,asyncNames:[] as string[],adapted:false}}
  const root:Scope={kind:'program',bindings:new Map()},scopes=new WeakMap<Node,Scope>(),parents=new WeakMap<Node,Node>(),functionScopes=new WeakMap<Node,Scope>(),calls:Node[]=[];
  const nearestFunction=(scope:Scope):Scope=>scope.kind==='block'?nearestFunction(scope.parent!):scope;
  const lookup=(scope:Scope,name:string):Binding|undefined=>scope.bindings.get(name)||(scope.parent&&lookup(scope.parent,name));
  function visit(node:Node,scope:Scope,parent?:Node){
    if(!node?.type)return;
    if(parent)parents.set(node,parent);
    if(node.type==='FunctionDeclaration'&&node.id)scope.bindings.set(node.id.name,{fn:node});
    if(node.type==='VariableDeclaration')for(const item of node.declarations){const target=node.kind==='var'?nearestFunction(scope):scope;for(const name of names(item.id))target.bindings.set(name,{fn:functionTypes.has(item.init?.type)?item.init:undefined})}
    if(node.type==='ClassDeclaration'&&node.id)scope.bindings.set(node.id.name,{});
    if(functionTypes.has(node.type)){
      const fnScope:Scope={parent:scope,kind:'function',fn:node,bindings:new Map()};functionScopes.set(node,fnScope);if(node.id)fnScope.bindings.set(node.id.name,{fn:node});for(const param of node.params)for(const name of names(param))fnScope.bindings.set(name,{});scope=fnScope;
    }else if(node.type==='BlockStatement'&&(!parent||!functionTypes.has(parent.type))||node.type==='CatchClause')scope={parent:scope,kind:'block',bindings:new Map()};
    scopes.set(node,scope);if(node.type==='CallExpression')calls.push(node);
    for(const [key,value]of Object.entries(node)){if(['start','end','type'].includes(key))continue;if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,scope,node)}else if(value&&typeof value==='object'&&(value as Node).type)visit(value,scope,node)}
  }
  visit(ast,root);
  const affected=new Set<Node>(),awaited=new Set<Node>(),dialogs=new Map<Node,string>();let topLevel=false;
  const mark=(call:Node)=>{awaited.add(call);const scope=nearestFunction(scopes.get(call)!);if(scope.fn)affected.add(scope.fn);else topLevel=true;};
  for(const call of calls){const callee=call.callee;let kind:string|undefined;
    if(callee.type==='Identifier'&&!lookup(scopes.get(call)!,callee.name)&&['alert','prompt','confirm'].includes(callee.name))kind=callee.name;
    if(callee.type==='MemberExpression'&&callee.object.type==='Identifier'&&['window','globalThis'].includes(callee.object.name)&&!lookup(scopes.get(call)!,callee.object.name)){const key=callee.computed?callee.property.value:callee.property.name;if(['alert','prompt','confirm'].includes(key))kind=key}
    if(kind){dialogs.set(call,kind);mark(call)}
  }
  let changed=true;while(changed){changed=false;for(const call of calls){if(awaited.has(call)||call.callee.type!=='Identifier')continue;const binding=lookup(scopes.get(call)!,call.callee.name);if(binding?.fn&&affected.has(binding.fn)||!binding&&externalAsyncNames.includes(call.callee.name)){mark(call);changed=true}}}
  if(!awaited.size&&!forceQueue)return {code:source,asyncNames:[] as string[],adapted:false};
  const edits:Edit[]=[];
  for(const [call,kind]of dialogs)edits.push({start:call.callee.start,end:call.callee.end,text:`window.__eduDialog.${kind}`});
  for(const call of awaited)if(parents.get(call)?.type!=='AwaitExpression'){edits.push({start:call.start,end:call.start,text:'(await '},{start:call.end,end:call.end,text:')'})}
  for(const fn of affected)if(!fn.async){const parent=parents.get(fn);if(parent?.type==='MethodDefinition'||parent?.type==='Property'&&parent.method){if(parent.kind==='constructor'||parent.kind==='get'||parent.kind==='set')throw Error('此类构造器或访问器不能在隔离预览中等待弹框。');edits.push({start:parent.start,end:parent.start,text:'async '})}else edits.push({start:fn.start,end:fn.start,text:'async '})}
  let code=source;for(const edit of edits.sort((a,b)=>b.start-a.start||b.end-a.end))code=code.slice(0,edit.start)+edit.text+code.slice(edit.end);
  if(topLevel||forceQueue){
    let globalName='__eduNativeGlobal';while(source.includes(globalName))globalName+='_';
    const expose=[...root.bindings.keys()].map(name=>`try{Object.defineProperty(${globalName},${JSON.stringify(name)},{configurable:true,enumerable:true,get:()=>${name},set:value=>{${name}=value}})}catch{}`).join('\n');
    code=`window.__eduScriptQueue=(window.__eduScriptQueue||Promise.resolve()).then(async function(){\nconst ${globalName}=window;\n${expose}\n${code}\n}).catch(error=>console.error(error.message));`;
  }
  return {code,asyncNames:[...root.bindings].filter(([,binding])=>binding.fn&&affected.has(binding.fn)).map(([name])=>name),adapted:true};
}
