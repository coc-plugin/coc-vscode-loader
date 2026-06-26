import * as esbuild from 'esbuild'

const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  mainFields: ['module', 'main'],
  external: ['coc.nvim', '@ansible/ansible-language-server', '@biomejs/biome', '@eslint/js', '@vitejs/plugin-vue', '@vitest/coverage-v8', '@vitest/ui', '@vscode/vsce', '@vue/test-utils', '@wdio/cli', '@wdio/globals', '@wdio/local-runner', '@wdio/mocha-framework', '@wdio/spec-reporter', 'cspell-cli', 'cypress-multi-reporters', 'electron', 'express', 'find-process', 'glob', 'globals', 'ini', 'jsdom', 'knip', 'lodash', 'markdownlint-cli2', 'ovsx', 'pnpm', 'rimraf', 'sinon', 'ts-node', 'tsdown', 'tsx', 'vitest', 'vscode-jsonrpc', 'vscode-languageserver-protocol', 'vue-tsc', 'wdio-vscode-service', 'winston', '@google/genai', '@highlightjs/vue-plugin', '@primeuix/themes', '@redhat-developer/vscode-redhat-telemetry', '@vscode-elements/elements', '@vscode/codicons', '@vscode/python-extension', 'highlight.js', 'js-yaml', 'marked', 'minimatch', 'primevue', 'semver', 'uuid', 'vite', 'vscode-languageclient', 'vscode-uri', 'vue', 'yaml'],
  platform: 'node',
  target: 'node18',
  outfile: 'lib/index.js',
}

const result = await esbuild.build(options)
if (result.errors.length) {
  console.error(result.errors)
  process.exit(1)
}
