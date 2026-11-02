import articleKatex from 'katex-article';
import soloKatex from 'katex-solo';
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic';
import { toText } from 'hast-util-to-text';
import { SKIP, visitParents } from 'unist-util-visit-parents';

/** The two published course readers use KaTeX 0.15.3 and 0.15.6 respectively. */
export default function rehypeCourseKatex({ mode }: { mode: 'article' | 'solo' }) {
  const renderer = mode === 'article' ? articleKatex : soloKatex;
  return (tree: any) => {
    visitParents(tree, 'element', (element: any, parents: any[]) => {
      const classes = element.properties?.className || [];
      if (!classes.some((name: string) => ['language-math', 'math-display', 'math-inline'].includes(name))) return;
      let parent = parents[parents.length - 1], scope = element;
      let displayMode = classes.includes('math-display');
      if (element.tagName === 'code' && classes.includes('language-math') && parent?.tagName === 'pre') {
        scope = parent; parent = parents[parents.length - 2]; displayMode = true;
      }
      if (!parent) return;
      const value = toText(scope, { whitespace: 'pre' });
      const html = renderer.renderToString(value, { displayMode, trust: false, strict: 'ignore', throwOnError: false });
      parent.children.splice(parent.children.indexOf(scope), 1, ...fromHtmlIsomorphic(html, { fragment: true }).children);
      return SKIP;
    });
  };
}
