import * as vscode from "coc.nvim";
import { MainPanel } from "@src/features/contentCreator/vue/views/createExecutionEnvPanel";

export const CreateExecutionEnv = {
  render(context: vscode.ExtensionContext) {
    MainPanel.render(context);
  },
};
