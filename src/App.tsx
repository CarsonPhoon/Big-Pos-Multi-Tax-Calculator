/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, KeyboardEvent } from 'react';
import { Settings, Calculator, Receipt, Info, ChevronRight, ChevronLeft, X, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type CalculationMode = 'inclusive' | 'exclusive';

interface Item {
  id: string;
  name: string;
  price: number;
  quantity: number;
  taxRate: number;
  isTakeAway: boolean;
  applySurcharge: boolean;
  isWeight: boolean;
}

export default function App() {
  // Main Inputs for current item
  const [price, setPrice] = useState<number>(11);
  const [quantity, setQuantity] = useState<string>('1');
  const [taxRate, setTaxRate] = useState<number>(10);
  
  // List of items
  const [items, setItems] = useState<Item[]>([]);
  
  // Settings
  const [surchargeRate, setSurchargeRate] = useState<number>(10);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(10);
  const [serviceTaxRate, setServiceTaxRate] = useState<number>(0);
  const [surchargeIncludesDiscount, setSurchargeIncludesDiscount] = useState<boolean>(true);
  const [serviceChargeIncludesDiscount, setServiceChargeIncludesDiscount] = useState<boolean>(true);
  const [showVoucherField, setShowVoucherField] = useState<boolean>(true);
  
  // Take Away Settings
  const [takeAwayType, setTakeAwayType] = useState<'perItem' | 'fullBill'>('perItem');
  const [takeAwayPrice, setTakeAwayPrice] = useState<number>(0.5);
  const [scOnTakeAwayItems, setScOnTakeAwayItems] = useState<boolean>(false);
  
  // Mode
  const [mode, setMode] = useState<CalculationMode>('inclusive');
  
  // Discount & Voucher State
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [voucherValue, setVoucherValue] = useState<number>(0);
  
  // UI State
  const [showSettings, setShowSettings] = useState(false);

  const addItem = () => {
    const qtyNum = parseFloat(quantity);
    if (price <= 0 || qtyNum <= 0 || isNaN(qtyNum)) return;
    const newItem: Item = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Item ${items.length + 1}`,
      price,
      quantity: qtyNum,
      taxRate,
      isTakeAway: false,
      applySurcharge: true,
      isWeight: quantity.includes('.'),
    };
    setItems([...items, newItem]);
    setPrice(0);
    setQuantity('1');
  };

  const clearAll = () => {
    setItems([]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      addItem();
    }
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const toggleTakeAway = (id: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, isTakeAway: !item.isTakeAway } : item
    ));
  };

  const toggleSurcharge = (id: string) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, applySurcharge: !item.applySurcharge } : item
    ));
  };

  // Calculations
  const results = useMemo(() => {
    let totalBaseSubtotal = 0;
    let totalSubtotalForDisplay = 0;
    let totalSurcharge = 0;
    let totalServiceCharge = 0;
    let totalServiceTax = 0;
    let totalGrandTotal = 0;
    let totalDiscountAmount = 0;
    let totalTakeAwayCharge = 0;
    
    // Group tax amounts by rate
    const taxByRate: { [rate: number]: number } = {};

    const surRateDec = surchargeRate / 100;
    const scRateDec = serviceChargeRate / 100;

    // First pass: calculate total base subtotal (including per-item TA charges)
    items.forEach(item => {
      const taQty = item.isWeight ? 1 : item.quantity;
      const itemTACharge = (takeAwayType === 'perItem' && item.isTakeAway) ? takeAwayPrice * taQty : 0;
      totalBaseSubtotal += (item.price * item.quantity) + itemTACharge;
    });

    // Calculate total discount (on base subtotal)
    if (discountType === 'percentage') {
      totalDiscountAmount = totalBaseSubtotal * (discountValue / 100);
    } else {
      totalDiscountAmount = Math.min(discountValue, totalBaseSubtotal);
    }

    // Calculate Take Away Charge (Full Bill mode)
    const hasAnyTakeAway = items.some(item => item.isTakeAway);
    if (takeAwayType === 'fullBill' && hasAnyTakeAway) {
      totalTakeAwayCharge = takeAwayPrice;
    }

    // Second pass: calculate per-item values
    items.forEach(item => {
      const taQty = item.isWeight ? 1 : item.quantity;
      const itemTAChargeNet = (takeAwayType === 'perItem' && item.isTakeAway) ? takeAwayPrice * taQty : 0;
      const itemBaseOnlySubtotal = item.price * item.quantity;
      const itemCombinedSubtotal = itemBaseOnlySubtotal + itemTAChargeNet;
      
      // Portion of discount for this item (on base price + TA charge)
      const itemDiscount = totalBaseSubtotal > 0 
        ? (itemCombinedSubtotal / totalBaseSubtotal) * totalDiscountAmount 
        : 0;
      
      // We apply the discount proportionally. 
      // To keep the logic consistent with previous surcharge/tax rules, 
      // we need to know how much discount applies to the base price vs the TA charge.
      const discountOnBase = itemCombinedSubtotal > 0 ? (itemBaseOnlySubtotal / itemCombinedSubtotal) * itemDiscount : 0;
      const discountOnTA = itemCombinedSubtotal > 0 ? (itemTAChargeNet / itemCombinedSubtotal) * itemDiscount : 0;

      const discountedBaseSubtotal = itemBaseOnlySubtotal - discountOnBase;
      const discountedTACharge = itemTAChargeNet - discountOnTA;
      
      let surcharge = 0;
      let taxAmount = 0;

      // Surcharge calculation (on base price + per-item TA charge) - only if applySurcharge is true
      if (item.applySurcharge) {
        const surchargeBase = surchargeIncludesDiscount ? discountedBaseSubtotal : itemBaseOnlySubtotal;
        const taFeeForSurcharge = (takeAwayType === 'perItem' && item.isTakeAway) 
          ? (surchargeIncludesDiscount ? discountedTACharge : itemTAChargeNet)
          : 0;
        
        // In inclusive mode, the TA charge is treated as net, but surcharge is usually on the gross?
        // Actually, previous logic for TA surcharge was:
        // (mode === 'inclusive' ? itemTAChargeNet * (1 + item.taxRate / 100) : itemTAChargeNet)
        // Let's stick to that but apply discount if needed.
        
        const taFeeBase = (mode === 'inclusive') 
          ? taFeeForSurcharge * (1 + item.taxRate / 100)
          : taFeeForSurcharge;

        surcharge = (surchargeBase + taFeeBase) * surRateDec;
      }

      if (mode === 'inclusive') {
        // Tax on base (inclusive)
        const taxOnBase = (discountedBaseSubtotal + surcharge) * (item.taxRate / (100 + item.taxRate));
        // Tax on TA (exclusive)
        const taxOnTA = discountedTACharge * (item.taxRate / 100);
        taxAmount = taxOnBase + taxOnTA;
        
        // Subtotal for display includes integrated TA charge (inclusive of its tax)
        totalSubtotalForDisplay += itemBaseOnlySubtotal + (itemTAChargeNet * (1 + item.taxRate / 100));
      } else {
        // Tax on base + TA (both exclusive)
        taxAmount = (discountedBaseSubtotal + surcharge + discountedTACharge) * (item.taxRate / 100);
        
        // Subtotal for display includes integrated TA charge (net)
        totalSubtotalForDisplay += itemBaseOnlySubtotal + itemTAChargeNet;
      }

      totalSurcharge += surcharge;
      taxByRate[item.taxRate] = (taxByRate[item.taxRate] || 0) + taxAmount;
    });

    const totalTax = Object.values(taxByRate).reduce((a, b) => a + (b as number), 0);
    
    // Service charge calculation
    // 1. Determine base items for service charge (excludes TA charges and Surcharge)
    let scBaseTotal = 0;
    let scBaseTax = 0;

    items.forEach(item => {
      // Check if we should calculate SC for this item
      if (scOnTakeAwayItems || !item.isTakeAway) {
        const taQty = item.isWeight ? 1 : item.quantity;
        const itemTAChargeNet = (takeAwayType === 'perItem' && item.isTakeAway) ? takeAwayPrice * taQty : 0;
        const itemBaseOnlySubtotal = item.price * item.quantity;
        const itemCombinedSubtotal = itemBaseOnlySubtotal + itemTAChargeNet;

        const itemDiscount = totalBaseSubtotal > 0 ? (itemCombinedSubtotal / totalBaseSubtotal) * totalDiscountAmount : 0;
        const discountOnBase = itemCombinedSubtotal > 0 ? (itemBaseOnlySubtotal / itemCombinedSubtotal) * itemDiscount : 0;
        
        const discountedBaseSubtotal = itemBaseOnlySubtotal - discountOnBase;

        // Base amount for service charge (respects discount setting but EXCLUDES surcharge)
        const baseAmount = serviceChargeIncludesDiscount ? discountedBaseSubtotal : itemBaseOnlySubtotal;
        
        // Include TA charge if enabled and it's per-item
        // If SC is on TA items, we also need to decide if the TA part of the discount applies to SC
        const scTACharge = (scOnTakeAwayItems && takeAwayType === 'perItem' && item.isTakeAway) 
          ? (serviceChargeIncludesDiscount ? (itemTAChargeNet - (itemCombinedSubtotal > 0 ? (itemTAChargeNet / itemCombinedSubtotal) * itemDiscount : 0)) : itemTAChargeNet)
          : 0;
        
        scBaseTotal += baseAmount + scTACharge;

        // Calculate tax for this item to subtract if inclusive
        if (mode === 'inclusive') {
          let itemSurcharge = 0;
          if (item.applySurcharge) {
            const surchargeBase = surchargeIncludesDiscount ? discountedBaseSubtotal : itemBaseOnlySubtotal;
            const discountOnTA = itemCombinedSubtotal > 0 ? (itemTAChargeNet / itemCombinedSubtotal) * itemDiscount : 0;
            const discountedTACharge = itemTAChargeNet - discountOnTA;
            const taFeeForSurcharge = (takeAwayType === 'perItem' && item.isTakeAway) 
              ? (surchargeIncludesDiscount ? discountedTACharge : itemTAChargeNet)
              : 0;
            const taFeeBase = (mode === 'inclusive') 
              ? taFeeForSurcharge * (1 + item.taxRate / 100)
              : taFeeForSurcharge;
            itemSurcharge = (surchargeBase + taFeeBase) * surRateDec;
          }
          // The tax to subtract is the tax on (Subtotal + Surcharge) if surcharge is applied
          const taxAmount = (discountedBaseSubtotal + itemSurcharge) * (item.taxRate / (100 + item.taxRate));
          scBaseTax += taxAmount;
        }
      }
    });

    const serviceChargeBase = mode === 'inclusive' 
      ? (scBaseTotal - scBaseTax) 
      : scBaseTotal;
    
    const rawServiceCharge = serviceChargeBase * scRateDec;
    totalServiceCharge = Math.round(rawServiceCharge * 100) / 100;
    totalServiceTax = totalServiceCharge * (serviceTaxRate / 100);

    // Calculate Grand Total
    totalGrandTotal = totalSubtotalForDisplay - totalDiscountAmount + totalSurcharge + totalServiceCharge + totalServiceTax + totalTakeAwayCharge + (mode === 'exclusive' ? totalTax : 0) - voucherValue;

    return {
      subtotal: totalSubtotalForDisplay,
      discountAmount: totalDiscountAmount,
      surcharge: totalSurcharge,
      taxByRate,
      serviceCharge: totalServiceCharge,
      serviceTax: totalServiceTax,
      takeAwayCharge: totalTakeAwayCharge,
      grandTotal: totalGrandTotal
    };
  }, [items, surchargeRate, serviceChargeRate, serviceTaxRate, mode, discountType, discountValue, voucherValue, surchargeIncludesDiscount, serviceChargeIncludesDiscount, takeAwayType, takeAwayPrice, scOnTakeAwayItems]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4 font-sans text-[#1a252f]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden relative"
      >
        {/* Header */}
        <div className="bg-white p-6 border-b border-gray-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-2 rounded-lg text-white">
              <Calculator size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">POS Calculator</h1>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="p-6 pb-0">
          <div className="bg-gray-100 p-1 rounded-xl flex relative">
            <motion.div
              className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm z-0"
              animate={{
                left: mode === 'inclusive' ? '4px' : '50%',
                right: mode === 'inclusive' ? '50%' : '4px',
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            <button
              onClick={() => setMode('inclusive')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg relative z-10 transition-colors ${
                mode === 'inclusive' ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              Tax Inclusive
            </button>
            <button
              onClick={() => setMode('exclusive')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg relative z-10 transition-colors ${
                mode === 'exclusive' ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              Tax Exclusive
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {mode === 'inclusive' ? 'Price (Inc. Tax)' : 'Price (Exc. Tax)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={price || ''}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  onKeyDown={handleKeyDown}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Quantity</label>
              <input
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                    setQuantity(val);
                  }
                }}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                placeholder="1"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Tax Rate (%)</label>
              <div className="relative">
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  onKeyDown={handleKeyDown}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full pl-4 pr-8 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-medium"
                  placeholder="10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">%</span>
              </div>
            </div>
            <div className="flex items-end">
              <button
                onClick={addItem}
                disabled={price <= 0 || quantity <= 0}
                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-bold px-6 h-[50px]"
              >
                <Plus size={20} />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>

        {/* Item List */}
        <AnimatePresence>
          {items.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-4"
            >
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-gray-400">
                    <ShoppingBag size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Cart ({items.length})</span>
                  </div>
                  <button 
                    onClick={clearAll}
                    className="flex items-center gap-1 text-red-400 hover:text-red-600 transition-colors"
                    title="Clear All Items"
                  >
                    <Trash2 size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Clear All</span>
                  </button>
                </div>
                {items.map((item) => (
                  <motion.div 
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100 shadow-sm"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-700">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-medium">
                          {item.quantity} x {formatCurrency(item.price + (item.isTakeAway && takeAwayType === 'perItem' ? (takeAwayPrice * (item.isWeight ? 1/item.quantity : 1) * (mode === 'inclusive' ? (1 + item.taxRate/100) : 1)) : 0))}
                        </span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold">
                          {item.taxRate}% Tax
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleSurcharge(item.id)}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                          item.applySurcharge ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title="Toggle Surcharge"
                      >
                        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${
                          item.applySurcharge ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                        }`}>
                          {item.applySurcharge && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-tighter">SUR</span>
                      </button>
                      <button
                        onClick={() => toggleTakeAway(item.id)}
                        className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                          item.isTakeAway ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                        title="Toggle Take Away"
                      >
                        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-colors ${
                          item.isTakeAway ? 'border-orange-600 bg-orange-600' : 'border-gray-300'
                        }`}>
                          {item.isTakeAway && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-tighter">TA</span>
                      </button>
                      <span className="font-mono font-bold text-sm">{formatCurrency((item.price * item.quantity) + ((item.isTakeAway && takeAwayType === 'perItem' ? (takeAwayPrice * (item.isWeight ? 1 : item.quantity) * (mode === 'inclusive' ? (1 + item.taxRate/100) : 1)) : 0)))}</span>
                      <button 
                        onClick={() => removeItem(item.id)}
                        className="text-red-400 hover:text-red-600 p-1 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Discount Section */}
        <div className="px-6 pb-4 space-y-4">
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Bill Discount</label>
              <div className="flex bg-white p-0.5 rounded-lg border border-gray-200">
                <button
                  onClick={() => setDiscountType('percentage')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                    discountType === 'percentage' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  %
                </button>
                <button
                  onClick={() => setDiscountType('fixed')}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                    discountType === 'fixed' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  $
                </button>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                {discountType === 'percentage' ? '%' : '$'}
              </span>
              <input
                type="number"
                value={discountValue || ''}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-sm"
                placeholder="0"
              />
            </div>
          </div>

          {showVoucherField && (
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Voucher Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                <input
                  type="number"
                  value={voucherValue || ''}
                  onChange={(e) => setVoucherValue(Number(e.target.value))}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>

        {/* Receipt Section */}
        <div className="px-6 pb-8">
          <div className="bg-[#fdfdfd] border-2 border-dashed border-gray-200 rounded-2xl p-6 relative">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#f0f2f5] rounded-full border-r-2 border-dashed border-gray-200" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#f0f2f5] rounded-full border-l-2 border-dashed border-gray-200" />
            
            <div className="flex items-center gap-2 mb-4 text-gray-400">
              <Receipt size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Summary</span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Subtotal</span>
                <span className="font-mono font-medium">{formatCurrency(results.subtotal)}</span>
              </div>
              {results.discountAmount > 0 && (
                <div className="flex justify-between items-center text-red-500">
                  <span className="text-sm">Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span>
                  <span className="font-mono font-medium">-{formatCurrency(results.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Surcharge ({surchargeRate}%)</span>
                <span className="font-mono font-medium">{formatCurrency(results.surcharge)}</span>
              </div>

              {takeAwayType === 'fullBill' && results.takeAwayCharge > 0 && (
                <div className="flex justify-between items-center text-orange-600">
                  <span className="text-sm">Take Away Charge</span>
                  <span className="font-mono font-medium">{formatCurrency(results.takeAwayCharge)}</span>
                </div>
              )}
              
              {/* Dynamic Tax Rows */}
              {Object.entries(results.taxByRate).sort((a, b) => Number(a[0]) - Number(b[0])).map(([rate, amount]) => (
                <div key={rate} className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">
                    {mode === 'inclusive' ? 'Tax Inclusive' : 'Tax Exclusive'} ({rate}%)
                  </span>
                  <span className="font-mono font-medium">{formatCurrency(amount as number)}</span>
                </div>
              ))}

              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">Service Charge ({serviceChargeRate}%)</span>
                <span className="font-mono font-medium">{formatCurrency(results.serviceCharge)}</span>
              </div>

              {results.serviceTax > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Service Tax ({serviceTaxRate}%)</span>
                  <span className="font-mono font-medium">{formatCurrency(results.serviceTax)}</span>
                </div>
              )}

              {voucherValue > 0 && (
                <div className="flex justify-between items-center text-green-600">
                  <span className="text-sm">Voucher</span>
                  <span className="font-mono font-medium">-{formatCurrency(voucherValue)}</span>
                </div>
              )}
              
              <div className="pt-4 mt-2 border-t border-gray-100 flex justify-between items-end">
                <span className="font-bold text-gray-800">Grand Total</span>
                <span className="text-2xl font-black text-blue-600 font-mono">
                  {formatCurrency(results.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="px-6 pb-6">
          <div className="bg-blue-50 p-3 rounded-xl flex gap-3 items-start">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 leading-relaxed">
              {mode === 'inclusive' 
                ? "Tax is already included in the product price. Service charge is calculated on the price before tax."
                : "Tax is added on top of the subtotal and surcharge. Service charge is calculated on the base subtotal."}
            </p>
          </div>
        </div>

        {/* Settings Modal */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold">Settings</h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600">Default Surcharge Rate (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={surchargeRate}
                        onChange={(e) => setSurchargeRate(Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600">Default Service Charge Rate (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={serviceChargeRate}
                        onChange={(e) => setServiceChargeRate(Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-600">Service Tax Rate (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={serviceTaxRate}
                        onChange={(e) => setServiceTaxRate(Number(e.target.value))}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-semibold text-gray-700">Surcharge includes Discount</label>
                        <p className="text-[10px] text-gray-400">Calculate surcharge on discounted price</p>
                      </div>
                      <button
                        onClick={() => setSurchargeIncludesDiscount(!surchargeIncludesDiscount)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          surchargeIncludesDiscount ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <motion.div
                          animate={{ x: surchargeIncludesDiscount ? 22 : 2 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-semibold text-gray-700">Service Charge includes Discount</label>
                        <p className="text-[10px] text-gray-400">Calculate service charge on discounted price</p>
                      </div>
                      <button
                        onClick={() => setServiceChargeIncludesDiscount(!serviceChargeIncludesDiscount)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          serviceChargeIncludesDiscount ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <motion.div
                          animate={{ x: serviceChargeIncludesDiscount ? 22 : 2 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-semibold text-gray-700">Show Voucher Field</label>
                        <p className="text-[10px] text-gray-400">Display voucher input in main screen</p>
                      </div>
                      <button
                        onClick={() => setShowVoucherField(!showVoucherField)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          showVoucherField ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <motion.div
                          animate={{ x: showVoucherField ? 22 : 2 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <h3 className="font-bold text-gray-900">Take Away Settings</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600">Charge Type</label>
                        <select
                          value={takeAwayType}
                          onChange={(e) => setTakeAwayType(e.target.value as 'perItem' | 'fullBill')}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        >
                          <option value="perItem">Per Item</option>
                          <option value="fullBill">Full Bill</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-600">Charge Price</label>
                        <input
                          type="number"
                          step="0.1"
                          value={takeAwayPrice}
                          onChange={(e) => setTakeAwayPrice(Number(e.target.value))}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-semibold text-gray-700">Service Charge on TA Items</label>
                        <p className="text-[10px] text-gray-400">Apply service charge to take away items</p>
                      </div>
                      <button
                        onClick={() => setScOnTakeAwayItems(!scOnTakeAwayItems)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${
                          scOnTakeAwayItems ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <motion.div
                          animate={{ x: scOnTakeAwayItems ? 22 : 2 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-sm"
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
