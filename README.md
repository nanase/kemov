# kemov

This is _Unofficial_ KemoV fan pages! 🐾

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur) + [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [TypeScript Vue Plugin (Volar)](https://marketplace.visualstudio.com/items?itemName=Vue.vscode-typescript-vue-plugin) to make the TypeScript language service aware of `.vue` types.

If the standalone TypeScript plugin doesn't feel fast enough to you, Volar has also implemented a [Take Over Mode](https://github.com/johnsoncodehk/volar/discussions/471#discussioncomment-1361669) that is more performant. You can enable it by the following steps:

1. Disable the built-in TypeScript Extension
   1. Run `Extensions: Show Built-in Extensions` from VSCode's command palette
   2. Find `TypeScript and JavaScript Language Features`, right click and select `Disable (Workspace)`
2. Reload the VSCode window by running `Developer: Reload Window` from the command palette.

## Customize configuration

See [Vite Configuration Reference](https://vitejs.dev/config/).

## Project Setup

`engines` forbids npm, so `npm install` fails by design. Use yarn.

The toolchain is pinned in two places: Node in `mise.toml`, and yarn in the `packageManager` field of `package.json`. With [mise](https://mise.jdx.dev/) the pinned Node is installed and selected for you:

```sh
mise install
```

Then install the dependencies:

```sh
yarn install --immutable
```

### Environment Variables

`.env` holds the values the published site is built with. To point the app somewhere else while developing, put the override in `.env.development.local`.

Do not use `.env.local` for this. Vite reads it in every mode, so a value left there also ends up in the production build and ships to visitors.

### Compile and Hot-Reload for Development

Default URL: http://localhost:5173/kemov/

```sh
yarn dev
```

### Type-Check, Compile and Minify for Production

```sh
yarn build
```

### Preview Compiled Project for Production

Default URL: http://localhost:4173/kemov/

```sh
yarn preview
```

### Lint with [ESLint](https://eslint.org/)

```sh
yarn lint
```

### CSS Lint with [Stylelint](https://stylelint.io/)

```sh
yarn lint:style
```

## Deployment

The site is built and published by the `Deploy` workflow on every push to `main`, and GitHub Pages serves that artifact. Build output is not committed: `yarn build` writes to `dist/`, which is ignored.

To roll back, revert the commit and let the workflow redeploy. The workflow can also be run by hand from the Actions tab.

## LICENSE

MIT

### Copyright Warning

_KemoV_ works (such as images) are copyrighted by [Kemono Friends Project](https://kemono-friends.jp/) (KFP) and [Kemono Friends V Project](https://www.kemov-project.com/) (KFPV). These contents cannot be included in this repository, but can instead be used by linking to them.
