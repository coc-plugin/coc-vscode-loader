import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim', 'pyright', '@rspack/cli', '@rspack/core', '@vscode/vsce', 'form-data', 'shx', 'ts-loader', 'webpack', 'vscode-jsonrpc', 'vscode-languageclient', 'vscode-languageserver', 'vscode-languageserver-protocol'],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
