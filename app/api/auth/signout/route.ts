import { NextResponse } from "next/server";

export async function GET() {
  return new NextResponse("Session cleared. Please close this tab or log in again.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Amrutham ERP"',
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
