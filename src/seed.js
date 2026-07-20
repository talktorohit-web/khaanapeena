import { uid } from './utils.js'

const CATS = [
  { id: 'c_starters', name: 'Starters', hi: 'स्टार्टर', pa: 'ਸਟਾਰਟਰ' },
  { id: 'c_main', name: 'Main Course', hi: 'मुख्य व्यंजन', pa: 'ਮੁੱਖ ਕੋਰਸ' },
  { id: 'c_breads', name: 'Breads & Rice', hi: 'रोटी और चावल', pa: 'ਰੋਟੀ ਤੇ ਚੌਲ' },
  { id: 'c_south', name: 'South Indian', hi: 'साउथ इंडियन', pa: 'ਸਾਊਥ ਇੰਡੀਅਨ' },
  { id: 'c_chinese', name: 'Chinese', hi: 'चाइनीज़', pa: 'ਚਾਈਨੀਜ਼' },
  { id: 'c_bev', name: 'Beverages', hi: 'पेय', pa: 'ਪੀਣ ਵਾਲੇ' },
  { id: 'c_desserts', name: 'Desserts', hi: 'मिठाई', pa: 'ਮਿਠਾਈ' },
]

// station: kitchen | tandoor | chinese | beverage
const ITEMS = [
  ['i01', 'c_starters', 'Paneer Tikka', 'पनीर टिक्का', 260, true, 'tandoor'],
  ['i02', 'c_starters', 'Chicken Tikka', 'चिकन टिक्का', 320, false, 'tandoor'],
  ['i03', 'c_starters', 'Veg Spring Roll', 'वेज स्प्रिंग रोल', 180, true, 'chinese'],
  ['i04', 'c_starters', 'Chilli Paneer', 'चिली पनीर', 240, true, 'chinese'],
  ['i05', 'c_starters', 'Tandoori Chicken (Half)', 'तंदूरी चिकन (हाफ)', 340, false, 'tandoor'],
  ['i06', 'c_main', 'Dal Makhani', 'दाल मखनी', 220, true, 'kitchen'],
  ['i07', 'c_main', 'Shahi Paneer', 'शाही पनीर', 260, true, 'kitchen'],
  ['i08', 'c_main', 'Butter Chicken', 'बटर चिकन', 360, false, 'kitchen'],
  ['i09', 'c_main', 'Kadai Paneer', 'कड़ाही पनीर', 250, true, 'kitchen'],
  ['i10', 'c_main', 'Chicken Curry', 'चिकन करी', 300, false, 'kitchen'],
  ['i11', 'c_main', 'Palak Paneer', 'पालक पनीर', 240, true, 'kitchen'],
  ['i12', 'c_main', 'Chole Masala', 'छोले मसाला', 190, true, 'kitchen'],
  ['i13', 'c_breads', 'Butter Naan', 'बटर नान', 55, true, 'tandoor'],
  ['i14', 'c_breads', 'Garlic Naan', 'गार्लिक नान', 70, true, 'tandoor'],
  ['i15', 'c_breads', 'Tandoori Roti', 'तंदूरी रोटी', 25, true, 'tandoor'],
  ['i16', 'c_breads', 'Laccha Paratha', 'लच्छा पराठा', 60, true, 'tandoor'],
  ['i17', 'c_breads', 'Jeera Rice', 'जीरा राइस', 160, true, 'kitchen'],
  ['i18', 'c_breads', 'Veg Biryani', 'वेज बिरयानी', 220, true, 'kitchen'],
  ['i19', 'c_breads', 'Chicken Biryani', 'चिकन बिरयानी', 290, false, 'kitchen'],
  ['i20', 'c_south', 'Masala Dosa', 'मसाला डोसा', 140, true, 'kitchen'],
  ['i21', 'c_south', 'Idli Sambar (2 pc)', 'इडली सांभर', 90, true, 'kitchen'],
  ['i22', 'c_south', 'Uttapam', 'उत्तपम', 130, true, 'kitchen'],
  ['i23', 'c_chinese', 'Veg Hakka Noodles', 'वेज हक्का नूडल्स', 180, true, 'chinese'],
  ['i24', 'c_chinese', 'Chicken Fried Rice', 'चिकन फ्राइड राइस', 220, false, 'chinese'],
  ['i25', 'c_chinese', 'Veg Manchurian', 'वेज मंचूरियन', 200, true, 'chinese'],
  ['i26', 'c_bev', 'Masala Chai', 'मसाला चाय', 40, true, 'beverage'],
  ['i27', 'c_bev', 'Sweet Lassi', 'मीठी लस्सी', 90, true, 'beverage'],
  ['i28', 'c_bev', 'Fresh Lime Soda', 'फ्रेश लाइम सोडा', 70, true, 'beverage'],
  ['i29', 'c_bev', 'Cold Coffee', 'कोल्ड कॉफ़ी', 120, true, 'beverage'],
  ['i30', 'c_bev', 'Mineral Water', 'मिनरल वाटर', 25, true, 'beverage'],
  ['i31', 'c_desserts', 'Gulab Jamun (2 pc)', 'गुलाब जामुन', 90, true, 'kitchen'],
  ['i32', 'c_desserts', 'Rasmalai (2 pc)', 'रसमलाई', 110, true, 'kitchen'],
  ['i33', 'c_desserts', 'Ice Cream Scoop', 'आइसक्रीम स्कूप', 80, true, 'beverage'],
]

const INGREDIENTS = [
  ['g01', 'Paneer', 'kg', 12, 5, 320],
  ['g02', 'Chicken', 'kg', 18, 8, 220],
  ['g03', 'Atta (Wheat Flour)', 'kg', 40, 15, 38],
  ['g04', 'Maida', 'kg', 25, 10, 42],
  ['g05', 'Basmati Rice', 'kg', 35, 12, 110],
  ['g06', 'Butter', 'kg', 8, 4, 480],
  ['g07', 'Cream', 'ltr', 6, 3, 260],
  ['g08', 'Tomato', 'kg', 22, 10, 40],
  ['g09', 'Onion', 'kg', 30, 12, 35],
  ['g10', 'Cooking Oil', 'ltr', 20, 8, 140],
  ['g11', 'Milk', 'ltr', 15, 8, 58],
  ['g12', 'Dal (Urad)', 'kg', 14, 6, 130],
  ['g13', 'Noodles', 'kg', 10, 4, 90],
  ['g14', 'Masala Mix', 'kg', 5, 2, 400],
  ['g15', 'LPG Cylinder', 'unit', 3, 1, 1100],
]

// recipes: rough per-plate consumption for auto-deduction
const RECIPES = {
  i01: [['g01', 0.15], ['g14', 0.01]], i02: [['g02', 0.2], ['g14', 0.01]],
  i04: [['g01', 0.12], ['g10', 0.03]], i05: [['g02', 0.35], ['g14', 0.015]],
  i06: [['g12', 0.1], ['g06', 0.03], ['g07', 0.03]], i07: [['g01', 0.15], ['g07', 0.05], ['g08', 0.1]],
  i08: [['g02', 0.22], ['g06', 0.04], ['g07', 0.05], ['g08', 0.12]],
  i09: [['g01', 0.15], ['g08', 0.1], ['g09', 0.08]], i10: [['g02', 0.22], ['g09', 0.1], ['g08', 0.1]],
  i11: [['g01', 0.12]], i12: [['g14', 0.01], ['g09', 0.08]],
  i13: [['g04', 0.08], ['g06', 0.01]], i14: [['g04', 0.08], ['g06', 0.015]],
  i15: [['g03', 0.06]], i16: [['g03', 0.08], ['g10', 0.02]],
  i17: [['g05', 0.12]], i18: [['g05', 0.15], ['g14', 0.01]], i19: [['g05', 0.15], ['g02', 0.15], ['g14', 0.012]],
  i20: [['g05', 0.08], ['g10', 0.02]], i23: [['g13', 0.15], ['g10', 0.03]],
  i24: [['g05', 0.12], ['g02', 0.1]], i25: [['g04', 0.06], ['g09', 0.08], ['g10', 0.04]],
  i26: [['g11', 0.1], ['g14', 0.002]], i27: [['g11', 0.25]], i29: [['g11', 0.2]],
}

const TABLES = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: 'T' + (i + 1), name: 'T' + (i + 1), seats: 4, area: 'Main Hall' })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: 'F' + (i + 1), name: 'F' + (i + 1), seats: 6, area: 'Family' })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: 'O' + (i + 1), name: 'O' + (i + 1), seats: 2, area: 'Outdoor' })),
]

const CUSTOMERS = [
  ['Rahul Sharma', '9876500001', '1992-11-04'],
  ['Priya Verma', '9876500002', '1995-08-21'],
  ['Amit Singh', '9876500003', '1988-03-15'],
  ['Simran Kaur', '9876500004', '1997-07-28'],
  ['Vikas Gupta', '9876500005', '1990-01-09'],
  ['Neha Joshi', '9876500006', '1994-12-02'],
  ['Harpreet Gill', '9876500007', '1986-09-17'],
  ['Sanjay Mehta', '9876500008', '1982-05-30'],
]

const STAFF = [
  { id: 's1', name: 'Ramesh Kumar', role: 'Manager', phone: '9811100001', pin: '1111', present: true },
  { id: 's2', name: 'Suresh Yadav', role: 'Cashier', phone: '9811100002', pin: '2222', present: true },
  { id: 's3', name: 'Deepak Chef', role: 'Head Chef', phone: '9811100003', pin: '3333', present: true },
  { id: 's4', name: 'Anita Devi', role: 'Waiter', phone: '9811100004', pin: '4444', present: true },
  { id: 's5', name: 'Mohan Lal', role: 'Waiter', phone: '9811100005', pin: '5555', present: false },
]

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function genHistory(items, customers) {
  const rnd = mulberry(42)
  const orders = []
  let billNo = 1
  const now = new Date()
  for (let d = 35; d >= 1; d--) {
    const day = new Date(now)
    day.setDate(day.getDate() - d)
    const dow = day.getDay()
    const weekendBoost = dow === 0 || dow === 6 ? 1.5 : 1
    const nOrders = Math.round((14 + rnd() * 10) * weekendBoost)
    for (let o = 0; o < nOrders; o++) {
      const lunch = rnd() < 0.45
      const hour = lunch ? 12 + Math.floor(rnd() * 3) : 19 + Math.floor(rnd() * 3)
      const ts = new Date(day)
      ts.setHours(hour, Math.floor(rnd() * 59), 0, 0)
      const r = rnd()
      const type = r < 0.5 ? 'dine' : r < 0.65 ? 'takeaway' : r < 0.85 ? 'zomato' : 'swiggy'
      const nItems = 1 + Math.floor(rnd() * 4)
      const oItems = []
      for (let k = 0; k < nItems; k++) {
        // popularity skew: earlier menu items more popular
        const idx = Math.floor(Math.pow(rnd(), 1.6) * items.length)
        const it = items[idx]
        const existing = oItems.find((x) => x.itemId === it.id)
        if (existing) existing.qty++
        else oItems.push({ itemId: it.id, name: it.name, price: it.price, qty: 1 + (rnd() < 0.3 ? 1 : 0) })
      }
      const sub = oItems.reduce((s, x) => s + x.price * x.qty, 0)
      const method = type === 'zomato' || type === 'swiggy' ? 'online' : rnd() < 0.6 ? 'upi' : rnd() < 0.5 ? 'cash' : 'card'
      const cust = rnd() < 0.35 ? customers[Math.floor(rnd() * customers.length)] : null
      orders.push({
        id: uid('o'), billNo: billNo++, type,
        tableId: type === 'dine' ? TABLES[Math.floor(rnd() * TABLES.length)].id : null,
        items: oItems, status: 'paid',
        createdAt: ts.getTime(), kotAt: ts.getTime(), paidAt: ts.getTime() + 45 * 60000,
        customerId: cust ? cust.id : null,
        payment: { method, discount: 0, amount: Math.round(sub * 1.05) },
      })
      if (cust) {
        cust.visits++; cust.totalSpend += Math.round(sub * 1.05)
        cust.points += Math.floor(sub / 100); cust.lastVisit = ts.getTime()
      }
    }
  }
  return { orders, billNo }
}

export function makeSeed() {
  const items = ITEMS.map(([id, catId, name, hi, price, veg, station]) => ({
    id, catId, name, nameHi: hi, price, veg, station, available: true,
    recipe: (RECIPES[id] || []).map(([ingId, qty]) => ({ ingId, qty })),
  }))
  const customers = CUSTOMERS.map(([name, phone, birthday], i) => ({
    id: 'cu' + (i + 1), name, phone, birthday, points: 0, visits: 0, totalSpend: 0, lastVisit: null, tags: [],
  }))
  const { orders, billNo } = genHistory(items, customers)
  return {
    v: 1,
    settings: {
      name: 'Sharma Ji Da Dhaba', tagline: 'Since 1987', address: '12, GT Road, Jalandhar, Punjab 144001',
      phone: '0181-2223344', gstin: '03ABCDE1234F1Z5', fssai: '12123456789012',
      gstScheme: 'regular', gstRate: 5, serviceCharge: 0,
      upiId: 'sharmajidadhaba@okhdfcbank', lang: 'en',
      loyaltyEarnPer100: 1, loyaltyRedeemValue: 1,
      happyHour: { enabled: true, from: 15, to: 18, discountPct: 10 },
    },
    categories: CATS.map((c) => ({ id: c.id, name: c.name, nameHi: c.hi, namePa: c.pa })),
    items,
    ingredients: INGREDIENTS.map(([id, name, unit, stock, minStock, costPerUnit]) => ({ id, name, unit, stock, minStock, costPerUnit })),
    tables: TABLES,
    orders,
    customers,
    staff: STAFF,
    waste: [
      { id: uid('w'), date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), itemName: 'Dal Makhani (leftover)', qty: '2 kg', reason: 'Over-production', lossValue: 340 },
      { id: uid('w'), date: new Date(Date.now() - 1 * 864e5).toISOString().slice(0, 10), itemName: 'Tomatoes', qty: '3 kg', reason: 'Spoilage', lossValue: 120 },
    ],
    feedback: [
      { id: uid('f'), rating: 5, text: 'Butter chicken was amazing, best in Jalandhar!', sentiment: 'positive', date: Date.now() - 3 * 864e5 },
      { id: uid('f'), rating: 2, text: 'Service was slow, food came cold', sentiment: 'negative', date: Date.now() - 1 * 864e5 },
    ],
    counters: { billNo, kotNo: 1 },
  }
}
