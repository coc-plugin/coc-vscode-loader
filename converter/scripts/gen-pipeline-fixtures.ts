// Generate expected outputs for pipeline fixtures
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { convert } from '../src/convert.js'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.resolve(__dirname, '../src/__fixtures__/pipeline')

async function generate() {
  const cases = fs.readdirSync(fixturesDir, { withFileTypes: true })
    .filter(e => e.isDirectory())

  for (const c of cases) {
    const inputDir = path.join(fixturesDir, c.name)
    const expectedDir = path.join(inputDir, 'expected')
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-pipeline-'))
    const outputDir = path.join(tmpdir, 'output')

    // Copy input to temp (excluding expected/)
    const tmpInput = path.join(tmpdir, 'input')
    fs.cpSync(inputDir, tmpInput, { recursive: true })
    const expDir = path.join(tmpInput, 'expected')
    if (fs.existsSync(expDir)) fs.rmSync(expDir, { recursive: true })

    try {
      await convert({
        input: tmpInput,
        output: outputDir,
        convert: [{ type: 'source', transforms: ['import-mapping'] }],
      })

      // Copy output to expected/
      if (fs.existsSync(expectedDir)) fs.rmSync(expectedDir, { recursive: true })
      const expectedSrcDir = path.join(expectedDir, 'src')
      fs.mkdirSync(expectedSrcDir, { recursive: true })

      const outputSrc = path.join(outputDir, 'src')
      if (fs.existsSync(outputSrc)) {
        for (const f of fs.readdirSync(outputSrc)) {
          if (f.endsWith('.ts')) {
            fs.copyFileSync(path.join(outputSrc, f), path.join(expectedSrcDir, f))
          }
        }
      }
      console.log(`  Generated: ${c.name}`)
    } catch (e) {
      console.error(`  FAILED: ${c.name} — ${e.message}`)
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true })
    }
  }
}

generate().catch(console.error)
