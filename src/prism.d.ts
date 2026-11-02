declare module 'prismjs' {
  const Prism: {
    languages: Record<string, object>;
    highlight(source: string, grammar: object, language: string): string;
  };
  export default Prism;
}
declare module 'prismjs/components/*';
