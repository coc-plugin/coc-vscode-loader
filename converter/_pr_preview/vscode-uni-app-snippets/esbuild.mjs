import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim', '@biomejs/biome', '@tsconfig/node24', '@vscode/vsce', 'bumpp', 'concurrently', 'is-ci', 'lefthook', 'ovsx', 'simple-git', 'tsx', 'ultracite'],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
