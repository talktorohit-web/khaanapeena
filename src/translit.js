/**
 * Roman → Devanagari (Hindi) and Gurmukhi (Punjabi) for menu item names.
 *
 * HONEST WARNING: only the curated dictionary below is trustworthy. Everything
 * else falls through to a rule-based syllable engine that gets the *shape* of a
 * word right but cannot know whether a `t` is dental (त) or retroflex (ट), where
 * a long vowel really sits, or how a loan word is conventionally spelt. It is a
 * first draft to save the owner typing — the owner should read it and correct
 * anything that looks wrong before saving. Guests see this on the QR menu and
 * the kitchen sees it on the KOT, so a wrong spelling is a real embarrassment.
 *
 * The engine is shared: Devanagari and Gurmukhi differ only in their character
 * tables and in how consonant clusters are written (halant vs. bare/addak).
 */

// ---------------------------------------------------------------------------
// Curated dictionary — [Hindi, Punjabi]. These are the words a North Indian
// menu actually repeats, so getting them right covers most real item names.
// ---------------------------------------------------------------------------
const WORDS = {
  // proteins & mains
  paneer: ['पनीर', 'ਪਨੀਰ'],
  chicken: ['चिकन', 'ਚਿਕਨ'],
  mutton: ['मटन', 'ਮਟਨ'],
  fish: ['फिश', 'ਫਿਸ਼'],
  prawn: ['प्रॉन', 'ਪਰੌਨ'],
  egg: ['एग', 'ਐੱਗ'],
  anda: ['अंडा', 'ਆਂਡਾ'],
  chaap: ['चाप', 'ਚਾਪ'],
  soya: ['सोया', 'ਸੋਇਆ'],
  kofta: ['कोफ्ता', 'ਕੋਫਤਾ'],
  kabab: ['कबाब', 'ਕਬਾਬ'],
  kebab: ['कबाब', 'ਕਬਾਬ'],
  seekh: ['सीख', 'ਸੀਖ'],
  tikka: ['टिक्का', 'ਟਿੱਕਾ'],
  tikki: ['टिक्की', 'ਟਿੱਕੀ'],
  // vegetables & pulses
  aloo: ['आलू', 'ਆਲੂ'],
  gobi: ['गोभी', 'ਗੋਭੀ'],
  matar: ['मटर', 'ਮਟਰ'],
  mushroom: ['मशरूम', 'ਮਸ਼ਰੂਮ'],
  palak: ['पालक', 'ਪਾਲਕ'],
  bhindi: ['भिंडी', 'ਭਿੰਡੀ'],
  baingan: ['बैंगन', 'ਬੈਂਗਣ'],
  bharta: ['भर्ता', 'ਭਰਤਾ'],
  methi: ['मेथी', 'ਮੇਥੀ'],
  saag: ['साग', 'ਸਾਗ'],
  sarson: ['सरसों', 'ਸਰ੍ਹੋਂ'],
  chana: ['चना', 'ਚਨਾ'],
  chole: ['छोले', 'ਛੋਲੇ'],
  rajma: ['राजमा', 'ਰਾਜਮਾ'],
  dal: ['दाल', 'ਦਾਲ'],
  daal: ['दाल', 'ਦਾਲ'],
  makhani: ['मखनी', 'ਮੱਖਣੀ'],
  makhan: ['मक्खन', 'ਮੱਖਣ'],
  corn: ['कॉर्न', 'ਕੌਰਨ'],
  onion: ['प्याज़', 'ਪਿਆਜ਼'],
  tomato: ['टमाटर', 'ਟਮਾਟਰ'],
  // gravies & styles
  masala: ['मसाला', 'ਮਸਾਲਾ'],
  curry: ['करी', 'ਕਰੀ'],
  shahi: ['शाही', 'ਸ਼ਾਹੀ'],
  malai: ['मलाई', 'ਮਲਾਈ'],
  kadhai: ['कढ़ाई', 'ਕੜਾਹੀ'],
  kadai: ['कड़ाही', 'ਕੜਾਹੀ'],
  karahi: ['कड़ाही', 'ਕੜਾਹੀ'],
  kadhi: ['कढ़ी', 'ਕੜ੍ਹੀ'],
  tandoori: ['तंदूरी', 'ਤੰਦੂਰੀ'],
  achari: ['अचारी', 'ਅਚਾਰੀ'],
  afghani: ['अफ़गानी', 'ਅਫ਼ਗਾਨੀ'],
  reshmi: ['रेशमी', 'ਰੇਸ਼ਮੀ'],
  hariyali: ['हरियाली', 'ਹਰਿਆਲੀ'],
  handi: ['हांडी', 'ਹਾਂਡੀ'],
  dum: ['दम', 'ਦਮ'],
  tadka: ['तड़का', 'ਤੜਕਾ'],
  fry: ['फ्राई', 'ਫਰਾਈ'],
  roast: ['रोस्ट', 'ਰੋਸਟ'],
  shorba: ['शोरबा', 'ਸ਼ੋਰਬਾ'],
  tandoor: ['तंदूर', 'ਤੰਦੂਰ'],
  tawa: ['तवा', 'ਤਵਾ'],
  butter: ['बटर', 'ਬਟਰ'],
  cheese: ['चीज़', 'ਚੀਜ਼'],
  cream: ['क्रीम', 'ਕਰੀਮ'],
  ghee: ['घी', 'ਘਿਓ'],
  dahi: ['दही', 'ਦਹੀਂ'],
  curd: ['दही', 'ਦਹੀਂ'],
  raita: ['रायता', 'ਰਾਇਤਾ'],
  gravy: ['ग्रेवी', 'ਗਰੇਵੀ'],
  dry: ['ड्राई', 'ਡਰਾਈ'],
  fried: ['फ्राइड', 'ਫਰਾਈਡ'],
  grilled: ['ग्रिल्ड', 'ਗਰਿੱਲਡ'],
  crispy: ['क्रिस्पी', 'ਕਰਿਸਪੀ'],
  steam: ['स्टीम', 'ਸਟੀਮ'],
  // breads & rice
  roti: ['रोटी', 'ਰੋਟੀ'],
  naan: ['नान', 'ਨਾਨ'],
  kulcha: ['कुलचा', 'ਕੁਲਚਾ'],
  kulche: ['कुलचे', 'ਕੁਲਚੇ'],
  paratha: ['पराठा', 'ਪਰਾਂਠਾ'],
  parantha: ['पराठा', 'ਪਰਾਂਠਾ'],
  laccha: ['लच्छा', 'ਲੱਛਾ'],
  missi: ['मिस्सी', 'ਮਿੱਸੀ'],
  makki: ['मक्की', 'ਮੱਕੀ'],
  bhature: ['भटूरे', 'ਭਟੂਰੇ'],
  bhatura: ['भटूरा', 'ਭਟੂਰਾ'],
  poori: ['पूरी', 'ਪੂਰੀ'],
  puri: ['पूरी', 'ਪੂਰੀ'],
  kachori: ['कचौरी', 'ਕਚੌਰੀ'],
  poha: ['पोहा', 'ਪੋਹਾ'],
  upma: ['उपमा', 'ਉਪਮਾ'],
  papad: ['पापड़', 'ਪਾਪੜ'],
  bread: ['ब्रेड', 'ਬਰੈੱਡ'],
  toast: ['टोस्ट', 'ਟੋਸਟ'],
  rice: ['राइस', 'ਰਾਇਸ'],
  jeera: ['जीरा', 'ਜੀਰਾ'],
  biryani: ['बिरयानी', 'ਬਿਰਯਾਨੀ'],
  pulao: ['पुलाव', 'ਪੁਲਾਓ'],
  pulav: ['पुलाव', 'ਪੁਲਾਓ'],
  // south indian
  dosa: ['डोसा', 'ਡੋਸਾ'],
  idli: ['इडली', 'ਇਡਲੀ'],
  vada: ['वड़ा', 'ਵੜਾ'],
  sambar: ['सांभर', 'ਸਾਂਬਰ'],
  uttapam: ['उत्तपम', 'ਉੱਤਪਮ'],
  // chinese
  hakka: ['हक्का', 'ਹੱਕਾ'],
  noodles: ['नूडल्स', 'ਨੂਡਲਜ਼'],
  manchurian: ['मंचूरियन', 'ਮੰਚੂਰੀਅਨ'],
  chilli: ['चिली', 'ਚਿਲੀ'],
  chili: ['चिली', 'ਚਿਲੀ'],
  schezwan: ['शेज़वान', 'ਸ਼ੇਜ਼ਵਾਨ'],
  spring: ['स्प्रिंग', 'ਸਪਰਿੰਗ'],
  roll: ['रोल', 'ਰੋਲ'],
  momo: ['मोमो', 'ਮੋਮੋ'],
  momos: ['मोमोज़', 'ਮੋਮੋਜ਼'],
  chowmein: ['चाउमीन', 'ਚਾਓਮੀਨ'],
  lollipop: ['लॉलीपॉप', 'ਲੌਲੀਪੌਪ'],
  honey: ['हनी', 'ਹਨੀ'],
  garlic: ['गार्लिक', 'ਗਾਰਲਿਕ'],
  mocktail: ['मॉकटेल', 'ਮੌਕਟੇਲ'],
  soup: ['सूप', 'ਸੂਪ'],
  salad: ['सलाद', 'ਸਲਾਦ'],
  // chaat & snacks
  samosa: ['समोसा', 'ਸਮੋਸਾ'],
  pakora: ['पकौड़ा', 'ਪਕੌੜਾ'],
  bhaji: ['भाजी', 'ਭਾਜੀ'],
  pav: ['पाव', 'ਪਾਵ'],
  chaat: ['चाट', 'ਚਾਟ'],
  sandwich: ['सैंडविच', 'ਸੈਂਡਵਿਚ'],
  burger: ['बर्गर', 'ਬਰਗਰ'],
  pizza: ['पिज़्ज़ा', 'ਪੀਜ਼ਾ'],
  french: ['फ्रेंच', 'ਫਰੈਂਚ'],
  finger: ['फिंगर', 'ਫਿੰਗਰ'],
  omelette: ['ऑमलेट', 'ਆਮਲੇਟ'],
  namkeen: ['नमकीन', 'ਨਮਕੀਨ'],
  // drinks
  chai: ['चाय', 'ਚਾਹ'],
  tea: ['चाय', 'ਚਾਹ'],
  coffee: ['कॉफ़ी', 'ਕੌਫੀ'],
  lassi: ['लस्सी', 'ਲੱਸੀ'],
  shake: ['शेक', 'ਸ਼ੇਕ'],
  juice: ['जूस', 'ਜੂਸ'],
  soda: ['सोडा', 'ਸੋਡਾ'],
  lime: ['लाइम', 'ਲਾਈਮ'],
  lemon: ['लेमन', 'ਲੈਮਨ'],
  mango: ['मैंगो', 'ਮੈਂਗੋ'],
  banana: ['बनाना', 'ਬਨਾਨਾ'],
  water: ['वाटर', 'ਵਾਟਰ'],
  pani: ['पानी', 'ਪਾਣੀ'],
  mineral: ['मिनरल', 'ਮਿਨਰਲ'],
  milk: ['मिल्क', 'ਮਿਲਕ'],
  cold: ['कोल्ड', 'ਕੋਲਡ'],
  hot: ['हॉट', 'ਹੌਟ'],
  // sweets
  gulab: ['गुलाब', 'ਗੁਲਾਬ'],
  jamun: ['जामुन', 'ਜਾਮੁਨ'],
  rasmalai: ['रसमलाई', 'ਰਸਮਲਾਈ'],
  kheer: ['खीर', 'ਖੀਰ'],
  halwa: ['हलवा', 'ਹਲਵਾ'],
  kulfi: ['कुल्फी', 'ਕੁਲਫੀ'],
  ice: ['आइस', 'ਆਈਸ'],
  jalebi: ['जलेबी', 'ਜਲੇਬੀ'],
  barfi: ['बर्फ़ी', 'ਬਰਫ਼ੀ'],
  laddu: ['लड्डू', 'ਲੱਡੂ'],
  rabri: ['रबड़ी', 'ਰਬੜੀ'],
  falooda: ['फालूदा', 'ਫਾਲੂਦਾ'],
  kaju: ['काजू', 'ਕਾਜੂ'],
  badam: ['बादाम', 'ਬਾਦਾਮ'],
  pista: ['पिस्ता', 'ਪਿਸਤਾ'],
  gajar: ['गाजर', 'ਗਾਜਰ'],
  moong: ['मूंग', 'ਮੂੰਗ'],
  brownie: ['ब्राउनी', 'ਬਰਾਊਨੀ'],
  chocolate: ['चॉकलेट', 'ਚਾਕਲੇਟ'],
  vanilla: ['वनीला', 'ਵਨੀਲਾ'],
  strawberry: ['स्ट्रॉबेरी', 'ਸਟਰਾਬੇਰੀ'],
  // sizes, portions & qualifiers
  half: ['हाफ', 'ਹਾਫ'],
  full: ['फुल', 'ਫੁੱਲ'],
  quarter: ['क्वार्टर', 'ਕੁਆਰਟਰ'],
  large: ['लार्ज', 'ਲਾਰਜ'],
  small: ['स्मॉल', 'ਸਮਾਲ'],
  medium: ['मीडियम', 'ਮੀਡੀਅਮ'],
  regular: ['रेगुलर', 'ਰੈਗੂਲਰ'],
  extra: ['एक्स्ट्रा', 'ਐਕਸਟਰਾ'],
  special: ['स्पेशल', 'ਸਪੈਸ਼ਲ'],
  plain: ['प्लेन', 'ਪਲੇਨ'],
  mix: ['मिक्स', 'ਮਿਕਸ'],
  mixed: ['मिक्स्ड', 'ਮਿਕਸਡ'],
  veg: ['वेज', 'ਵੈਜ'],
  non: ['नॉन', 'ਨੌਨ'],
  green: ['ग्रीन', 'ਗਰੀਨ'],
  sweet: ['स्वीट', 'ਸਵੀਟ'],
  spicy: ['स्पाइसी', 'ਸਪਾਈਸੀ'],
  mild: ['माइल्ड', 'ਮਾਈਲਡ'],
  thali: ['थाली', 'ਥਾਲੀ'],
  combo: ['कॉम्बो', 'ਕੌਂਬੋ'],
  plate: ['प्लेट', 'ਪਲੇਟ'],
  piece: ['पीस', 'ਪੀਸ'],
  pc: ['पीस', 'ਪੀਸ'],
  pcs: ['पीस', 'ਪੀਸ'],
  amritsari: ['अमृतसरी', 'ਅੰਮ੍ਰਿਤਸਰੀ'],
  punjabi: ['पंजाबी', 'ਪੰਜਾਬੀ'],
  da: ['दा', 'ਦਾ'],
  di: ['दी', 'ਦੀ'],
  ka: ['का', 'ਕਾ'],
  ki: ['की', 'ਕੀ'],
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

// longest-first, so 'chh' wins over 'ch' and 'aa' over 'a'
const CONS_ORDER = ['chh', 'ch', 'sh', 'kh', 'gh', 'jh', 'th', 'dh', 'ph', 'bh',
  'k', 'g', 'j', 't', 'd', 'n', 'p', 'b', 'm', 'y', 'r', 'l', 'v', 'w', 's', 'h', 'z', 'f', 'q', 'c', 'x']
const VOW_ORDER = ['aa', 'ai', 'au', 'ee', 'ii', 'oo', 'uu', 'ea', 'oa', 'ou', 'ie', 'a', 'i', 'u', 'e', 'o']

// A nasal only collapses into the anusvara/tippi dot when the consonant after it
// is homorganic — "tandoori" → तंदूरी, but "namkeen" keeps its म (नमकीन).
const N_BEFORE = ['k', 'kh', 'g', 'gh', 'ch', 'chh', 'j', 'jh', 't', 'th', 'd', 'dh']
const M_BEFORE = ['p', 'ph', 'b', 'bh', 'f']

const HI = {
  cons: { chh: 'छ', ch: 'च', sh: 'श', kh: 'ख', gh: 'घ', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', k: 'क', g: 'ग', j: 'ज', t: 'त', d: 'द', n: 'न', p: 'प', b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', z: 'ज़', f: 'फ़', q: 'क़', c: 'क', x: 'क्स' },
  matra: { aa: 'ा', ai: 'ै', au: 'ौ', ee: 'ी', ii: 'ी', oo: 'ू', uu: 'ू', ea: 'ी', oa: 'ो', ou: 'ौ', ie: 'ी', a: '', i: 'ि', u: 'ु', e: 'े', o: 'ो' },
  ind: { aa: 'आ', ai: 'ऐ', au: 'औ', ee: 'ई', ii: 'ई', oo: 'ऊ', uu: 'ऊ', ea: 'ई', oa: 'ओ', ou: 'औ', ie: 'ई', a: 'अ', i: 'इ', u: 'उ', e: 'ए', o: 'ओ' },
  halant: '्', nasal: 'ं', addak: '', cluster: 'halant', geminate: 'halant', plural: 'स',
}

const PA = {
  cons: { chh: 'ਛ', ch: 'ਚ', sh: 'ਸ਼', kh: 'ਖ', gh: 'ਘ', jh: 'ਝ', th: 'ਥ', dh: 'ਧ', ph: 'ਫ', bh: 'ਭ', k: 'ਕ', g: 'ਗ', j: 'ਜ', t: 'ਤ', d: 'ਦ', n: 'ਨ', p: 'ਪ', b: 'ਬ', m: 'ਮ', y: 'ਯ', r: 'ਰ', l: 'ਲ', v: 'ਵ', w: 'ਵ', s: 'ਸ', h: 'ਹ', z: 'ਜ਼', f: 'ਫ਼', q: 'ਕ', c: 'ਕ', x: 'ਕਸ' },
  matra: { aa: 'ਾ', ai: 'ੈ', au: 'ੌ', ee: 'ੀ', ii: 'ੀ', oo: 'ੂ', uu: 'ੂ', ea: 'ੀ', oa: 'ੋ', ou: 'ੌ', ie: 'ੀ', a: '', i: 'ਿ', u: 'ੁ', e: 'ੇ', o: 'ੋ' },
  ind: { aa: 'ਆ', ai: 'ਐ', au: 'ਔ', ee: 'ਈ', ii: 'ਈ', oo: 'ਊ', uu: 'ਊ', ea: 'ਈ', oa: 'ਓ', ou: 'ਔ', ie: 'ਈ', a: 'ਅ', i: 'ਇ', u: 'ਉ', e: 'ਏ', o: 'ਓ' },
  // Gurmukhi normally writes clusters bare (ਸਪਰਿੰਗ) and doubles with an addak
  halant: '੍', nasal: 'ੰ', addak: 'ੱ', cluster: 'none', geminate: 'addak', plural: 'ਸ',
}

const matchToken = (w, i, order) => order.find((tok) => w.startsWith(tok, i)) || null

function transliterate(word, S) {
  const w = word.toLowerCase()
  let out = ''
  let i = 0
  while (i < w.length) {
    const c = matchToken(w, i, CONS_ORDER)
    if (c) {
      const after = i + c.length
      const nextC = matchToken(w, after, CONS_ORDER)
      // n/m + homorganic stop → the nasal dot, never a full letter
      const dot = out && ((c === 'n' && N_BEFORE.includes(nextC)) || (c === 'm' && M_BEFORE.includes(nextC)))
      if (dot) { out += S.nasal; i = after; continue }
      // doubled consonant: halant-repeat in Devanagari, addak in Gurmukhi
      if (nextC === c) {
        if (S.geminate === 'addak') { out += S.addak; i = after; continue }
        out += S.cons[c] + S.halant
        i = after
        continue
      }
      out += S.cons[c]
      i = after
      const v = matchToken(w, i, VOW_ORDER)
      if (v) {
        out += S.matra[finalLong(v, i + v.length >= w.length)]
        i += v.length
      } else if (i < w.length && S.cluster === 'halant' && c !== 'n' && c !== 'm') {
        // mid-word cluster needs the halant; a word-final consonant does not —
        // that's the schwa drop that makes नान rather than नान्
        out += S.halant
      }
      continue
    }
    const v = matchToken(w, i, VOW_ORDER)
    if (v) {
      out += S.ind[finalLong(v, i + v.length >= w.length)]
      i += v.length
      continue
    }
    out += w[i]
    i++
  }
  return out
}

// a word-final short i/u is long in practice — roti रोटी, aloo आलू, never रोटि
const finalLong = (v, isFinal) => (isFinal && v === 'i' ? 'ee' : isFinal && v === 'u' ? 'oo' : v)

function convertWord(word, S, idx) {
  const key = word.toLowerCase()
  const hit = WORDS[key]
  if (hit) return hit[idx]
  // "rolls" / "kababs" — reuse the dictionary stem and add the plural sibilant
  if (key.length > 2 && key.endsWith('s') && WORDS[key.slice(0, -1)]) return WORDS[key.slice(0, -1)][idx] + S.plural
  return transliterate(word, S)
}

// Splits on anything that isn't a Latin letter and keeps the separators, so
// "Idli Sambar (2 pc)" round-trips its brackets and digits untouched.
const convert = (name, S, idx) =>
  String(name || '')
    .split(/([^A-Za-z]+)/)
    .map((part) => (/^[A-Za-z]+$/.test(part) ? convertWord(part, S, idx) : part))
    .join('')

/** English/roman item name → Devanagari. Approximate — always worth a read. */
export const toHindi = (name) => convert(name, HI, 0)

/** English/roman item name → Gurmukhi. Approximate — always worth a read. */
export const toPunjabi = (name) => convert(name, PA, 1)
