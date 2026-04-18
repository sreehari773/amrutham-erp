"use client";

import { useState, useEffect } from "react";
import { getCustomerProfile, updateCustomerProfile } from "@/app/actions/customerProfile";
import { customerLogout } from "@/app/actions/customerAuth";

type CustomerProfile = {
  name?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  address?: string | null;
  saved_addresses?: string[];
};

export default function MobileProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState(""); // readonly
  const [altPhone, setAltPhone] = useState("");
  const [primaryAddress, setPrimaryAddress] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  
  const [newAddressRaw, setNewAddressRaw] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    getCustomerProfile().then(res => {
      if (res.data) {
        const profile = res.data as CustomerProfile;
        setName(profile.name || "");
        setPhone(profile.phone || "");
        setAltPhone(profile.secondary_phone || "");
        setPrimaryAddress(profile.address || "");
        setSavedAddresses(profile.saved_addresses || []);
      }
      setLoading(false);
    });
  }, []);

  async function handleSaveBasicDetails() {
    setSaving(true);
    setError(null);
    setSuccessMsg("");
    
    const res = await updateCustomerProfile({
      name,
      secondary_phone: altPhone,
      address: primaryAddress
    });
    
    if (res.error) setError(res.error);
    else setSuccessMsg("Profile details saved!");
    setSaving(false);
  }

  async function handleAddAddress() {
    if (!newAddressRaw.trim()) return;
    const newList = [...savedAddresses, newAddressRaw.trim()];
    setSavedAddresses(newList);
    setNewAddressRaw("");
    setShowAddModal(false);
    
    await updateCustomerProfile({ saved_addresses: newList });
  }

  async function handleRemoveAddress(index: number) {
    const newList = savedAddresses.filter((_, i) => i !== index);
    setSavedAddresses(newList);
    await updateCustomerProfile({ saved_addresses: newList });
  }

  async function handleLogout() {
    if (confirm("Are you sure you want to log out?")) {
      await customerLogout();
      window.location.href = "/login";
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading profile...</div>;

  return (
    <div className="animate-in fade-in duration-500 pb-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black">My Profile</h1>
        <button onClick={handleLogout} className="text-sm font-bold text-slate-400 p-2 active:scale-95">Log Out</button>
      </div>

      {(error || successMsg) && (
        <div className={`p-3 rounded-lg text-sm mb-6 border ${error ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
          {error || successMsg}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
        <h3 className="font-bold text-slate-800 mb-4">Personal Details</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
            <input 
              type="text" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-slate-50"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Primary Phone (Login ID)</label>
            <input 
              type="text" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
              value={phone}
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alternative Phone (Optional)</label>
            <input 
              type="tel" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-slate-50"
              value={altPhone}
              onChange={e => setAltPhone(e.target.value)}
              placeholder="e.g. +91 888..."
            />
          </div>
        </div>

        <button 
          onClick={handleSaveBasicDetails}
          disabled={saving}
          className="w-full mt-6 py-3 bg-[var(--accent)] text-white font-bold rounded-xl active:scale-95 transition-all text-sm shadow-md disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Details"}
        </button>
      </div>

      {/* Address Management */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">Delivery Addresses</h3>
          <button onClick={() => setShowAddModal(true)} className="text-[var(--accent)] font-bold text-sm bg-orange-50 px-3 py-1.5 rounded-lg active:scale-95">
            + Add New
          </button>
        </div>

        <div className="space-y-4">
          {/* Default Address */}
          <div className="p-4 rounded-2xl border-2 border-[var(--accent)] bg-orange-50/30">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-black text-[var(--accent)] uppercase tracking-widest">Primary Default</span>
            </div>
            <textarea 
              className="w-full p-0 bg-transparent border-none focus:outline-none focus:ring-0 text-sm font-medium text-slate-800 resize-none h-16"
              value={primaryAddress}
              onChange={e => setPrimaryAddress(e.target.value)}
              placeholder="Enter your main delivery address..."
            />
            <button onClick={handleSaveBasicDetails} className="text-xs text-[var(--accent)] font-bold uppercase tracking-wider">Save Default</button>
          </div>

          {/* Additional Addresses */}
          {savedAddresses.map((addr, i) => (
            <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white relative pr-10">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">Alternative {i + 1}</span>
               <p className="text-sm text-slate-700 leading-relaxed">{addr}</p>
               <button 
                 onClick={() => handleRemoveAddress(i)}
                 className="absolute top-4 right-4 w-6 h-6 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center active:scale-95"
               >
                 &times;
               </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Address Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-[24px] w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-bold text-lg mb-4">Add Alternative Address</h3>
            <textarea 
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-slate-50 mb-4 h-24 resize-none text-sm leading-relaxed"
              placeholder="Building, Street, Landmark..."
              value={newAddressRaw}
              onChange={e => setNewAddressRaw(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 font-bold text-slate-500 bg-slate-100 rounded-xl active:scale-95">Cancel</button>
              <button onClick={handleAddAddress} disabled={!newAddressRaw.trim()} className="flex-1 py-3 font-bold text-white bg-[var(--accent)] rounded-xl active:scale-95 disabled:opacity-50">Add Address</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
