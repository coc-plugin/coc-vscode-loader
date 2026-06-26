import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim', '@vscode/python-environments', '@vscode/vsce', 'glob', 'ovsx', 'ts-loader', 'webpack', 'webpack-cli', '@vscode/python-extension', 'fs-extra', 'vscode-languageclient', 'which'],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
