import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isBasicAuthAuthorized } from "@/lib/basic-auth";
import { isBasicAuthConfigured } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (!isBasicAuthConfigured()) {
    return new NextResponse("Basic auth is not configured.", { status: 500 });
  }

  if (!isBasicAuthAuthorized(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Amrutham ERP"' },
    });
  }

  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("invoices")
    .select(`
      id,
      invoice_number,
      amount,
      payment_mode,
      invoice_date,
      paid_at,
      created_at,
      subscriptions!inner (
        id,
        total_tiffins,
        customers!inner (
          name,
          phone
        )
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "Invoice Number",
    "Customer Name",
    "Phone",
    "Subscription ID",
    "Total Tiffins",
    "Amount",
    "Payment Mode",
    "Invoice Date",
    "Paid At",
  ];

  const rows = (data ?? []).map((invoice: any) => {
    const subscription = invoice.subscriptions;
    const customer = subscription?.customers;

    return [
      invoice.invoice_number,
      `"${customer?.name ?? ""}"`,
      customer?.phone ?? "",
      subscription?.id ?? "",
      subscription?.total_tiffins ?? "",
      invoice.amount,
      invoice.payment_mode,
      invoice.invoice_date,
      invoice.paid_at,
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="amrutham-invoices-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
