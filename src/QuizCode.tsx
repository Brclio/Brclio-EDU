import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javadoclike';
import 'prismjs/components/prism-jsdoc';
import 'prismjs/components/prism-js-extras';
import 'prismjs/components/prism-css-extras';
import 'prismjs/components/prism-js-templates';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-swift';

/** Syntax colors and spacing used by the original quiz's Prism dark renderer. */
export default function QuizCode({children, className, ...rest}: any) {
  if (!className?.startsWith('language-')) return <code className={className} {...rest}>{children}</code>;
  const source = String(children).replace(/\n$/, '');
  const original = className.slice('language-'.length).toLowerCase();
  const language = ({py:'python', python3:'python', golang:'go', js:'javascript', nodejs:'javascript', html:'markup', html5:'markup', sh:'bash', shell:'bash', 'c++':'cpp', 'c#':'csharp'} as Record<string,string>)[original] || original;
  const grammar = Prism.languages[language];
  return <code className={`edu-quiz-source-code language-${language}`} {...rest}>{grammar ? <span dangerouslySetInnerHTML={{__html:Prism.highlight(source, grammar, language)}}/> : source}</code>;
}
