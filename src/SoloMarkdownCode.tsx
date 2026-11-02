import QuizCode from './QuizCode';
/** Preserve the original learn reader's pre/div/code structure and code theme. */
export default function SoloMarkdownCode({children,className}:{children:any;className?:string}) {
  return <pre className="solo-source-pre"><div><div className="solo-source-code"><QuizCode className={className || 'language-text'}>{children}</QuizCode></div></div></pre>;
}
