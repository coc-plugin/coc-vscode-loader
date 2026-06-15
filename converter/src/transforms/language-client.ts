import { Transform } from '../types.js'

/**
 * Adapt LanguageClient construction from VS Code style to coc style.
 *
 * VS Code:
 *   new LanguageClient('id', 'name', serverOptions, clientOptions)
 *   serverOptions = { run: { module, transport }, debug: { module, transport } }
 *
 * coc:
 *   new LanguageClient('id', 'name', serverOptions, clientOptions)
 *   serverOptions = { module, transport, options? }
 */
export const transformLanguageClient: Transform = (ctx) => {
  const { file } = ctx

  file.getDescendantsOfKind(199 /* CallExpression */).forEach(call => {
    const text = call.getText()

    // Match: new LanguageClient(...)
    if (!text.startsWith('new LanguageClient(')) return

    // Extract serverOptions argument (3rd positional arg)
    const args = call.getArguments()
    if (args.length < 3) return

    const serverOpts = args[2].getText()

    // Check if it has the VS Code style { run, debug } structure
    if (!serverOpts.includes('run:') || !serverOpts.includes('debug:')) return

    // Extract module and transport from run block
    const moduleMatch = serverOpts.match(/module:\s*([^,}\s]+)/)
    const transportMatch = serverOpts.match(/transport:\s*([^,}\s]+)/)

    if (!moduleMatch) return

    // Build coc-style serverOptions
    let cocOpts = `{\n      module: ${moduleMatch[1]}`
    if (transportMatch) {
      cocOpts += `,\n      transport: ${transportMatch[1]}`
    }
    cocOpts += '\n    }'

    // Replace the argument
    args[2].replaceWithText(cocOpts)
  })
}
