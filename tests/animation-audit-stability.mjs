import fs from 'node:fs/promises';
export const animationSourceFiles=['src/Content.tsx','src/ArticleAnimation.tsx','src/CourseSvg.tsx','src/SourceIcon.tsx','src/article.css','src/article-fidelity.css','src/content.css','src/styles.css'];
export function animationStability(report){
 const before=report.sourceFilesBefore||{},after=report.sourceFilesAfter||{};
 const missing=animationSourceFiles.filter(name=>!before[name]||!after[name]);
 const changed=animationSourceFiles.filter(name=>before[name]!==after[name]);
 return {trackedFiles:animationSourceFiles,missing,changed,unchanged:missing.length===0&&changed.length===0,note:'Derived from the actual before/after file snapshots captured during this execution. Content.tsx is conservatively checked in full, so its CanvasAnimation dispatch is included. The separate all-src changedFiles and sourceUnchanged values remain unchanged.'};
}
if(process.argv[1]?.endsWith('/animation-audit-stability.mjs')){
 const file=process.argv[2]||'tests/animation-interaction-full-audit.json',report=JSON.parse(await fs.readFile(file,'utf8'));
 report.animationSourceStability=animationStability(report);
 report.summary.animationSourcesUnchanged=report.animationSourceStability.unchanged;
 await fs.writeFile(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.animationSourceStability,null,2));
 if(!report.animationSourceStability.unchanged||report.summary.errors||report.summary.externalRequests)process.exitCode=1;
}
