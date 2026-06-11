import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

let logFile = ''

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 23)
  process.stderr.write(`[tsserver] [${ts}] ${msg}\n`)
  if (logFile) {
    try { fs.appendFileSync(logFile, `[tsserver] [${ts}] ${msg}\n`) } catch {}
  }
}

export function setLogFile(f: string) { logFile = f }

export class TsserverClient {
  private proc: cp.ChildProcess | null = null
  private seq = 0
  private pending = new Map<number, (v: any) => void>()
  private buf = ''
  private len = 0
  private ready = false
  private queue: Array<[string, any, (v: any) => void]> = []

  async start(tsServerPath: string, pluginPaths: string[], projectFile: string): Promise<void> {
    if (!fs.existsSync(tsServerPath)) {
      log('tsserver.js not found: ' + tsServerPath)
      return
    }
    log('Starting: ' + tsServerPath)
    log('Plugin paths: ' + pluginPaths.join(','))
    log('Project: ' + projectFile)

    this.proc = cp.spawn('node', [tsServerPath, '--canUseEvents'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc.on('exit', (code) => { log('exited: ' + code); this.proc = null })
    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buf += chunk.toString()
      this.processBuf()
    })
    this.proc.stderr!.on('data', (chunk: Buffer) => {
      const s = chunk.toString().trim()
      if (s) log('stderr: ' + s)
    })

    // 等 tsserver 启动
    await new Promise(r => setTimeout(r, 1000))

    // 1. configure — 告诉 tsserver 插件路径
    await this.send('configure', {
      hostInfo: 'coc-volar',
      preferences: { pluginPaths },
    })
    log('configure sent')

    // 2. 创建项目（带上编译器选项和插件配置）
    const projectRoot = path.dirname(projectFile)
    const jsFiles = [path.join(projectRoot, 'src', 'main.js')]
      .filter(f => fs.existsSync(f))
      .map(fileName => ({ fileName }))
    await this.send('openExternalProject', {
      projectFileName: projectFile,
      rootFiles: jsFiles,
      options: {
        allowJs: true,
        allowNonTsExtensions: true,
        checkJs: false,
        plugins: [{ name: '@vue/typescript-plugin' }],
      },
    })
    log('openExternalProject sent, files=' + jsFiles.length)
    await new Promise(r => setTimeout(r, 4000))

    this.ready = true
    log('READY')

    // 处理队列
    for (const [cmd, args, resolve] of this.queue) {
      resolve(await this.send(cmd, args))
    }
    this.queue = []
  }

  async request(command: string, args?: any): Promise<any> {
    if (!this.ready) {
      log('queued: ' + command)
      return new Promise(resolve => { this.queue.push([command, args, resolve]) })
    }
    return this.send(command, args)
  }

  private send(command: string, args?: any): Promise<any> {
    return new Promise(resolve => {
      const seq = ++this.seq
      const msg = JSON.stringify({ seq, type: 'request', command, arguments: args })
      const header = `Content-Length: ${Buffer.byteLength(msg, 'utf8')}\r\n\r\n`
      this.pending.set(seq, resolve)
      log('→ ' + command + ' (#' + seq + ')')
      this.proc?.stdin?.write(header + msg)
      // 超时保护
      setTimeout(() => {
        if (this.pending.has(seq)) {
          this.pending.delete(seq)
          log('⌛ timeout: ' + command)
          resolve(undefined)
        }
      }, 8000)
    })
  }

  private processBuf(): void {
    while (true) {
      if (this.len === 0) {
        const m = this.buf.match(/Content-Length: (\d+)\r?\n\r?\n/)
        if (!m) break
        this.len = parseInt(m[1], 10)
        this.buf = this.buf.slice(m.index! + m[0].length)
      }
      if (this.buf.length < this.len) break
      const json = JSON.parse(this.buf.slice(0, this.len))
      this.buf = this.buf.slice(this.len); this.len = 0
      if (json.type === 'response') {
        const cb = this.pending.get(json.request_seq)
        if (cb) { this.pending.delete(json.request_seq); cb(json.success ? json.body : undefined) }
      } else if (json.type === 'event' && json.event !== 'configFileDiag') {
        log('← event: ' + json.event)
      }
    }
  }

  stop(): void { this.proc?.kill(); this.proc = null; this.ready = false }
}
