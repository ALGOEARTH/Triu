'use strict';
/**
 * Unit tests for order calculation helpers (pricing, GST, discount logic).
 */

// ─── Order total helpers ──────────────────────────────────────────────────────

describe('Order pricing calculations', () => {
  function calculateOrderTotals(items) {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping  = subtotal > 1000 ? 0 : 50;
    const discount  = subtotal > 1000 ? Math.floor(subtotal * 0.05) : 0;
    const total     = subtotal + shipping - discount;
    return { subtotal, shipping, discount, total };
  }

  test('subtotal is sum of (price × quantity) for all items', () => {
    const items = [
      { price: 200, quantity: 2 },
      { price: 300, quantity: 1 },
    ];
    const { subtotal } = calculateOrderTotals(items);
    expect(subtotal).toBe(700);
  });

  test('shipping is ₹50 when subtotal ≤ 1000', () => {
    const items = [{ price: 200, quantity: 1 }];
    const { shipping } = calculateOrderTotals(items);
    expect(shipping).toBe(50);
  });

  test('shipping is free when subtotal > 1000', () => {
    const items = [{ price: 600, quantity: 2 }];
    const { shipping } = calculateOrderTotals(items);
    expect(shipping).toBe(0);
  });

  test('5% discount applies when subtotal > 1000', () => {
    const items = [{ price: 600, quantity: 2 }]; // subtotal = 1200
    const { discount } = calculateOrderTotals(items);
    expect(discount).toBe(Math.floor(1200 * 0.05)); // 60
  });

  test('no discount when subtotal ≤ 1000', () => {
    const items = [{ price: 200, quantity: 1 }];
    const { discount } = calculateOrderTotals(items);
    expect(discount).toBe(0);
  });

  test('total = subtotal + shipping − discount', () => {
    const items = [{ price: 600, quantity: 2 }]; // subtotal=1200, shipping=0, discount=60
    const { total, subtotal, shipping, discount } = calculateOrderTotals(items);
    expect(total).toBe(subtotal + shipping - discount);
  });
});

// ─── GST calculation helpers ──────────────────────────────────────────────────

describe('GST calculation helpers', () => {
  const GST_SLAB = {
    'Natural Products': 5,
    Books: 0,
    Stationery: 12,
    Electronics: 18,
    Fashion: 12,
    'Health & Beauty': 18,
    Other: 18,
  };

  function calcGst(taxableAmount, category, buyerState, sellerState = 'Delhi') {
    const rate    = GST_SLAB[category] ?? 18;
    const taxAmt  = +(taxableAmount * (rate / 100)).toFixed(2);
    const intra   = buyerState.toLowerCase() === sellerState.toLowerCase();
    return {
      gstRate: rate,
      taxable: taxableAmount,
      cgst:    intra ? +(taxAmt / 2).toFixed(2) : 0,
      sgst:    intra ? +(taxAmt / 2).toFixed(2) : 0,
      igst:    intra ? 0 : taxAmt,
      totalGst: taxAmt,
    };
  }

  test('intra-state transaction splits GST into CGST + SGST', () => {
    const result = calcGst(1000, 'Electronics', 'Delhi', 'Delhi');
    expect(result.cgst).toBeGreaterThan(0);
    expect(result.sgst).toBeGreaterThan(0);
    expect(result.igst).toBe(0);
    expect(result.cgst + result.sgst).toBeCloseTo(result.totalGst, 2);
  });

  test('inter-state transaction uses IGST only', () => {
    const result = calcGst(1000, 'Electronics', 'Maharashtra', 'Delhi');
    expect(result.igst).toBeGreaterThan(0);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBeCloseTo(result.totalGst, 2);
  });

  test('Books have 0% GST', () => {
    const result = calcGst(500, 'Books', 'Delhi');
    expect(result.gstRate).toBe(0);
    expect(result.totalGst).toBe(0);
  });

  test('Electronics have 18% GST', () => {
    const result = calcGst(1000, 'Electronics', 'Delhi');
    expect(result.gstRate).toBe(18);
    expect(result.totalGst).toBeCloseTo(180, 2);
  });

  test('unknown category defaults to 18%', () => {
    const result = calcGst(1000, 'SomeUnknownCategory', 'Delhi');
    expect(result.gstRate).toBe(18);
  });
});

// ─── Commission calculation ───────────────────────────────────────────────────

describe('Commission calculation', () => {
  function calcCommission(subtotal, ratePercent = 5) {
    return +(subtotal * (ratePercent / 100)).toFixed(2);
  }

  test('5% commission on ₹1000 is ₹50', () => {
    expect(calcCommission(1000, 5)).toBe(50);
  });

  test('commission is 0 when rate is 0', () => {
    expect(calcCommission(1000, 0)).toBe(0);
  });

  test('commission rounds to 2 decimal places', () => {
    const result = calcCommission(333, 7);
    expect(result).toBe(23.31);
  });
});
