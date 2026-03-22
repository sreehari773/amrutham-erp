import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // This is a stub to avoid build errors. 
  // If you see this, the file was successfully updated.
  console.log("OLD_ROUTE_CALLED");
  return NextResponse.json({ message: "Deprecated. Use /api/export/invoices_v2" });
}
