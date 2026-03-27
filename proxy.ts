import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const API_KEY_HEADER = "x-dashboard-api-key";

export function proxy(request: NextRequest) {
  const configuredKey = process.env.DASHBOARD_API_KEY;
  if (!configuredKey) {
    return NextResponse.next();
  }

  const providedKey = request.headers.get(API_KEY_HEADER);
  if (providedKey === configuredKey) {
    return NextResponse.next();
  }

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 },
  );
}

export const config = {
  matcher: ["/api/health"],
};
