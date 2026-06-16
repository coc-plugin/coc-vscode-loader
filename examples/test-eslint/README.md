# ESLint Test Project

Test project for verifying the converted `coc-vscode-eslint` plugin.

## Structure

```
test-eslint/
├── eslint.config.js   — ESLint flat config (v9+) with rules
├── package.json       — ESLint + TypeScript deps
├── tsconfig.json      — TypeScript config for typed linting
├── test.js            — JS file with 10 lint violations
└── test.ts            — TS file with 5 lint violations
```

## Rules configured

| Rule | Severity | Triggers on |
|------|----------|-------------|
| `no-var` | error | `var` declarations |
| `quotes` (single) | error | double-quoted strings `"` |
| `semi` (never) | error | trailing semicolons `;` |
| `eqeqeq` | error | `==` instead of `===` |
| `prefer-const` | error | `let` never reassigned |
| `no-console` | warn | `console.log()` calls |
| `@typescript-eslint/no-unused-vars` | error | unused TS variables |

## Usage

```bash
npm install
npx eslint test.js test.ts
```

Expected output: **15 problems** (11 errors, 4 warnings).

Then open `test.js` and `test.ts` in Neovim with `coc-vscode-loader` + ESLint installed to verify diagnostics appear in-editor.
