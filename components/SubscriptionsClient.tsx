"use client";

import { useState } from "react";
import { formatINR } from "@/lib/utils";
import { createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan, type SubscriptionPlan } from "@/app/actions/plans";

type Props = {
  initialPlans: SubscriptionPlan[];
  initialError?: string | null;
};

export default function SubscriptionsClient({ initialPlans, initialError = null }: Props) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(initialPlans);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formName, setFormName] = useState("");
  const [formTiffins, setFormTiffins] = useState("");
  const [formPrice, setFormPrice] = useState("");

  function openNewModal() {
    setEditingPlan(null);
    setFormName("");
    setFormTiffins("");
    setFormPrice("");
    setIsModalOpen(true);
  }

  function openEditModal(plan: SubscriptionPlan) {
    setEditingPlan(plan);
    setFormName(plan.name);
    setFormTiffins(plan.tiffin_count.toString());
    setFormPrice(plan.total_price.toString());
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPlan(null);
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    
    const tiffins = parseInt(formTiffins);
    const price = parseFloat(formPrice);

    if (editingPlan) {
      const res = await updateSubscriptionPlan(editingPlan.id, formName, tiffins, price);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setPlans(plans.map(p => p.id === editingPlan.id ? res.data! : p));
        closeModal();
      }
    } else {
      const res = await createSubscriptionPlan(formName, tiffins, price);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setPlans([...plans, res.data]);
        closeModal();
      }
    }
    
    setLoading(false);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Are you sure you want to delete this plan?")) return;
    
    setLoading(true);
    setError(null);
    
    const res = await deleteSubscriptionPlan(id);
    if (res.error) {
      setError(`Deletion failed: ${res.error}`);
    } else {
      setPlans(plans.filter(p => p.id !== id));
      setError(null);
    }
    
    setLoading(false);
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div className="page-hero-copy">
          <p className="page-eyebrow">Inventory & Pricing</p>
          <h1 className="page-title">Manage Subscription Plans</h1>
          <p className="page-copy">
            Create and modify the pre-defined meal combos that you can assign to customers during onboarding.
          </p>
        </div>
        <div className="hero-chip-row">
          <button className="btn-primary" onClick={openNewModal}>Add New Plan</button>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const perTiffinRate = (plan.total_price - plan.delivery_charge) / plan.tiffin_count;
          
          return (
            <div key={plan.id} className="panel flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <span className="text-3xl font-black">{formatINR(plan.total_price)}</span>
                    <span className="text-sm text-gray-500 ml-2">Total</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-lg">{plan.tiffin_count}</span>
                    <span className="text-sm text-gray-500 block">Tiffins</span>
                  </div>
                </div>
                
                <div className="space-y-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Includes Delivery Charge</span>
                    <span className="font-medium">{formatINR(plan.delivery_charge)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Effective Per Tiffin Rate</span>
                    <span className="font-bold text-[var(--accent)]">{formatINR(perTiffinRate)}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-8">
                <button className="btn-secondary flex-1" onClick={() => openEditModal(plan)} disabled={loading}>Modify</button>
                <button className="btn-danger flex-1" onClick={() => handleDelete(plan.id)} disabled={loading}>Delete</button>
              </div>
            </div>
          );
        })}
        
        {plans.length === 0 && (
          <div className="col-span-full panel text-center py-12">
            <h3 className="text-lg font-bold mb-2">No Plans Created Yet</h3>
            <p className="text-gray-500 mb-6">Create predefined meal plans to quickly assign to your customers.</p>
            <button className="btn-primary inline-flex" onClick={openNewModal}>Create First Plan</button>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-[24px] w-full max-w-md shadow-2xl overflow-hidden" style={{ background: "var(--surface)" }}>
            <div className="p-6 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-xl font-bold">{editingPlan ? "Modify Plan" : "Create New Plan"}</h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="field">
                <label className="field-label">Plan Name</label>
                <input 
                  type="text" 
                  className="text-input" 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                  placeholder="e.g. Monthly Veg Combo"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="field">
                  <label className="field-label">Number of Tiffins</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={formTiffins} 
                    onChange={(e) => setFormTiffins(e.target.value)} 
                    placeholder="e.g. 30"
                  />
                </div>
                
                <div className="field">
                  <label className="field-label">Total Price (₹)</label>
                  <input 
                    type="number" 
                    className="text-input" 
                    value={formPrice} 
                    onChange={(e) => setFormPrice(e.target.value)} 
                    placeholder="e.g. 3600"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Note: A fixed delivery charge of ₹40 is automatically applied to all plans. The per-tiffin rate will be calculated as (Total Price - 40) / Tiffins.
              </p>
            </div>
            
            <div className="p-6 border-t flex gap-3" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.4)" }}>
              <button className="btn-secondary flex-1" onClick={closeModal} disabled={loading}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleSave} disabled={loading || !formName || !formTiffins || !formPrice}>Save Plan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
