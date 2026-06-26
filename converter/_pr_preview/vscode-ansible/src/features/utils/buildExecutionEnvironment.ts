import { workspace, Uri } from 'coc.nvim'
if (typeof window !== 'undefined' && !('activeTextEditor' in window)) {
  try {
    Object.defineProperty(window, 'activeTextEditor', {
      get() {
        try {
          var doc = typeof workspace !== 'undefined' ? workspace.getDocument() : undefined;
          return doc ? { document: doc } : undefined;
        } catch(e) { return undefined }
      },
      configurable: true,
    });
  } catch {}
}
import * as vscode from "coc.nvim";
import * as path from "path";
import { withInterpreter } from "@src/features/utils/commandRunner";
import { SettingsManager } from "@src/settings";
import { runCommand } from "@src/features/contentCreator/utils";

export function rightClickEEBuildCommand(commandId: string): vscode.Disposable {
  return vscode.commands.registerCommand(commandId, async (uri: vscode.Uri) => {
    if (!uri?.fsPath) {
      const getFileFromEditor = vscode.window.activeTextEditor;
      if (!getFileFromEditor) {
        vscode.Promise.resolve(vscode.window.showMessage("No file selected and no active file found!", 'error'));
        return;
      }
      const filePath = Uri.parse(getFileFromEditor.document.uri).fsPath;
      if (
        !filePath.endsWith("execution-environment.yml") &&
        !filePath.endsWith("execution-environment.yaml")
      ) {
        vscode.Promise.resolve(vscode.window.showMessage("Active file is not an execution environment file!", 'error'));
        return;
      }
      uri = getFileFromEditor.document.uri;
    }

    const filePath = uri.fsPath;
    const dirPath = path.dirname(filePath);

    const builderCommand = `ansible-builder build -f ${filePath} -c ${dirPath}/context`;

    vscode.Promise.resolve(vscode.window.showMessage(`Running: ${builderCommand}`, 'more'));

    if (!dirPath) {
      vscode.Promise.resolve(vscode.window.showMessage("Could not determine workspace folder.", 'error'));
      return;
    }

    try {
      const extSettings = new SettingsManager();
      await extSettings.initialize();

      const { command, env } = await withInterpreter(
        extSettings.settings,
        builderCommand,
        "",
      );

      const result = await runCommand(command, env);

      if (result.status === "failed") {
        vscode.Promise.resolve(vscode.window.showMessage(`Build failed with status ${result.status}: \n${result.output.trim()}`, 'error'));
        return;
      }

      vscode.Promise.resolve(vscode.window.showMessage(`Build successful:\n${result.output.trim()}`, 'more'));
    } catch (error) {
      vscode.Promise.resolve(vscode.window.showMessage(`Unexpected error: ${(error as Error).message}`, 'error'));
    }
  });
}
