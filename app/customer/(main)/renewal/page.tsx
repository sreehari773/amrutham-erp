"use client";

import { useState, useEffect } from "react";
import { getSubscriptionPlans, SubscriptionPlan } from "@/app/actions/plans";
import { submitRenewalRequest } from "@/app/actions/customerRenewal";

export default function RenewalPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  
  const [utr, setUtr] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hardcoded for demo - usually loaded from admin settings
  const upiId = "amrutham@ybl"; 

  useEffect(() => {
    getSubscriptionPlans().then(res => {
      setPlans(res.data);
      setLoading(false);
    });
  }, []);

  async function handleSubmit() {
    if (!selectedPlan || !utr) return;
    setSubmitLoading(true);
    setError(null);
    
    const res = await submitRenewalRequest(selectedPlan.id, utr);
    
    if (res.error) {
       setError(res.error);
    } else {
       setSuccess(true);
    }
    setSubmitLoading(false);
  }

  if (success) {
    return (
      <div className="animate-in fade-in zoom-in duration-500 min-h-[60vh] flex flex-col justify-center items-center text-center px-4">
        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">Payment Submitted!</h2>
        <p className="text-slate-500 mb-8 max-w-sm">We've received your UTR number. Our team will verify the payment and activate your subscription shortly.</p>
        <button onClick={() => window.location.href = "/customer"} className="btn-primary w-full max-w-xs shadow-lg shadow-orange-500/30">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <h1 className="text-2xl font-black mb-2">Renew Subscription</h1>
      <p className="text-slate-500 mb-6 text-sm">Select a plan and make a direct UPI payment to continue your meals seamlessly.</p>

      {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 border border-red-100">{error}</div>}

      {!selectedPlan ? (
        <div className="space-y-4">
          {loading ? (
             <div className="text-center py-10 text-slate-400">Loading plans...</div>
          ) : plans.map(plan => (
            <div 
              key={plan.id} 
              onClick={() => setSelectedPlan(plan)}
              className="bg-white p-5 rounded-3xl border-2 border-transparent hover:border-[var(--accent)] shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-slate-800 text-lg">{plan.name}</h3>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-md">{plan.tiffin_count} Meals</span>
              </div>
              <div className="text-[var(--accent)] font-black text-2xl mt-4">
                ₹{plan.total_price}
              </div>
              <div className="text-xs text-slate-400 mt-1">Includes delivery charge</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-in slide-in-from-right-8 duration-300">
           {/* Step 2: Payment View */}
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
             <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-100">
               <div>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Selected Plan</p>
                 <h3 className="font-bold text-slate-800">{selectedPlan.name}</h3>
               </div>
               <button onClick={() => setSelectedPlan(null)} className="text-[var(--accent)] text-sm font-bold bg-orange-50 px-3 py-1.5 rounded-lg active:scale-95">Change</button>
             </div>
             
             <div className="text-center mb-8">
                <p className="text-sm text-slate-500 mb-2">Amount to pay</p>
                <div className="text-4xl font-black text-slate-800 tracking-tight">₹{selectedPlan.total_price}</div>
             </div>

             {/* UPI Intent Button */}
             <a 
               href={`upi://pay?pa=${upiId}&pn=Amrutham&am=${selectedPlan.total_price}&cu=INR`}
               className="flex items-center justify-center gap-3 w-full py-4 bg-[#6739B7] text-white font-bold rounded-2xl active:scale-95 transition-all shadow-lg shadow-purple-500/20 mb-6"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
               Pay with GPay / PhonePe
             </a>

             <div className="text-center">
               <span className="text-xs text-slate-400 uppercase font-bold tracking-widest bg-white px-2">OR Pay Manually</span>
             </div>
             <div className="text-center mt-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
               <p className="text-sm text-slate-500">Scan QR or use UPI ID:</p>
               <p className="font-bold text-lg text-slate-800 mt-1 cursor-all-scroll tracking-wide">{upiId}</p>
             </div>
           </div>

           {/* Step 3: Verify View */}
           <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
             <h3 className="font-bold text-slate-800 mb-4">Confirm Payment</h3>
             <p className="text-xs text-slate-500 mb-4">After making the payment, please enter the 12-digit UTR/Reference number provided by your UPI app.</p>
             
             <input 
                type="text" 
                value={utr}
                onChange={e => setUtr(e.target.value)}
                placeholder="e.g. 312345678901"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-slate-50 mb-4 tracking-widest text-center font-bold"
              />
              
              <button 
                onClick={handleSubmit}
                disabled={!utr || submitLoading}
                className="w-full py-3.5 bg-[var(--accent)] text-white font-bold rounded-xl active:scale-95 transition-all text-sm shadow-md shadow-orange-500/30 disabled:opacity-50"
              >
                {submitLoading ? "Submitting..." : "Verify Payment"}
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
