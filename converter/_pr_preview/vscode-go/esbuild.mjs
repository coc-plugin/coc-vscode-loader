import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim', '@vscode/debugadapter-testsupport', '@vscode/vsce', 'adm-zip', 'fs-extra', 'get-port', 'gts', 'js-green-licenses', 'sinon', 'yarn', 'diff', 'glob', 'json-rpc2', 'moment', 'node-fetch', 'semver', 'tree-kill', 'vscode-debugadapter', 'vscode-debugprotocol', 'vscode-languageclient', 'vscode-languageserver-protocol', 'vscode-uri'],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
