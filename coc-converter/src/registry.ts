export interface RegistrySource {
  type: 'github' | 'npm'
  repo?: string
  package?: string
  subdir?: string
}

export interface PackageInfo {
  name: string
  displayName: string
  description: string
  type: 'ts-bridge' | 'pure-lsp' | 'direct-api'
  source: RegistrySource
  url: string
  languages: string[]
  categories: string[]
}

const BUILTIN_REGISTRY: PackageInfo[] = [
  {
    name: 'volar',
    displayName: 'Volar (Vue)',
    description: 'Vue language support — template/script/style IntelliSense',
    type: 'ts-bridge',
    source: { type: 'github', repo: 'vuejs/language-tools', subdir: 'extensions/vscode' },
    url: 'https://github.com/vuejs/language-tools',
    languages: ['vue'],
    categories: ['LSP', 'TypeScript'],
  },
  {
    name: 'prisma',
    displayName: 'Prisma',
    description: 'Prisma schema language support — syntax highlight, lint, format',
    type: 'pure-lsp',
    source: { type: 'github', repo: 'prisma/language-tools', subdir: 'packages/vscode' },
    url: 'https://github.com/prisma/language-tools',
    languages: ['prisma'],
    categories: ['LSP'],
  },
  {
    name: 'html-css-support',
    displayName: 'HTML CSS Support',
    description: 'CSS class name completion for HTML attributes',
    type: 'direct-api',
    source: { type: 'github', repo: 'ecmel/vscode-html-css' },
    url: 'https://github.com/ecmel/vscode-html-css',
    languages: ['html', 'css'],
    categories: ['Completion'],
  },
  {
    name: 'angular',
    displayName: 'Angular Language Service',
    description: 'Angular template type-checking and completion',
    type: 'ts-bridge',
    source: { type: 'github', repo: 'angular/vscode-ng-language-service' },
    url: 'https://github.com/angular/vscode-ng-language-service',
    languages: ['html', 'typescript'],
    categories: ['LSP', 'TypeScript'],
  },
  {
    name: 'eslint',
    displayName: 'ESLint',
    description: 'Integrates ESLint into the editor',
    type: 'pure-lsp',
    source: { type: 'github', repo: 'microsoft/vscode-eslint' },
    url: 'https://github.com/microsoft/vscode-eslint',
    languages: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'vue'],
    categories: ['Linter'],
  },
  {
    name: 'json',
    displayName: 'JSON Language Features',
    description: 'JSON schema validation and completion',
    type: 'pure-lsp',
    source: { type: 'github', repo: 'microsoft/vscode', subdir: 'extensions/json-language-features' },
    url: 'https://github.com/microsoft/vscode',
    languages: ['json', 'jsonc'],
    categories: ['LSP'],
  },
  {
    name: 'yamlls',
    displayName: 'YAML Language Support',
    description: 'YAML schema validation and auto-completion',
    type: 'pure-lsp',
    source: { type: 'github', repo: 'redhat-developer/vscode-yaml' },
    url: 'https://github.com/redhat-developer/vscode-yaml',
    languages: ['yaml'],
    categories: ['LSP'],
  },
]

export function getAllPackages(): PackageInfo[] {
  return BUILTIN_REGISTRY
}

export function getPackage(name: string): PackageInfo | undefined {
  return BUILTIN_REGISTRY.find(p => p.name === name)
}
