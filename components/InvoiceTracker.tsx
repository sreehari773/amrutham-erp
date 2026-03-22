"use client";

import { useEffect, useState } from "react";
import { getCustomerInvoices, updateInvoicePayment } from "@/app/actions/sprint1";
import { formatINR } from "@/lib/utils";

type Invoice = {
  id: number;
  invoice_number: string;
  amount: number;
  amount_paid: number;
  payment_status: string;
  invoice_date: string;
};

export default function InvoiceTracker({ customerId }: { customerId: number }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [payInput, setPayInput] = useState<{ [key: number]: number | string }>({});

  async function loadInvoices() {
    setLoading(true);
    const res = await getCustomerInvoices(customerId);
    if (res.data) setInvoices(res.data);
    setLoading(false);
  }

  useEffect(() => {
    loadInvoices();
  }, [customerId]);

  async function handleSavePayment(inv: Invoice) {
    const val = Number(payInput[inv.id] ?? inv.amount_paid ?? 0);
    setUpdatingId(inv.id);
    const res = await updateInvoicePayment(inv.id, val);
    setUpdatingId(null);
    if (res.error) {
      window.alert(res.error);
    } else {
      loadInvoices();
    }
  }

  const totalPending = invoices.reduce((acc, inv) => acc + (inv.amount - (inv.amount_paid || 0)), 0);

  if (loading) {
    return <div className="p-4 text-center text-gray-500 text-sm">Loading ledger...</div>;
  }

  if (invoices.length === 0) {
    return <div className="p-4 text-center text-gray-500 text-sm">No invoices found for this customer.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-orange-50 border border-orange-100 p-3 rounded-xl mb-4">
        <span className="text-orange-900 font-medium">Total Lifetime Pending</span>
        <span className="text-xl font-bold text-orange-600">{formatINR(totalPending)}</span>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
        {invoices.map((inv) => {
          const isPending = (inv.amount - (inv.amount_paid || 0)) > 0;
          return (
            <div key={inv.id} className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm">{inv.invoice_number}</div>
                  <div className="text-xs text-gray-500">{new Date(inv.invoice_date).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{formatINR(inv.amount)}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isPending ? 'text-orange-500' : 'text-green-600'}`}>
                    {inv.payment_status || (isPending ? 'Pending' : 'Paid')}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 items-center mt-2 border-t pt-2">
                <span className="text-xs text-gray-500 font-medium w-full">Paid Amt:</span>
                <input
                  type="number"
                  className="text-input h-8 text-sm"
                  style={{ width: '100px', margin: 0 }}
                  value={payInput[inv.id] !== undefined ? payInput[inv.id] : (inv.amount_paid || 0)}
                  onChange={(e) => setPayInput({ ...payInput, [inv.id]: e.target.value })}
                />
                <button
                  className="btn-primary h-8 py-0 px-3 text-xs"
                  onClick={() => void handleSavePayment(inv)}
                  disabled={updatingId === inv.id}
                >
                  {updatingId === inv.id ? "..." : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
