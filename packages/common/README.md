# @philter/common

This package provides code shared among multiple packages. It provides the following subpackages:

- @philter/common
- @philter/common/kol

## @philter/common

This subpackage provides _universal_ code; that is, code that can be executed in KoLmafia, the browser (relay UI), and in Node.js (build scripts). As such, this must satisfy the following rules:

- No use of KoLmafia-specific APIs (e.g. `Item`, `print()`)
  - No use of external ASH scripts (e.g. ZLib)
- No use of APIs unavailable in KoLmafia (e.g. `console`, `async`/`await`)
- No use of browser-specific APIs (e.g. `document`, `window`)
- No use of Node.js-specific APIs (e.g. `fs`, `path`)
- Must support Node.js' native ESM mode
  - Always use `.js` extension when importing modules, even in TypeScript

## @philter/common/kol

This subpackage provides KoLmafia-specific code that can be shared between multiple packages. As such, this must satisfy the following rules:

- No use of APIs unavailable in KoLmafia
- KoLmafia built-ins and the standard library are allowed
- ASH scripts (e.g. ZLib) are allowed, but they must be added to [`release/dependencies.txt`](../../release/dependencies.txt)

This subpackage may import code from @philter/common, but not vice versa.

Note: When importing this package, make sure to add the following to your Rollup config:

```js
{
  external: ["philter.util.ash"],
  // ...
  treeshake: {
    moduleSideEffects: id => id !== 'philter.util.ash',
  }
}
```
