#!/usr/bin/env node
import * as fs from 'fs'
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
  .option('--convert-file <path>', 'path to JSON file with convert step configuration')
  .option('--presets-file <path>', 'path to JSON file with preset definitions (e.g. bridge presets)')
  .option('-v, --verbose', 'verbose output')
  .action(async (input, opts) => {
    let steps: any[]
    let presets: any
    if (opts.presetsFile) {
      try { presets = JSON.parse(fs.readFileSync(opts.presetsFile, 'utf-8')) } catch (e: any) {
        console.error(`invalid --presets-file: ${e.message}`)
        process.exit(1)
      }
    }
    if (opts.convertFile) {
      try {
        const content = fs.readFileSync(opts.convertFile, 'utf-8')
        steps = JSON.parse(content)
        if (!Array.isArray(steps)) throw new Error('must be an array')
      } catch (e: any) {
        console.error(`invalid --convert-file: ${e.message}`)
        process.exit(1)
      }
    } else if (opts.convert) {
      try {
        steps = JSON.parse(opts.convert)
        if (!Array.isArray(steps)) throw new Error('must be an array')
      } catch (e: any) {
        console.error(`invalid --convert JSON: ${e.message}`)
        process.exit(1)
      }
    } else {
      console.error('--convert <JSON> or --convert-file <path> is required')
      process.exit(1)
    }

    await convert({
      input,
      output: opts.output,
      convert: steps,
      presets,
      verbose: opts.verbose,
    })
  })

program.parse()
