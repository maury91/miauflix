import { webAppOrigin } from '@shared/config/constants';

/** The address a phone opens to approve a QR login: the web app's approval page. */
export function qrApprovalUrl(approvalPath: string, appOrigin: string = webAppOrigin()): string {
  return new URL(approvalPath, appOrigin).toString();
}
