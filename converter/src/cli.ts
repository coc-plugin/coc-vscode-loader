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
  .option('--convert <json>', 'convert step configuration (JSON array)')
  .option('-v, --verbose', 'verbose output')
  .action(async (input, opts) => {
    let steps: any[]
    if (opts.convert) {
      try {
        steps = JSON.parse(opts.convert)
        if (!Array.isArray(steps)) throw new Error('must be an array')
      } catch (e: any) {
        console.error(`invalid --convert JSON: ${e.message}`)
        process.exit(1)
      }
    } else {
      console.error('--convert <JSON> is required')
      process.exit(1)
    }

    await convert({
      input,
      output: opts.output,
      convert: steps,
      verbose: opts.verbose,
    })
  })

program.parse()
