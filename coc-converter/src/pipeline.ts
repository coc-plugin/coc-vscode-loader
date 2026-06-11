import { StateManager } from './state'

interface Step {
  msg: string
  cmd: string
}

const INSTALL_STEPS: Step[] = [
  { msg: 'Cloning repository...', cmd: 'git clone --depth=1 https://github.com/vuejs/language-tools' },
  { msg: 'Scanning API...', cmd: 'scanner: analyzing 128 source files' },
  { msg: 'Transforming code...', cmd: 'transform: import-mapping, class-to-factory, provider-register' },
  { msg: 'Building...', cmd: 'npm install && npm run build' },
  { msg: 'Installing to coc...', cmd: 'ln -s ./dist ~/.config/coc/extensions/node_modules/coc-converted-plugin' },
]

const UNINSTALL_STEPS: Step[] = [
  { msg: 'Removing files...', cmd: 'rm -rf node_modules, lib, dist' },
  { msg: 'Cleaning config...', cmd: 'clean: package.json, coc-settings.json' },
]

async function runPipeline(
  steps: Step[],
  onProgress: (short: string, log: string) => void,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    const n = i + 1, total = steps.length
    onProgress(
      `[${n}/${total}] ${steps[i].msg}`,
      `[${n}/${total}] ${steps[i].msg}\n  $ ${steps[i].cmd}`,
    )
    await sleep(800 + Math.random() * 600)
  }
}

export function installPackage(state: StateManager, name: string): Promise<void> {
  state.setPackageStatus(name, 'installing', { progress: '[1/5] Preparing...', appendLog: true })
  return runPipeline(INSTALL_STEPS, (short, log) => {
    state.setPackageStatus(name, 'installing', { progress: short, logEntry: log })
  }).then(() => {
    state.setPackageStatus(name, 'installed')
  }).catch(err => {
    state.setPackageStatus(name, 'failed', { error: err.message })
  })
}

export function uninstallPackage(state: StateManager, name: string): Promise<void> {
  state.setPackageStatus(name, 'uninstalling', { progress: '[1/2] Preparing...', appendLog: true })
  return runPipeline(UNINSTALL_STEPS, (short, log) => {
    state.setPackageStatus(name, 'uninstalling', { progress: short, logEntry: log })
  }).then(() => {
    state.setPackageStatus(name, 'not-installed')
  }).catch(err => {
    state.setPackageStatus(name, 'failed', { error: err.message })
  })
}

export function updatePackage(state: StateManager, name: string): Promise<void> {
  state.setPackageStatus(name, 'updating', { progress: '[1/5] Preparing...', appendLog: true })
  return runPipeline(INSTALL_STEPS, (short, log) => {
    state.setPackageStatus(name, 'updating', { progress: short, logEntry: log })
  }).then(() => {
    state.setPackageStatus(name, 'installed')
  }).catch(err => {
    state.setPackageStatus(name, 'failed', { error: err.message })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
