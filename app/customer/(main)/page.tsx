import { getCustomerDashboardData } from "@/app/actions/customerData";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage() {
  const { data, error } = await getCustomerDashboardData();

  if (error || !data) {
    redirect("/customer/login");
  }

  const { subscription, todayMenu, dayOfWeek } = data;
  const tiffinsLeft = subscription?.remaining_tiffins ?? 0;
  
  // Calculate Progress
  const total = subscription?.total_tiffins ?? 1;
  const progressPercent = Math.max(0, Math.min(100, ((total - tiffinsLeft) / total) * 100));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h1 className="text-2xl font-black mb-6">Welcome Back! 👋</h1>

      {/* Subscription Status Card */}
      <div className="bg-[var(--accent)] text-white rounded-3xl p-6 shadow-xl shadow-orange-500/20 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10"></div>
        
        {subscription ? (
          <>
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div>
                <p className="text-orange-100 font-bold text-sm uppercase tracking-wider mb-1">Active Plan</p>
                <h2 className="text-2xl font-black">{subscription.subscription_plans?.name || "Custom Plan"}</h2>
              </div>
              <div className="text-right">
                <span className="text-4xl font-black">{tiffinsLeft}</span>
                <p className="text-orange-100 text-xs font-bold uppercase tracking-wide">Left</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative z-10">
              <div className="flex justify-between text-xs font-bold text-orange-100 mb-2">
                <span>Consumed: {total - tiffinsLeft}</span>
                <span>Total: {total}</span>
              </div>
              <div className="w-full bg-orange-900/40 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-white h-full rounded-full transition-all duration-1000 ease-out" 
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
            
            {tiffinsLeft <= 3 && tiffinsLeft > 0 && (
               <div className="mt-4 bg-red-500/80 text-white text-xs font-bold px-3 py-2 rounded-lg inline-block">
                 ⚠️ Your subscription is ending soon.
               </div>
            )}
            
            {tiffinsLeft === 0 && (
              <div className="mt-6 flex gap-3">
                <Link href="/customer/renewal" className="bg-white text-[var(--accent)] font-bold py-2.5 px-4 rounded-xl flex-1 text-center shadow-lg active:scale-95 transition-all">
                  Renew Now
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="relative z-10">
            <h2 className="text-xl font-black mb-2">No Active Plan</h2>
            <p className="text-orange-100 text-sm mb-4">You do not have a running subscription.</p>
            <Link href="/customer/renewal" className="bg-white text-[var(--accent)] font-bold py-2.5 px-4 rounded-xl inline-block shadow-lg active:scale-95 transition-all">
              Start Subscription
            </Link>
          </div>
        )}
      </div>

      {/* Today's Menu Highlight */}
      <h3 className="font-bold text-lg mb-3">Today's Menu ({dayOfWeek})</h3>
      {todayMenu ? (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
          {subscription?.meal_preference !== 'non_veg' && (
            <div className="flex gap-3">
              <div className="mt-1 flex-shrink-0 w-4 h-4 border-2 border-green-500 rounded-sm flex items-center justify-center">
                 <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Vegetarian</p>
                <p className="text-slate-800 text-sm font-medium leading-relaxed">{todayMenu.veg_description || "Chef's Special Veg"}</p>
              </div>
            </div>
          )}
          
          {subscription?.meal_preference !== 'veg' && (
            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <div className="mt-1 flex-shrink-0 w-4 h-4 border-2 border-red-500 rounded-sm flex items-center justify-center">
                 <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Non-Vegetarian</p>
                <p className="text-slate-800 text-sm font-medium leading-relaxed">{todayMenu.non_veg_description || "Chef's Special Non-Veg"}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 text-center text-slate-500 text-sm">
          Kitchen closed or menu not available today.
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4 mt-8">
         <Link href="/customer/pause" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
           <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
           </div>
           <span className="text-sm font-bold text-slate-700">Skip Delivery</span>
         </Link>
         
         <a href="https://wa.me/919000000000" target="_blank" rel="noreferrer" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform">
           <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
           </div>
           <span className="text-sm font-bold text-slate-700">Support</span>
         </a>
      </div>
    </div>
  );
}
