import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const customerId = searchParams.get("customerId");
  const month = searchParams.get("month");

  try {
    // Determine the period bounds
    let periodStart = startDate;
    let periodEnd = endDate;

    if (month) {
      periodStart = `${month}-01`;
      const nextMonth = new Date(periodStart);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      periodEnd = nextMonth.toISOString().split("T")[0];
    } else if (!periodStart) {
      periodStart = "2000-01-01"; // Fallback if no date specified
    }

    // 1. Fetch Invoices within the current period
    let invQuery = sb
      .from("invoices")
      .select("*, subscriptions(total_tiffins, start_date, customers(name, phone))");

    if (periodStart) invQuery = invQuery.gte("invoice_date", periodStart);
    if (periodEnd) invQuery = invQuery.lte("invoice_date", periodEnd);
    if (customerId) invQuery = invQuery.eq("customer_id", customerId);

    const { data: currentInvoices, error: invError } = await invQuery;
    if (invError) throw new Error(invError.message);

    // 2. Fetch Historical Invoices to calculate pendency
    let histQuery = sb
      .from("invoices")
      .select("id, customer_id, amount, amount_paid")
      .lt("invoice_date", periodStart!); // Everything strictly before the period start

    if (customerId) histQuery = histQuery.eq("customer_id", customerId);

    const { data: historicalInvoices, error: histError } = await histQuery;
    if (histError) throw new Error(histError.message);

    // Map historical pendency per customer
    const pendencyMap = new Map<number, number>();
    for (const hist of historicalInvoices ?? []) {
      const pending = Number(hist.amount || 0) - Number(hist.amount_paid || 0);
      if (pending > 0) {
        pendencyMap.set(hist.customer_id, (pendencyMap.get(hist.customer_id) || 0) + pending);
      }
    }

    // 3. Build the Excel Data shape
    const excelData = [];
    let serial = 1;

    // Group current invoices by customer to summarize the period
    const groupedCurrent = new Map<number, any>();

    for (const inv of currentInvoices ?? []) {
      const cid = inv.customer_id;
      if (!groupedCurrent.has(cid)) {
        groupedCurrent.set(cid, {
          customer: (inv.subscriptions as any)?.customers,
          total_tiffins: (inv.subscriptions as any)?.total_tiffins || 0,
          period: `${inv.invoice_date}`,
          thisMonthTotal: 0,
          amountPaid: 0,
        });
      }
      
      const g = groupedCurrent.get(cid);
      g.thisMonthTotal += Number(inv.amount || 0);
      g.amountPaid += Number(inv.amount_paid || 0);
      // We'll just show the latest date as the period reference if there are multiple invoices
      g.period = `${inv.invoice_date}`; 
    }

    Array.from(groupedCurrent.entries()).forEach(([cid, data]) => {
      const pastPendency = pendencyMap.get(cid) || 0;
      const totalPendingNow = (pastPendency + data.thisMonthTotal) - data.amountPaid;

      excelData.push({
        "S.No": serial++,
        "Name": data.customer?.name || "N/A",
        "Phone": data.customer?.phone || "N/A",
        "Billed Start Date": periodStart || "N/A",
        "Billed End Date": periodEnd || "N/A",
        "Payment Pending": pastPendency,
        "Bill of Selected Tenure": data.thisMonthTotal,
        "Total Paid": data.amountPaid,
        "New Total": totalPendingNow,
      });
    });

    if (excelData.length === 0) {
      excelData.push({ "S.No": "-", "Message": "No data available for the selected parameters." });
    }

    // 4. Generate XLSX Workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Billing Report");

    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Amrutham_Billing_Report.xlsx"`,
      },
    });

  } catch (err: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR: " + err.message }, { status: 500 });
  }
}
