"use client";

import { useEffect, useState } from "react";
import { getCustomerProfitability, type CustomerProfitability } from "@/app/actions/analytics";
import { formatINR } from "@/lib/utils";

const profitabilityUiEnabled = process.env.NEXT_PUBLIC_PROFIT_ANALYTICS_UI_ENABLED === "true";

export default function ReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [month, setMonth] = useState("");
  const [profitability, setProfitability] = useState<CustomerProfitability[]>([]);
  const [profitabilityError, setProfitabilityError] = useState<string | null>(null);

  useEffect(() => {
    if (!profitabilityUiEnabled) {
      setProfitability([]);
      setProfitabilityError(null);
      return;
    }

    const targetMonth = month || undefined;
    getCustomerProfitability(targetMonth).then((result) => {
      if (result.error) {
        setProfitabilityError(result.error);
        return;
      }

      setProfitability(result.data ?? []);
      setProfitabilityError(null);
    });
  }, [month]);

  const handleDownload = () => {
    let url = "/api/export/invoices_v2?";
    const params = new URLSearchParams();
    
    // We add a BOM to the CSV output in the API, but passing params here
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (customerId) params.append("customerId", customerId);
    if (month) params.append("month", month);

    window.location.href = url + params.toString();
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">Reports & Exports</h1>
        <p className="page-copy">Generate customized billing ledgers and Excel exports.</p>
      </div>

      <div className="card space-y-6" style={{ maxWidth: 600 }}>
        <div>
          <h2 className="text-lg font-semibold mb-4">Invoice Ledger Export</h2>
          <p className="text-sm text-gray-400 mb-6">
            Filter invoices by date range, specific month, or a particular customer. 
            The exported workbook is delivered as an Excel file ready for sharing.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="field-label">
            From Date
            <input 
              type="date" 
              className="text-input mt-1" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)} 
            />
          </label>
          <label className="field-label">
            To Date
            <input 
              type="date" 
              className="text-input mt-1" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)} 
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="field-label">
            Filter by Month
            <input 
              type="month" 
              className="text-input mt-1" 
              value={month}
              onChange={(e) => setMonth(e.target.value)} 
            />
          </label>
          <label className="field-label">
            Customer ID (Optional)
            <input 
              type="text" 
              className="text-input mt-1" 
              placeholder="e.g. 12"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)} 
            />
          </label>
        </div>

        <div className="pt-4 border-t border-gray-800 flex justify-end">
          <button 
            onClick={handleDownload}
            className="btn-primary"
            style={{ minWidth: 150 }}
          >
            Download Excel
          </button>
        </div>
      </div>

      {profitabilityUiEnabled ? (
        <div className="card mt-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Customer Profit Visibility</h2>
            <p className="text-sm text-gray-400">
              Revenue minus ingredient and delivery cost, computed from billable delivered meals and invoice history.
            </p>
          </div>

          {profitabilityError ? (
            <div className="alert alert-error">{profitabilityError}</div>
          ) : profitability.length === 0 ? (
            <div className="text-sm text-gray-400">No profitability data available for the selected month yet.</div>
          ) : (
            <div className="space-y-3">
              {profitability.slice(0, 12).map((row) => (
                <div key={row.customer_id} className="rounded-xl border border-gray-800 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-xs text-gray-400">
                        Customer #{row.customer_id} | {row.phone || "No phone"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">Profit</div>
                      <div className="font-semibold">{formatINR(row.profit)}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-gray-400">Revenue</div>
                      <div>{formatINR(row.revenue)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Ingredient</div>
                      <div>{formatINR(row.ingredient_cost)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Delivery</div>
                      <div>{formatINR(row.delivery_cost)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Meals</div>
                      <div>{row.delivered_meals}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
