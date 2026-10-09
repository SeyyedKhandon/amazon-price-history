// Pure parsing/scoring helpers. No DOM access, so they can be unit-tested in Node.
const ATB = (() => {
  const NBSP = /[  ]/g;

  // "€159.99", "159,99 €", "$1,299.00", "1.299,00 €", "¥1,980", "1 299,00 €" -> number
  function parsePrice(text) {
    if (!text) return null;
    const m = text.replace(NBSP, " ").match(/\d(?:[\d.,' ]*\d)?/);
    if (!m) return null;
    const s = m[0].replace(/[\s']/g, "");
    const sep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    let n;
    if (sep !== -1 && s.length - sep - 1 <= 2) {
      // 1-2 digits after the last separator: it's the decimal point
      n = parseFloat(s.slice(0, sep).replace(/[.,]/g, "") + "." + s.slice(sep + 1));
    } else {
      n = parseFloat(s.replace(/[.,]/g, ""));
    }
    return Number.isFinite(n) ? n : null;
  }

  // "4.6 out of 5 stars", "4,6 von 5 Sternen", "5つ星のうち4.5" -> 4.6 / 4.6 / 4.5
  function parseRating(text) {
    if (!text) return null;
    const nums = (text.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", ".")));
    if (!nums.length) return null;
    // Japanese puts the scale first: "5つ星のうち4.5"
    const n = nums.length > 1 && nums[0] === 5 && nums[1] < 5 ? nums[1] : nums[0];
    return n >= 0 && n <= 5 ? n : null;
  }

  // "484", "(1.3K)", "1,3 Tsd.", "12K+", "1,234 ratings", "2 Mio." -> number
  function parseCount(text) {
    if (!text) return null;
    // number (allowing "1 234" grouping), then an optional unit word like K / Tsd / Mio
    const m = text.replace(NBSP, " ").match(/(\d[\d.,]*(?:\s\d{3}(?!\d))*)\s*([A-Za-z一-鿿]+)?/);
    if (!m) return null;
    const num = m[1];
    const suffix = (m[2] || "").toLowerCase();
    let mult = 0;
    if (/^(k|tsd|tys|mil|mille|千)$/.test(suffix)) mult = 1e3;
    else if (/^(mio|mln|m)$/.test(suffix)) mult = 1e6;
    else if (suffix === "万") mult = 1e4;
    if (mult) {
      const n = parseFloat(num.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) ? Math.round(n * mult) : null;
    }
    const n = parseInt(num.replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  // Bayesian-weighted rating: a 5.0 from 3 reviews shouldn't beat a 4.7 from 3,000.
  function bestScore(rating, reviews) {
    if (rating == null) return -1;
    const m = 30; // prior weight
    const c = 4.2; // prior mean
    const v = reviews || 0;
    return (v / (v + m)) * rating + (m / (v + m)) * c;
  }

  const SORTS = {
    price_asc: (a, b) => nullLast(a.price, b.price, 1),
    price_desc: (a, b) => nullLast(a.price, b.price, -1),
    rating: (a, b) => nullLast(a.rating, b.rating, -1) || nullLast(a.reviews, b.reviews, -1),
    reviews: (a, b) => nullLast(a.reviews, b.reviews, -1),
    best: (a, b) => bestScore(b.rating, b.reviews) - bestScore(a.rating, a.reviews),
  };

  // dir 1 = ascending, -1 = descending; missing values always sort last.
  function nullLast(x, y, dir) {
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  }

  // `items` must carry a stable `seq` (original position) used as tiebreaker.
  function sortItems(items, mode) {
    const cmp = SORTS[mode];
    const out = items.slice();
    out.sort((a, b) => (cmp ? cmp(a, b) : 0) || a.seq - b.seq);
    return out;
  }

  return { parsePrice, parseRating, parseCount, bestScore, sortItems };
})();

if (typeof module !== "undefined") module.exports = ATB;
