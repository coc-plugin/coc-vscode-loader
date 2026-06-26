import * as vscode from "coc.nvim";
import { IError } from "@src/features/lightspeed/utils/errors";
import { LightSpeedCommands } from "@src/definitions/lightspeed";

export class OneClickTrialProvider {
  public async showPopup(error?: IError): Promise<boolean> {
    if (error?.code === "permission_denied__can_apply_for_trial") {
      const buttonLabel = "Start a trial";
      const selection = await vscode.Promise.resolve(vscode.window.showMessage("Ansible Lightspeed is not configured for your organization, 'more'));
      if (selection === buttonLabel) {
        vscode.commands.executeCommand(
          LightSpeedCommands.LIGHTSPEED_OPEN_TRIAL_PAGE,
        );
      }
      return true; // This suppresses to show the standard error message.
    }
    return false;
  }
}

const oneClickTrialProvider = new OneClickTrialProvider();

export function getOneClickTrialProvider(): OneClickTrialProvider {
  return oneClickTrialProvider;
}
