#!/usr/bin/env node
import { Command } from 'commander'
import { convert } from './convert.js'

const program = new Command()

program
  .name('converter')
  .description('vscode → coc.nvim extension converter')
  .version('0.1.0')

program
  .command('convert')
  .description('convert a VS Code extension to coc.nvim')
  .argument('<input>', 'input directory (VS Code extension)')
  .option('-o, --output <dir>', 'output directory', './output')
  .option('--bridge', 'generate ts-bridge code')
  .option('-v, --verbose', 'verbose output')
  .action(async (input, opts) => {
    await convert({
      input,
      output: opts.output,
      bridge: opts.bridge,
      verbose: opts.verbose,
    })
  })

program.parse()
