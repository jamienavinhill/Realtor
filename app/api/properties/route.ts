import type { NextRequest } from "next/server";
import { handlePropertiesPost } from "@/lib/api/properties-handler";

// The Admin SDK (firebase-admin) requires the Node.js runtime, not the Edge runtime.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handlePropertiesPost(req);
}
