import type { JSX as ReactJSX } from 'react';
// The source-compatible Markdown 8 type declarations predate React 19's
// namespaced JSX types. Keep their intrinsic-element map identical to React's.
declare global {
  namespace JSX {
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}
