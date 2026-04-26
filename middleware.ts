import { NextRequest, NextResponse } from "next/server";
import { isBasicAuthAuthorized } from "@/lib/basic-auth";
import { isBasicAuthConfigured } from "@/lib/env";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/signout).*)"],
};

export function middleware(req: NextRequest) {
  if (!isBasicAuthConfigured()) {
    return new NextResponse("Basic auth is not configured.", { status: 500 });
  }

  if (isBasicAuthAuthorized(req.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Amrutham ERP"',
    },
  });
}
