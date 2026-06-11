import { InviteAcceptClient } from "./InviteAcceptClient";

/**
 * Pending-invite acceptance page (WS18). The invite token is the capability; this page
 * lets the signed-in invitee accept it. The actual accept is a server-verified Admin SDK
 * write (`POST /api/account/accept`) that matches the invitee's verified email — the page
 * only orchestrates sign-in and the accept call.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAcceptClient token={token} />;
}
