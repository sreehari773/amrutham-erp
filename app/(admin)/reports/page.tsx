"use client";

import { useState } from "react";

export default function ReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [month, setMonth] = useState("");

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
        <p className="page-copy">Generate customized billing ledgers and CSV exports.</p>
      </div>

      <div className="card space-y-6" style={{ maxWidth: 600 }}>
        <div>
          <h2 className="text-lg font-semibold mb-4">Invoice Ledger Export</h2>
          <p className="text-sm text-gray-400 mb-6">
            Filter invoices by date range, specific month, or a particular customer. 
            The exported CSV is specially formatted to ensure compatibility with Microsoft Excel.
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
            Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
