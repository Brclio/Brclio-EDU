import Prism from 'prismjs';
import 'prismjs/components/prism-python';
/** Original article renderer highlights fenced examples with its Python Prism grammar. */
export default function ArticleMarkdownCode({children}:{children:any}) {
  const source=String(children).replace(/\n$/,'');
  return <div className="article-markdown-code"><pre className="language-python"><code className="language-python" dangerouslySetInnerHTML={{__html:Prism.highlight(source,Prism.languages.python,'python')}}/></pre></div>;
}
