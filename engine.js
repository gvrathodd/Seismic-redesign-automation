/*
 * Seismic redesign engine - IS 13920:2016 (+ Amd 1 & 2), IS 456:2000.
 * Procedure follows IITK-GSDMA EQ22 Example 5 (beam-column joint).
 * Units inside: N, mm, MPa. Inputs/outputs: kN, kN-m, mm, mm².
 *
 * Works in the browser (window.SeismicEngine) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  const ES = 2e5;
  const BAR_DIAS = [12, 16, 20, 25, 28, 32];
  const barArea = (d) => (Math.PI * d * d) / 4;
  const floor5 = (x) => Math.floor(x / 5) * 5;
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

  // ---------- Materials ----------

  // IS 456 Fig 23: design stress-strain for steel (signed stress, MPa).
  function steelStress(eps, fy) {
    const fyd = 0.87 * fy;
    const s = Math.sign(eps);
    const e = Math.abs(eps);
    if (fy <= 250) return s * Math.min(ES * e, fyd);
    const frac = [0.8, 0.85, 0.9, 0.95, 0.975, 1.0];
    const inel = [0, 0.0001, 0.0003, 0.0007, 0.001, 0.002];
    const fs = frac.map((f) => f * fyd);
    const es = fs.map((f, i) => f / ES + inel[i]);
    if (e <= es[0]) return s * ES * e;
    for (let i = 1; i < es.length; i++) {
      if (e <= es[i]) return s * (fs[i - 1] + ((fs[i] - fs[i - 1]) * (e - es[i - 1])) / (es[i] - es[i - 1]));
    }
    return s * fyd;
  }

  // IS 456 Table 19 (closed form used by SP 16).
  function tauC(fck, pt) {
    const f = Math.min(fck, 40);
    const p = clamp(pt, 0.15, 3);
    const beta = Math.max((0.8 * f) / (6.89 * p), 1);
    return (0.85 * Math.sqrt(0.8 * f) * (Math.sqrt(1 + 5 * beta) - 1)) / (6 * beta);
  }

  // IS 456 Table 20.
  function tauCmax(fck) {
    const t = [[15, 2.5], [20, 2.8], [25, 3.1], [30, 3.5], [35, 3.7], [40, 4.0]];
    let v = 2.5;
    for (const [g, x] of t) if (fck >= g) v = x;
    return v;
  }

  // IS 456 Cl 26.2.1: development length of a deformed bar in tension.
  function devLength(dia, fy, fck) {
    const t = [[20, 1.2], [25, 1.4], [30, 1.5], [35, 1.7], [40, 1.9]];
    let tbd = 1.2;
    for (const [g, x] of t) if (fck >= g) tbd = x;
    return (dia * 0.87 * fy) / (4 * tbd * 1.6);
  }

  const xuMaxRatio = (fy) => 0.0035 / (0.0055 + (0.87 * fy) / ES);

  function bisect(fn, lo, hi, iters = 60) {
    let flo = fn(lo);
    for (let i = 0; i < iters; i++) {
      const mid = (lo + hi) / 2;
      const fm = fn(mid);
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---------- Beam section capacity (strain compatibility) ----------
  /*
   * Tension steel Ast at depth d, compression steel Asc at dc, optional second tension
   * layer As2 at d2 (slab bars for hogging). Flange (bf, Df) per IS 456 Annex G.
   */
  function beamCapacity({ b, d, dc, Ast, Asc, fck, fy, bf = 0, Df = 0, As2 = 0, d2 = 0 }) {
    const flanged = bf > b && Df > 0;
    const conc = (xu) => {
      if (!flanged || xu <= Df) {
        const w = flanged ? bf : b;
        const C = 0.36 * fck * w * xu;
        return [C, C * 0.42 * xu];
      }
      const yf = Df / d <= 0.2 ? Df : Math.min(0.15 * xu + 0.65 * Df, Df);
      const Cw = 0.36 * fck * b * xu;
      const Cf = 0.45 * fck * (bf - b) * yf;
      return [Cw + Cf, Cw * 0.42 * xu + (Cf * yf) / 2];
    };
    const forces = (xu) => {
      const fst = steelStress((0.0035 * (d - xu)) / xu, fy);
      const esc = (0.0035 * (xu - dc)) / xu;
      let fsc = steelStress(esc, fy);
      if (esc > 0) fsc -= 0.446 * fck;
      const f2 = As2 ? steelStress((0.0035 * (d2 - xu)) / xu, fy) : 0;
      const [C, Cm] = conc(xu);
      return { C, Cm, Fsc: Asc * fsc, T: Ast * fst, T2: As2 * f2 };
    };
    const xu = bisect((x) => { const f = forces(x); return f.C + f.Fsc - f.T - f.T2; }, 0.5, d * 1.2, 50);
    const f = forces(xu);
    const Mu = (f.T * d + f.T2 * d2 - f.Cm - f.Fsc * dc) / 1e6;
    const xuMax = xuMaxRatio(fy) * d;
    return { Mu, xu, xuMax, ductile: xu <= xuMax + 1e-6 };
  }

  const coverTopOf = (bm) => bm.coverTop || bm.cover;
  const coverBotOf = (bm) => bm.coverBot || bm.cover;

  /*
   * Hogging and sagging capacity of a beam end with top/bot steel.
   * overstrength = true adds slab bars within the effective flange to the hogging
   * capacity (they yield with the beam). Used for capacity design: beam shear,
   * strong column check, column shear and joint shear.
   */
  function beamEndCaps(bm, mat, top, bot, overstrength) {
    const ct = coverTopOf(bm), cb = coverBotOf(bm);
    const useSlab = overstrength && bm.slabAs > 0;
    const hog = beamCapacity({
      b: bm.b, d: bm.D - ct, dc: cb, Ast: top, Asc: bot, fck: mat.fck, fy: mat.fy,
      As2: useSlab ? bm.slabAs : 0, d2: bm.D - (bm.slabCover || 30),
    });
    const sag = beamCapacity({
      b: bm.b, d: bm.D - cb, dc: ct, Ast: bot, Asc: top, fck: mat.fck, fy: mat.fy,
      bf: bm.useFlange ? bm.bf : 0, Df: bm.useFlange ? bm.Df : 0,
    });
    return { hog, sag };
  }

  // Least tension steel (mm²) so that capacity >= Mu. Infinity if not possible within rho_max.
  function reqTension(Mu, p) {
    const Amin = p.Amin, Amax = p.Amax;
    const cap = (A) => beamCapacity({ ...p, Ast: A }).Mu;
    if (cap(Amin) >= Mu) return Amin;
    if (cap(Amax) < Mu) return Infinity;
    return bisect((A) => cap(A) - Mu, Amin, Amax, 40) * 1.001;
  }

  // ---------- Beam design at a support (doubly reinforced) ----------
  function designBeamSupport(bm, mat, MuHog, MuSag, conservative) {
    const ct = coverTopOf(bm), cb = coverBotOf(bm);
    const dH = bm.D - ct, dS = bm.D - cb;
    const rmin = (0.24 * Math.sqrt(mat.fck)) / mat.fy;
    const AminH = Math.max(rmin * bm.b * dH, 2 * barArea(12)), AminS = Math.max(rmin * bm.b * dS, 2 * barArea(12));
    const AmaxH = 0.025 * bm.b * dH, AmaxS = 0.025 * bm.b * dS;
    const hogP = (Asc) => ({ b: bm.b, d: dH, dc: cb, Asc, fck: mat.fck, fy: mat.fy, Amin: AminH, Amax: AmaxH });
    const sagP = (Asc) => ({ b: bm.b, d: dS, dc: ct, Asc, fck: mat.fck, fy: mat.fy, bf: bm.useFlange ? bm.bf : 0, Df: bm.useFlange ? bm.Df : 0, Amin: AminS, Amax: AmaxS });
    const fail = { top: Infinity, bot: Infinity, ok: false };

    if (conservative) {
      // Textbook / SP 16 route: singly reinforced up to Mu,lim, compression steel only beyond it,
      // then bottom raised to half the top.
      const xm = xuMaxRatio(mat.fy) * dH;
      const Mulim = (0.36 * mat.fck * bm.b * xm * (dH - 0.42 * xm)) / 1e6;
      let top, ascNeed = 0;
      if (MuHog <= Mulim) top = Math.max(reqTension(MuHog, hogP(0)), AminH);
      else {
        const fsc = steelStress((0.0035 * (xm - cb)) / xm, mat.fy) - 0.446 * mat.fck;
        ascNeed = ((MuHog - Mulim) * 1e6) / (fsc * (dH - cb));
        top = (0.36 * mat.fck * bm.b * xm) / (0.87 * mat.fy) + (ascNeed * fsc) / (0.87 * mat.fy);
      }
      const bot = Math.max(reqTension(MuSag, sagP(0)), 0.5 * top, ascNeed, AminS);
      if (!isFinite(top) || !isFinite(bot) || top > AmaxH || bot > AmaxS) return fail;
      return { top, bot, ok: true };
    }

    // Refined: scan the bottom (compression) steel and keep the least total.
    let best = null;
    const step = Math.max((AmaxS - AminS) / 80, 10);
    for (let bot = AminS; bot <= AmaxS + 1e-6; bot += step) {
      const top = Math.max(reqTension(MuHog, hogP(bot)), AminH);
      if (!isFinite(top) || top > AmaxH) continue;
      if (!beamCapacity({ ...hogP(bot), Ast: top }).ductile) continue;
      const botNeed = Math.max(reqTension(MuSag, sagP(top)), 0.5 * top, AminS);
      if (!isFinite(botNeed) || botNeed > AmaxS) continue;
      const b2 = Math.max(bot, botNeed);
      if (!best || top + b2 < best.top + best.bot) best = { top, bot: b2 };
    }
    return best ? { ...best, ok: true } : fail;
  }

  // ---------- Bar selection ----------
  /*
   * Least-area practical combination: n1 bars of d1, plus optionally n2 bars of a
   * neighbouring size d2 (d1 - d2 <= 6 mm, e.g. 20+16, 25+20). Two layers allowed;
   * returns the centroid shift of the bar group from the outer layer.
   */
  function chooseBeamBars(req, b, cover, maxDia = 25, minDia = 12) {
    let best = null;
    const dias = BAR_DIAS.filter((d) => d >= minDia && d <= maxDia);
    for (const d1 of dias) {
      const edge = cover - d1 / 2;
      const gap = Math.max(d1, 25);
      const perLayer = Math.max(2, Math.floor((b - 2 * edge + gap) / (d1 + gap)));
      for (let n1 = 2; n1 <= 8; n1++) {
        for (const d2 of [0, ...dias.filter((x) => x < d1 && d1 - x <= 6)]) {
          for (let n2 = d2 ? 1 : 0; n2 <= (d2 ? 6 : 0); n2++) {
            const n = n1 + n2;
            if (n > 2 * perLayer) continue;
            const A = n1 * barArea(d1) + n2 * barArea(d2);
            if (A < req) continue;
            const layers = n <= perLayer ? 1 : 2;
            // big bars fill the outer layer first
            let A2 = 0;
            if (layers === 2) {
              const inOuterBig = Math.min(n1, perLayer);
              const inOuterSmall = perLayer - inOuterBig;
              A2 = (n1 - inOuterBig) * barArea(d1) + Math.max(n2 - inOuterSmall, 0) * barArea(d2);
            }
            const shift = (A2 / A) * (d1 + gap);
            const k = Math.min(n, perLayer);
            const clearSpacing = (b - 2 * edge - (k * (n1 * d1 + n2 * (d2 || 0))) / n) / (k - 1);
            const cand = { area: A, n, layers, shift, clearSpacing, maxDia: d1, minDia: d2 || d1,
              text: `${n1}-${d1}` + (n2 ? ` + ${n2}-${d2}` : "") + (layers === 2 ? " (2 layers)" : "") };
            if (!best || A < best.area - 1 || (Math.abs(A - best.area) <= 1 && (layers < best.layers || n < best.n))) best = cand;
          }
        }
      }
    }
    return best;
  }

  // ---------- Column section ----------
  function colBars(c) {
    const nTotal = 2 * c.nx + 2 * c.ny - 4;
    if (c.cornerDia > 0 && c.otherDia > 0) {
      const Ac = barArea(c.cornerDia), Ao = barArea(c.otherDia);
      return { nTotal, Ac, Ao, Asc: 4 * Ac + (nTotal - 4) * Ao, maxDia: Math.max(c.cornerDia, c.otherDia), minDia: Math.min(c.cornerDia, c.otherDia) };
    }
    const A = c.Asc / nTotal;
    const dEq = Math.sqrt((4 * A) / Math.PI);
    return { nTotal, Ac: A, Ao: A, Asc: c.Asc, maxDia: c.maxDia || dEq, minDia: c.minDia || dEq };
  }

  // nFace = bars on each face perpendicular to bending (incl. corners); nSide = bars on side faces.
  function columnLayers(h, dc, nFace, nSide, Ac, Ao) {
    const ext = 2 * Ac + (nFace - 2) * Ao;
    const layers = [{ y: dc, A: ext }, { y: h - dc, A: ext }];
    const inner = nSide - 2;
    for (let i = 1; i <= inner; i++) layers.push({ y: dc + ((h - 2 * dc) * i) / (inner + 1), A: 2 * Ao });
    return layers;
  }

  // Section for bending from shaking in direction dir ("X" -> depth cx).
  function colSection(c, mat, dir) {
    const bars = colBars(c);
    const h = dir === "X" ? c.cx : c.cy, w = dir === "X" ? c.cy : c.cx;
    const nFace = dir === "X" ? c.ny : c.nx, nSide = dir === "X" ? c.nx : c.ny;
    return { w, h, dc: c.dc, layers: columnLayers(h, c.dc, nFace, nSide, bars.Ac, bars.Ao), fck: mat.fck, fy: mat.fy, Asc: bars.Asc };
  }

  function columnPM(xu, { w, h, layers, fck, fy }) {
    let C, yC;
    if (xu <= h) { C = 0.36 * fck * w * xu; yC = 0.42 * xu; }
    else {
      const k = xu / h;
      const g = 16 / Math.pow(7 * k - 3, 2);
      const c1 = 0.446 * (1 - (4 * g) / 21);
      const c2 = (0.5 - (8 * g) / 49) / (1 - (4 * g) / 21);
      C = c1 * fck * w * h; yC = c2 * h;
    }
    let P = C, M = C * (h / 2 - yC);
    for (const L of layers) {
      const eps = xu <= h ? (0.0035 * (xu - L.y)) / xu : (0.002 * (xu - L.y)) / (xu - (3 * h) / 7);
      let fs = steelStress(eps, fy);
      if (eps > 0 && L.y < Math.min(xu, h)) fs -= 0.446 * fck;
      P += L.A * fs;
      M += L.A * fs * (h / 2 - L.y);
    }
    return { P: P / 1e3, M: M / 1e6 };
  }

  function columnMuAtP(sec, Pu) {
    const lo = 1, hi = sec.h * 20;
    if (columnPM(hi, sec).P < Pu) return 0;
    if (columnPM(lo, sec).P > Pu) return Math.max(columnPM(lo, sec).M, 0);
    const xu = bisect((x) => columnPM(x, sec).P - Pu, lo, hi, 60);
    return Math.max(columnPM(xu, sec).M, 0);
  }

  // Balanced-point axial load (kN) for IS 456 Cl 39.7.1 slenderness reduction.
  function columnPb(sec, fy) {
    const xu = (0.0035 / (0.0035 + (0.87 * fy) / ES + 0.002)) * (sec.h - sec.dc);
    return columnPM(xu, sec).P;
  }

  // Additional moment for slender columns, IS 456 Cl 39.7.1 (kN-m).
  function slenderMoment(c, sec, Pu, Puz, Pb) {
    const lex = (c.kEff || 1.0) * c.Lu;
    const r = lex / sec.h;
    if (r <= 12 || Pu <= 0) return { Ma: 0, r };
    const Ma = ((Pu * sec.h) / 1000 / 2000) * r * r;
    const k = Puz > Pb ? clamp((Puz - Pu) / (Puz - Pb), 0, 1) : 1;
    return { Ma: Ma * k, r };
  }

  // IS 456 Cl 39.6 biaxial check including minimum eccentricity and slenderness.
  function columnBiaxial(c, mat, combos) {
    const sx = colSection(c, mat, "X"), sy = colSection(c, mat, "Y");
    const Ag = c.cx * c.cy, Asc = sx.Asc;
    const Puz = (0.45 * mat.fck * (Ag - Asc) + 0.75 * mat.fy * Asc) / 1e3;
    const PuMaxAxial = (0.4 * mat.fck * (Ag - Asc) + 0.67 * mat.fy * Asc) / 1e3;
    const PbX = columnPb(sx, mat.fy), PbY = columnPb(sy, mat.fy);
    let worst = 0, worstRow = null, slender = false;
    for (const cb of combos) {
      const emin = (dim) => Math.max(c.Lu / 500 + dim / 30, 20) / 1000;
      const ax = slenderMoment(c, sx, cb.Pu, Puz, PbX), ay = slenderMoment(c, sy, cb.Pu, Puz, PbY);
      if (ax.Ma > 0 || ay.Ma > 0) slender = true;
      const Mx = Math.max(Math.abs(cb.Mux), cb.Pu * emin(c.cx)) + ax.Ma;
      const My = Math.max(Math.abs(cb.Muy), cb.Pu * emin(c.cy)) + ay.Ma;
      const Mx1 = columnMuAtP(sx, cb.Pu), My1 = columnMuAtP(sy, cb.Pu);
      const r = cb.Pu / Puz;
      const an = r <= 0.2 ? 1 : r >= 0.8 ? 2 : 1 + (r - 0.2) / 0.6;
      let u = Mx1 > 0 && My1 > 0 ? Math.pow(Mx / Mx1, an) + Math.pow(My / My1, an) : 99;
      if (cb.Pu > PuMaxAxial) u = 99;
      if (u > worst) { worst = u; worstRow = { ...cb, Mx, My, Mx1, My1, an }; }
    }
    return { util: worst, ok: worst <= 1, worstRow, Puz, slender, lexX: (c.kEff || 1) * c.Lu / c.cx, lexY: (c.kEff || 1) * c.Lu / c.cy };
  }

  // Bar spacing on each face (IS 456 26.3.2, 26.5.3.1): clear >= max(dia, 25), centres <= 300.
  function columnSpacing(c) {
    const bars = colBars(c);
    const res = [];
    for (const [L, n] of [[c.cx, c.nx], [c.cy, c.ny]]) {
      const ctr = (L - 2 * c.dc) / (n - 1);
      res.push({ ctr, clear: ctr - bars.maxDia });
    }
    const minClear = Math.min(...res.map((r) => r.clear)), maxCtr = Math.max(...res.map((r) => r.ctr));
    return { minClear, maxCtr, ok: minClear >= Math.max(bars.maxDia, 25) && maxCtr <= 300 };
  }

  // ---------- Joint (Cl 9) ----------
  function jointBj(bb, bc, hc) {
    return bb < bc ? Math.min(bc, bb + 0.5 * hc) : Math.min(bb, bc + 0.5 * hc);
  }

  function autoConfinedFaces(st) {
    const { col, beams, joint } = st;
    let n = 0;
    for (const side of ["left", "right"]) {
      if (beams.X.present && joint.X[side] && beams.X.b >= 0.75 * col.cy) n++;
      if (beams.Y.present && joint.Y[side] && beams.Y.b >= 0.75 * col.cx) n++;
    }
    return n;
  }

  // ---------- Hoops: confinement (Cl 7.6) + shear (Cl 7.5) ----------
  /*
   * Spacing in the confining zone is the least of the Ash requirement, the shear
   * requirement and the limits min(b/4, 6 x smallest bar, 100). Amendment 1 rewords
   * 7.6.1(b) as "6 x smallest bar"; the older b/4 and 100 mm limits are kept here so
   * the result is safe whichever reading is adopted.
   */
  function hoopDesign(c, mat, VusX, VusY, dX, dY, tieDia, extraLegs) {
    const cc = c.clearCover || 40;
    const coreX = c.cx - 2 * cc, coreY = c.cy - 2 * cc;
    const legsFor = (core) => Math.max(2, Math.ceil(core / 300) + 1) + (extraLegs || 0);
    const legsAlongX = legsFor(coreX), legsAlongY = legsFor(coreY);
    const h = Math.max(coreX / (legsAlongX - 1), coreY / (legsAlongY - 1));
    const Ag = c.cx * c.cy, Ak = coreX * coreY;
    const Ash = barArea(tieDia);
    const k = Math.max(0.18 * h * (mat.fck / mat.fy) * (Ag / Ak - 1), 0.05 * h * (mat.fck / mat.fy));
    const sAsh = Ash / k;
    const bars = colBars(c);
    const bmin = Math.min(c.cx, c.cy);
    const sLimit = Math.min(bmin / 4, 6 * bars.minDia, 100);
    // Legs resisting shear in X are the legs running in X: one per position across Y.
    const sShX = VusX > 0 ? (0.87 * mat.fy * legsAlongY * Ash * dX) / (VusX * 1e3) : Infinity;
    const sShY = VusY > 0 ? (0.87 * mat.fy * legsAlongX * Ash * dY) / (VusY * 1e3) : Infinity;
    const sShear = Math.min(sShX, sShY);
    const s = floor5(Math.min(sAsh, sLimit, sShear));
    const sMid = floor5(Math.min(bmin / 2, 16 * bars.minDia, 300, sShear));
    const lo = Math.max(Math.max(c.cx, c.cy), c.Lu / 6, 450);
    return { s, sMid, sAsh, sLimit, sShear, h, lo, tieDia, legsAlongX, legsAlongY, extraLegs: extraLegs || 0,
      governs: s === floor5(sShear) ? "shear" : s === floor5(sAsh) ? "confinement (Ash)" : "spacing limit" };
  }

  // ---------- Beam shear (Cl 6.3) ----------
  // Capacity-design shear at the joint end A, with far end B. caps = overstrength capacities.
  function capacityShear(Vg, capsA, capsB, Lc) {
    const L = Lc / 1000;
    const right = (1.4 * (capsA.sag.Mu + capsB.hog.Mu)) / L;
    const left = (1.4 * (capsA.hog.Mu + capsB.sag.Mu)) / L;
    return { Vhinge: Math.max(right, left), Vu: Vg + Math.max(right, left) };
  }

  function beamShear(bm, mat, capsA, capsB, minLongDia) {
    const d = bm.D - Math.max(coverTopOf(bm), coverBotOf(bm));
    const Vg = (1.2 * bm.wDL_LL * bm.Lc) / 2 / 1000;
    const cs = capacityShear(Vg, capsA, capsB, bm.Lc);
    const Vu = Math.max(bm.VuAnalysis || 0, cs.Vu);
    const tv = (Vu * 1000) / (bm.b * d);
    const tmax = tauCmax(mat.fck);
    const legs = bm.b > 450 ? 4 : 2;
    const sLim = Math.min(d / 4, 8 * minLongDia, 100);
    let dia = 8, sCalc = 0;
    for (dia of [8, 10, 12]) {
      sCalc = (0.87 * mat.fy * legs * barArea(dia) * d) / (Vu * 1000);
      if (Math.min(sCalc, sLim) >= 75) break;
    }
    const sEnd = floor5(Math.min(sCalc, sLim));
    const Vmid = Math.max(Vu - (1.2 * bm.wDL_LL * 2 * d) / 1000, 0.4 * Vu);
    const sMid = floor5(Math.min((0.87 * mat.fy * legs * barArea(dia) * d) / (Vmid * 1000), d / 2));
    return { Vg, Vhinge: cs.Vhinge, Vu, tv, tmax, legs, dia, sEnd, sMid, d,
      text: `${legs}L-${dia} @ ${sEnd} c/c over 2d (${Math.round(2 * d)} mm), @ ${sMid} c/c elsewhere, first link at 50 mm` };
  }

  // ---------- Serviceability (IS 456 Cl 23.2.1, 26.3.3) ----------
  function deflectionCheck(bm, mat, midBotReq) {
    const d = bm.D - coverBotOf(bm);
    const pt = (100 * bm.midBot) / (bm.b * d);
    const pc = (100 * (bm.midTop || 0)) / (bm.b * d);
    const fs = 0.58 * mat.fy * (midBotReq > 0 ? Math.min(midBotReq / bm.midBot, 1) : 1);
    let kt = 1 / (0.225 + 0.00322 * fs - 0.625 * Math.log10(1 / Math.max(pt, 0.1)));
    kt = clamp(kt, 0.3, 2.0);
    const kc = Math.min(1 + pc / (3 + pc), 1.5); // IS 456 Fig 5 fit
    const ratio = bm.useFlange && bm.bf > bm.b ? bm.b / bm.bf : 1;
    const kf = ratio >= 1 ? 1 : ratio <= 0.3 ? 0.8 : 0.8 + ((ratio - 0.3) / 0.7) * 0.2;
    const basic = 26 * (bm.Lc > 10000 ? 10000 / bm.Lc : 1);
    const allow = basic * kt * kc * kf;
    return { actual: bm.Lc / d, allow, ok: bm.Lc / d <= allow };
  }

  const crackMaxSpacing = (fy) => (fy <= 250 ? 300 : fy <= 415 ? 180 : fy <= 500 ? 150 : 135);

  // ---------- Quantities and cost ----------
  function quantities(st, res) {
    const kg = (mm3) => mm3 * 7850e-9;
    let steel = 0, links = 0, conc = 0, form = 0;
    for (const dir of ["X", "Y"]) {
      const bm = st.beams[dir];
      if (!bm.present) continue;
      const sides = (st.joint[dir].left ? 1 : 0) + (st.joint[dir].right ? 1 : 0);
      const L = bm.Lc;
      const mt = bm.midTop || 0, mb = bm.midBot || bm.bot;
      const top = mt * L + Math.max(bm.top - mt, 0) * (L / 3) + Math.max((bm.farTop ?? bm.top) - mt, 0) * (L / 3);
      const bot = mb * L + Math.max(bm.bot - mb, 0) * (L / 4) + Math.max((bm.farBot ?? bm.bot) - mb, 0) * (L / 4);
      steel += sides * kg(top + bot);
      const sh = res.beams[dir] && res.beams[dir].shear;
      if (sh) {
        const n = (2 * (2 * sh.d)) / sh.sEnd + Math.max(L - 4 * sh.d, 0) / sh.sMid;
        const per = sh.legs / 2 * (2 * (bm.b - 60) + 2 * (bm.D - 60)) + 20 * sh.dia;
        links += sides * kg(n * per * barArea(sh.dia));
      }
      conc += sides * bm.b * bm.D * L;
      form += sides * (2 * (bm.D - (bm.Df || 0)) + bm.b) * L;
    }
    const c = st.col;
    const bars = colBars(c);
    steel += kg(bars.Asc * c.hst);
    const hp = res.hoops;
    if (hp) {
      const perim = 2 * (c.cx - 2 * (c.clearCover || 40)) + 2 * (c.cy - 2 * (c.clearCover || 40));
      const per = perim + (hp.legsAlongX - 2) * (c.cy - 80) + (hp.legsAlongY - 2) * (c.cx - 80) + 20 * hp.tieDia;
      const nConf = (2 * hp.lo) / hp.s, nMid = Math.max(c.hst - 2 * hp.lo, 0) / hp.sMid;
      links += kg((nConf + nMid) * per * barArea(hp.tieDia));
    }
    const maxBeamD = Math.max(st.beams.X.present ? st.beams.X.D : 0, st.beams.Y.present ? st.beams.Y.D : 0);
    conc += c.cx * c.cy * c.hst;
    form += 2 * (c.cx + c.cy) * (c.hst - maxBeamD);
    const r = st.costs || {};
    const concRate = (r.concrete || {})[st.mat.fck] || 7000;
    const out = { steelKg: steel, linksKg: links, concreteM3: conc / 1e9, formworkM2: form / 1e6 };
    out.cost = (steel + links) * (r.steel || 80) + out.concreteM3 * concRate + out.formworkM2 * (r.formwork || 600);
    return out;
  }

  // ---------- Full check of one design state ----------
  function evaluate(st) {
    const { mat, beams, joint, combos } = st;
    const maxD = Math.max(beams.X.present ? beams.X.D : 0, beams.Y.present ? beams.Y.D : 0);
    const col = { ...st.col, Lu: st.col.hst - maxD }; // clear height follows the deepest beam
    st = { ...st, col };
    const opt = st.options || {};
    const margin = 1 + (opt.margin || 0) / 100;
    const out = { checks: [], beams: {}, column: {}, joint: {} };
    const add = (step, clause, item, value, limit, status, note = "") =>
      out.checks.push({ step, clause, item, value, limit, status: status === true ? "ok" : status === false ? "fail" : status, note });

    // Step 0 - materials
    const minGrade = st.building.height > 15 && st.building.zone >= 3 ? 25 : 20;
    add("0 Materials", "5.2", "Concrete grade", `M${mat.fck}`, `≥ M${minGrade}`, mat.fck >= minGrade);
    add("0 Materials", "5.3.1 (Amd 2)", "Steel grade", `Fe${mat.fy}`, "Fe415 / 500 / 550", [415, 500, 550].includes(mat.fy));

    const colB = colBars(col);
    const PuList = combos.map((c) => c.Pu);
    const ΣMb = {};
    let maxBeamBar = 12;

    for (const dir of ["X", "Y"]) {
      const bm = beams[dir];
      if (!bm.present) continue;
      const S = `Beam ${dir}`;
      const dH = bm.D - coverTopOf(bm), dS = bm.D - coverBotOf(bm);
      maxBeamBar = Math.max(maxBeamBar, bm.maxDia || 20);
      // Step 1 - geometry
      add(`1 ${S}`, "6.1.2", "Width b", `${bm.b} mm`, "≥ 200 mm", bm.b >= 200);
      add(`1 ${S}`, "6.1.1", "b / D", (bm.b / bm.D).toFixed(2), "≥ 0.3", bm.b / bm.D >= 0.3 - 1e-9 ? "ok" : "warn", "\"preferably\" in code");
      add(`1 ${S}`, "6.1.3", "Depth vs clear span", `${bm.D} mm`, `≤ Lc/4 = ${Math.round(bm.Lc / 4)}`, bm.D <= bm.Lc / 4);
      const c2 = dir === "X" ? col.cy : col.cx, c1 = dir === "X" ? col.cx : col.cy;
      const bwMax = c2 + 2 * Math.min(c2, 0.75 * c1);
      add(`1 ${S}`, "6.1.4", "Width vs column", `${bm.b} mm`, `≤ ${Math.round(bwMax)} mm`, bm.b <= bwMax);

      // Step 2 - flexure (demand check without slab bars; margin applied)
      const rmin = (0.24 * Math.sqrt(mat.fck)) / mat.fy;
      const caps = beamEndCaps(bm, mat, bm.top, bm.bot, false);
      const capsOS = beamEndCaps(bm, mat, bm.top, bm.bot, true);
      const capsFar = beamEndCaps(bm, mat, bm.farTop ?? bm.top, bm.farBot ?? bm.bot, true);
      add(`2 ${S}`, "6.2.1", "Steel at face ≥ ρmin", `top ${Math.round(bm.top)}, bot ${Math.round(bm.bot)} mm²`, `≥ ${Math.round(rmin * bm.b * Math.max(dH, dS))} mm²`,
        Math.min(bm.top, bm.bot) >= rmin * bm.b * Math.min(dH, dS));
      add(`2 ${S}`, "6.2.2", "ρ ≤ 2.5 %", `${(100 * Math.max(bm.top / dH, bm.bot / dS) / bm.b).toFixed(2)} %`, "≤ 2.5 %", Math.max(bm.top / dH, bm.bot / dS) / bm.b <= 0.025);
      add(`2 ${S}`, "6.2.3", "Bottom ≥ ½ top at face", `${Math.round(bm.bot)} mm²`, `≥ ${Math.round(bm.top / 2)} mm²`, bm.bot >= bm.top / 2 - 1);
      const quarter = 0.25 * Math.max(bm.top, bm.farTop ?? bm.top);
      if (bm.midTop || bm.midBot) {
        add(`2 ${S}`, "6.2.4", "Any face ≥ ¼ top at face (midspan)", `top ${Math.round(bm.midTop)}, bot ${Math.round(bm.midBot)} mm²`, `≥ ${Math.round(quarter)} mm²`,
          Math.min(bm.midTop, bm.midBot) >= quarter - 1);
      }
      add(`2 ${S}`, "IS 456", "Hogging capacity (no slab bars)", `${caps.hog.Mu.toFixed(0)} kN-m`, `≥ ${(bm.MuHog * margin).toFixed(0)} kN-m`, caps.hog.Mu >= bm.MuHog * margin - 0.5,
        `doubly reinforced${opt.margin ? `, incl. ${opt.margin} % margin` : ""}`);
      add(`2 ${S}`, "IS 456", "Sagging capacity at face", `${caps.sag.Mu.toFixed(0)} kN-m`, `≥ ${(bm.MuSag * margin).toFixed(0)} kN-m`, caps.sag.Mu >= bm.MuSag * margin - 0.5,
        bm.useFlange ? "T-beam" : "rectangular");
      let midBotReq = 0;
      if (bm.MuMid && bm.midBot) {
        const p = { b: bm.b, d: dS, dc: coverTopOf(bm), Asc: bm.midTop || 0, fck: mat.fck, fy: mat.fy, bf: bm.useFlange ? bm.bf : 0, Df: bm.useFlange ? bm.Df : 0 };
        const capMid = beamCapacity({ ...p, Ast: bm.midBot }).Mu;
        midBotReq = reqTension(bm.MuMid * margin, { ...p, Amin: 1, Amax: 0.025 * bm.b * dS });
        add(`2 ${S}`, "IS 456", "Midspan sagging capacity", `${capMid.toFixed(0)} kN-m`, `≥ ${(bm.MuMid * margin).toFixed(0)} kN-m`, capMid >= bm.MuMid * margin - 0.5);
      }
      add(`2 ${S}`, "IS 456 38.1", "Ductile (xu ≤ xu,max) hogging", `${caps.hog.xu.toFixed(0)} mm`, `≤ ${caps.hog.xuMax.toFixed(0)} mm`, caps.hog.ductile);
      if (bm.slabAs > 0) add(`2 ${S}`, "capacity design", "Hogging over-strength with slab bars", `${capsOS.hog.Mu.toFixed(0)} kN-m`, "used in Steps 3, 5, 6, 7", "ok",
        `${bm.slabAs} mm² slab bars within effective flange`);

      // Serviceability
      if (bm.midBot) {
        const df = deflectionCheck(bm, mat, midBotReq);
        add(`2 ${S}`, "IS 456 23.2.1", "Deflection (span / d)", df.actual.toFixed(1), `≤ ${df.allow.toFixed(1)}`, df.ok);
      }
      if (bm.topBars && bm.topBars.clearSpacing) {
        const lim = crackMaxSpacing(mat.fy);
        const worst = Math.max(bm.topBars.clearSpacing, (bm.midBotBars || bm.botBars).clearSpacing);
        add(`2 ${S}`, "IS 456 26.3.3", "Crack control: clear bar spacing", `${worst.toFixed(0)} mm`, `≤ ${lim} mm`, worst <= lim);
      }

      // Step 3 - capacity shear
      const minD = bm.minDia || Math.min(bm.topBars ? bm.topBars.minDia : 16, bm.botBars ? bm.botBars.minDia : 16);
      const sh = beamShear(bm, mat, capsOS, capsFar, minD);
      add(`3 ${S}`, "6.3.3", "Design shear (hinges both ends)", `${sh.Vu.toFixed(0)} kN`, `1.2(D+L) ${sh.Vg.toFixed(0)} + 1.4ΣMu/Lc ${sh.Vhinge.toFixed(0)}`, "ok",
        bm.farTop != null ? "far end uses its own bars" : "far end assumed same as this end");
      add(`3 ${S}`, "IS 456 T20", "τv ≤ τc,max", `${sh.tv.toFixed(2)} MPa`, `≤ ${sh.tmax} MPa`, sh.tv <= sh.tmax);
      add(`3 ${S}`, "6.3.5", "Links (concrete ignored, 6.3.4)", sh.text, "s ≤ d/4, 8φ, 100", sh.sEnd >= 75 ? "ok" : sh.sEnd >= 50 ? "warn" : "fail",
        sh.sEnd < 75 ? "closely spaced, check congestion" : "");

      const nSides = (joint[dir].left ? 1 : 0) + (joint[dir].right ? 1 : 0);
      ΣMb[dir] = nSides === 2 ? capsOS.hog.Mu + capsOS.sag.Mu : Math.max(capsOS.hog.Mu, capsOS.sag.Mu);
      out.beams[dir] = { caps, capsOS, shear: sh, d: dH, nSides };
    }

    // Step 4 - column
    const Ag = col.cx * col.cy;
    const PuMax = Math.max(...PuList);
    const axial = (PuMax * 1e3) / (mat.fck * Ag);
    add("4 Column", "7.1 (Amd 2)", "Pu / (fck Ag)", axial.toFixed(3), "≤ 0.40", axial <= 0.4);
    const minDim = Math.max(300, 20 * maxBeamBar);
    add("4 Column", "7.1.1", "Least dimension", `${Math.min(col.cx, col.cy)} mm`, `≥ ${minDim} mm`, Math.min(col.cx, col.cy) >= minDim);
    add("4 Column", "7.1.2", "Aspect ratio", (Math.min(col.cx, col.cy) / Math.max(col.cx, col.cy)).toFixed(2), "≥ 0.45", Math.min(col.cx, col.cy) / Math.max(col.cx, col.cy) >= 0.45);
    const rho = (100 * colB.Asc) / Ag;
    add("4 Column", "IS 456 26.5.3", "Steel ratio", `${rho.toFixed(2)} %`, "0.8 – 4 %", rho >= 0.8 && rho <= 4.0, "4 % kept so laps stay ≤ 6 %");
    const sp = columnSpacing(col);
    add("4 Column", "IS 456 26.3.2 / 26.5.3.1", "Bar spacing", `clear ${sp.minClear.toFixed(0)}, c/c ${sp.maxCtr.toFixed(0)} mm`, `clear ≥ ${Math.max(colB.maxDia, 25).toFixed(0)}, c/c ≤ 300`, sp.ok);
    const bx = columnBiaxial(col, mat, combos);
    add("4 Column", "IS 456 39.6, 39.7", "Biaxial P-M (incl. slenderness)", bx.util.toFixed(2), "≤ 1.00", bx.ok,
      `lex/D = ${bx.lexX.toFixed(1)} (X), ${bx.lexY.toFixed(1)} (Y)${bx.slender ? ", slender: extra moments added" : ", short column"}`);
    out.column.biaxial = bx;
    const above = st.colAbove && !st.colAbove.same ? st.colAbove : col;
    if (!joint.roof && st.colAbove && !st.colAbove.same) {
      add("4 Column", "practice", "Column above not larger than below", `${above.cx} × ${above.cy}`, `≤ ${col.cx} × ${col.cy}`,
        above.cx <= col.cx && above.cy <= col.cy ? "ok" : "warn", "otherwise column bars must be cranked / offset");
    }

    // Step 5 - strong column weak beam; Step 6 - column shear; Step 7 - joint
    const nCol = joint.roof ? 1 : 2;
    const VusDir = { X: 0, Y: 0 }, dDir = { X: col.cx - col.dc, Y: col.cy - col.dc };
    for (const dir of ["X", "Y"]) {
      if (!beams[dir].present) continue;
      const secB = colSection(col, mat, dir), secA = colSection(above, mat, dir);
      let McMin = Infinity, atP = 0;
      const list = joint.PuForMc === "zero" ? [{ Pu: 0, PuAbove: 0 }] : combos.map((c) => ({ Pu: c.Pu, PuAbove: c.PuAbove ?? c.Pu }));
      if (joint.PuForMc === "both") list.push({ Pu: 0, PuAbove: 0 });
      for (const c of list) {
        const m = columnMuAtP(secB, c.Pu) + (joint.roof ? 0 : columnMuAtP(secA, c.PuAbove));
        if (m < McMin) { McMin = m; atP = c.Pu; }
      }
      const ratio = McMin / ΣMb[dir];
      const waived = joint.roof && st.building.storeys > 4;
      add(`5 SCWB ${dir}`, "7.2.1", "ΣMc / ΣMb", ratio.toFixed(2), waived ? "waived (roof, > 4 storeys)" : "≥ 1.4", waived || ratio >= 1.4,
        `ΣMc = ${McMin.toFixed(0)} (least, at Pu = ${atP} kN), ΣMb = ${ΣMb[dir].toFixed(0)} kN-m incl. slab bars`);
      out.column["ratio" + dir] = ratio;

      const Vhinge = (1.4 * ΣMb[dir]) / (col.hst / 1000);
      const Vana = Math.abs((col.Vu || {})[dir] || 0);
      const Vu = Math.max(Vhinge, Vana);
      const w = dir === "X" ? col.cy : col.cx;
      const PuMin = Math.min(...PuList);
      const delta = PuMin > 0 ? Math.min(1 + (3 * PuMin * 1e3) / (Ag * mat.fck), 1.5) : 1;
      const Vc = PuMin >= 0 ? (tauC(mat.fck, rho / 2) * delta * w * dDir[dir]) / 1e3 : 0;
      const tv = (Vu * 1e3) / (w * dDir[dir]);
      VusDir[dir] = Math.max(Vu - Vc, 0);
      add(`6 Col shear ${dir}`, "7.5", "Shear demand vs τc,max", `${Vu.toFixed(0)} kN`, `τv ${tv.toFixed(2)} ≤ ${tauCmax(mat.fck)} MPa`, tv <= tauCmax(mat.fck),
        `max(1.4ΣMb/hst = ${Vhinge.toFixed(0)}, analysis = ${Vana.toFixed(0)}); Vc = ${Vc.toFixed(0)}, ties carry ${VusDir[dir].toFixed(0)} kN`);

      // Joint
      const bm = beams[dir], b = out.beams[dir];
      const fyO = 1.25 * mat.fy;
      const T1 = (fyO * (bm.top + (bm.slabAs || 0))) / 1e3;
      const C2 = (fyO * bm.bot) / 1e3;
      let Vj;
      if (b.nSides === 2) Vj = T1 + C2 - (1.4 * (b.capsOS.hog.Mu + b.capsOS.sag.Mu)) / (col.hst / 1000);
      else Vj = Math.max(T1 - (1.4 * b.capsOS.hog.Mu) / (col.hst / 1000), C2 - (1.4 * b.capsOS.sag.Mu) / (col.hst / 1000));
      const hc = dir === "X" ? col.cx : col.cy, bc = w;
      const bj = jointBj(bm.b, bc, hc);
      const faces = joint.confinedFaces ?? autoConfinedFaces(st);
      const kj = faces >= 4 ? 1.5 : faces === 3 ? 1.2 : 1.0;
      const cap = (kj * Math.sqrt(mat.fck) * bj * hc) / 1e3;
      add(`7 Joint ${dir}`, "9.1 (Amd 2)", "Joint shear Vj", `${Vj.toFixed(0)} kN`, `≤ ${kj}√fck·bj·hc = ${cap.toFixed(0)} kN`, Vj <= cap,
        `${b.nSides === 2 ? "interior" : "exterior"} in ${dir}; bars at 1.25 fy incl. slab; bj = ${bj.toFixed(0)}, hc = ${hc}, ${faces} faces confined`);
      const dbMax = bm.maxDia || 20;
      if (b.nSides === 2) {
        add(`7 Joint ${dir}`, "9.1.3", "Column depth ≥ 20 × beam bar", `${hc} mm`, `≥ ${20 * dbMax} mm`, hc >= 20 * dbMax);
      } else {
        const Ld = devLength(dbMax, mat.fy, mat.fck);
        const need = Ld + 10 * dbMax - 8 * dbMax;
        const horiz = hc - (col.clearCover || 40) - (col.tieDia || 10) - colB.maxDia;
        const vert = bm.D - 2 * coverTopOf(bm);
        add(`7 Joint ${dir}`, "6.2.5", "Anchorage at exterior joint", `${(horiz + vert).toFixed(0)} mm available`, `≥ Ld + 10φ − 8φ = ${need.toFixed(0)} mm`, horiz + vert >= need,
          `horizontal ${horiz.toFixed(0)} + 90° tail ${vert.toFixed(0)} mm`);
      }
      out.joint[dir] = { Vj, cap, ratio: Vj / cap };
    }

    // Step 8 - hoops: confinement + shear + congestion
    const hp = hoopDesign(col, mat, VusDir.X, VusDir.Y, dDir.X, dDir.Y, col.tieDia || 10, col.extraLegs || 0);
    out.hoops = hp;
    add("8 Hoops", "7.6.1", "Confining zone length lo", `${hp.lo.toFixed(0)} mm`, "≥ max(D, Lc/6, 450)", "ok");
    add("8 Hoops", "7.6.1, 7.5", `Hoops in lo (${hp.tieDia} mm, ${hp.legsAlongX}×${hp.legsAlongY} legs)`, `@ ${hp.s} c/c`,
      `Ash ⇒ ${hp.sAsh.toFixed(0)}, shear ⇒ ${isFinite(hp.sShear) ? hp.sShear.toFixed(0) : "–"}, limit ${hp.sLimit.toFixed(0)}`,
      hp.s >= 75 ? "ok" : hp.s >= 50 ? "warn" : "fail", `governed by ${hp.governs}${hp.s < 75 ? "; below 75 mm is congested" : ""}`);
    add("8 Hoops", "7.4.2(d), IS 456 26.5.3.2", "Hoops outside lo", `@ ${hp.sMid} c/c`, "≤ b/2, 16φ, 300, shear", "ok");
    const fullJoint = (joint.confinedFaces ?? autoConfinedFaces(st)) >= 4;
    add("8 Hoops", "9.2.1", "Hoops through joint", fullJoint ? `@ ${Math.min(floor5(2 * Math.min(hp.sAsh, hp.sLimit)), 150)} c/c (½ Ash)` : `@ ${hp.s} c/c (full)`,
      fullJoint ? "4 faces confined" : "not all faces confined", "ok");

    // Laps
    const LdCol = devLength(colB.maxDia, mat.fy, mat.fck);
    add("9 Detailing", "7.3.2", "Column lap in middle half of clear height", `lap ${Math.ceil(LdCol / 10) * 10} mm`, `≤ Lu/2 = ${(col.Lu / 2).toFixed(0)} mm`, LdCol <= col.Lu / 2,
      "≤ 50 % bars lapped at a section, hoops @ ≤ 100 over lap");
    for (const dir of ["X", "Y"]) {
      const bm = beams[dir];
      if (!bm.present) continue;
      const Ld = devLength(bm.maxDia || 20, mat.fy, mat.fck);
      add("9 Detailing", "6.2.6.1", `Beam ${dir} laps`, `lap ${Math.ceil(Ld / 10) * 10} mm`, "not in joint, not within 2d of face", "ok", "links @ ≤ 150 over lap");
    }

    out.ok = out.checks.every((c) => c.status !== "fail");
    out.warnings = out.checks.filter((c) => c.status === "warn").length;
    out.qty = quantities(st, out);
    return out;
  }

  // ---------- Automatic redesign ----------
  function stiffnessChanges(a, b) {
    const changes = [];
    const rel = (x, y) => Math.abs(x / y - 1);
    const Ix = (c) => (c.cy * c.cx ** 3) / 12, Iy = (c) => (c.cx * c.cy ** 3) / 12;
    if (rel(Ix(b.col), Ix(a.col)) > 0.1 || rel(Iy(b.col), Iy(a.col)) > 0.1)
      changes.push(`Column ${a.col.cx}×${a.col.cy} → ${b.col.cx}×${b.col.cy}`);
    for (const d of ["X", "Y"]) {
      const A = a.beams[d], B = b.beams[d];
      if (!A.present) continue;
      if (rel((B.b * B.D ** 3) / 12, (A.b * A.D ** 3) / 12) > 0.1) changes.push(`Beam ${d} ${A.b}×${A.D} → ${B.b}×${B.D}`);
    }
    if (a.mat.fck !== b.mat.fck) changes.push(`Concrete M${a.mat.fck} → M${b.mat.fck}`);
    return changes;
  }

  /*
   * Follows the flowchart: economical beams first (they are the fuse), then the column
   * is sized to beat them by 1.4, then the joint. Each joint fix is used until it
   * reaches its limit before the next one is tried.
   */
  function redesign(input) {
    const s = JSON.parse(JSON.stringify(input));
    const o = s.options || (s.options = {});
    const log = [];
    const step = o.sizeStep || 50;
    const maxCol = o.maxColDim || 900;
    const margin = 1 + (o.margin || 0) / 100;
    const conservative = !!o.conservative;
    if (conservative && s.joint.PuForMc !== "zero") s.joint.PuForMc = "both";
    const strategy = (o.jointStrategy || ["column", "beam", "grade"]).filter((x) => x !== "grade" || o.allowGrade);
    const grades = [20, 25, 30, 35, 40];
    const minGrade = s.building.height > 15 && s.building.zone >= 3 ? 25 : 20;
    if (s.mat.fck < minGrade) { s.mat.fck = minGrade; log.push(`Concrete raised to M${minGrade} (Cl 5.2)`); }
    let sIdx = 0;
    const beamMemo = new Map();

    const designBeam = (dir) => {
      const bm = s.beams[dir];
      const maxBeamD = Math.min(o.maxBeamD || 900, bm.Lc / 4);
      // Bars that fit 20 x dia in the present column first; then up to 25 mm
      // (the column is enlarged later) before the beam itself is resized.
      const colLim = clamp(Math.floor(Math.min(s.col.cx, s.col.cy) / 20), 12, 25);
      const dLims = [...new Set([colLim, 25])];
      for (let k = 0; k < 20; k++) {
       for (const dLim of dLims) {
        const key = JSON.stringify([bm.b, bm.D, bm.cover, bm.MuHog, bm.MuSag, bm.MuMid, s.mat, dLim, conservative, o.margin]);
        let r = beamMemo.get(key);
        if (!r) {
          r = null;
          let ct = bm.cover, cb = bm.cover;
          for (let it = 0; it < 6; it++) {
            const trial = { ...bm, coverTop: ct, coverBot: cb };
            const des = designBeamSupport(trial, s.mat, bm.MuHog * margin, bm.MuSag * margin, conservative);
            if (!des.ok) break;
            const topB = chooseBeamBars(des.top, bm.b, bm.cover, dLim);
            const botB = topB && chooseBeamBars(Math.max(des.bot, 0.5 * topB.area), bm.b, bm.cover, dLim);
            if (!topB || !botB) break;
            const nct = Math.max(ct, bm.cover + topB.shift), ncb = Math.max(cb, bm.cover + botB.shift);
            if (nct - ct < 1 && ncb - cb < 1) {
              // midspan: continuous top >= 1/4 top at face; bottom for midspan sagging
              const dS = bm.D - cb, rmin = (0.24 * Math.sqrt(s.mat.fck)) / s.mat.fy;
              const quarter = 0.25 * Math.max(topB.area, bm.farTop ?? 0);
              const midTopB = chooseBeamBars(Math.max(quarter, rmin * bm.b * (bm.D - ct), 2 * barArea(12)), bm.b, bm.cover, dLim);
              const pMid = { b: bm.b, d: dS, dc: ct, Asc: midTopB.area, fck: s.mat.fck, fy: s.mat.fy, bf: bm.useFlange ? bm.bf : 0, Df: bm.useFlange ? bm.Df : 0,
                Amin: Math.max(rmin * bm.b * dS, quarter), Amax: 0.025 * bm.b * dS };
              const midReq = bm.MuMid ? reqTension(bm.MuMid * margin, pMid) : pMid.Amin;
              const midBotB = isFinite(midReq) ? chooseBeamBars(midReq, bm.b, bm.cover, dLim) : null;
              if (!midBotB) break;
              r = { topB, botB, midTopB, midBotB, ct: bm.cover + topB.shift, cb: bm.cover + Math.max(botB.shift, midBotB.shift) };
              break;
            }
            ct = nct; cb = ncb;
          }
          beamMemo.set(key, r || false);
        }
        if (r) {
          const tr = { ...bm, coverTop: r.ct, coverBot: r.cb, top: r.topB.area, bot: r.botB.area, midTop: r.midTopB.area, midBot: r.midBotB.area,
            topBars: r.topB, botBars: r.botB, midBotBars: r.midBotB, maxDia: Math.max(r.topB.maxDia, r.botB.maxDia, r.midBotB.maxDia),
            minDia: Math.min(r.topB.minDia, r.botB.minDia), topText: r.topB.text, botText: r.botB.text, midTopText: r.midTopB.text, midBotText: r.midBotB.text };
          const ev = evaluate({ ...s, beams: { ...s.beams, [dir]: tr } });
          const bad = ev.checks.filter((c) => c.step.endsWith(`Beam ${dir}`) && c.status === "fail");
          if (!bad.length) { s.beams[dir] = tr; return true; }
        }
       }
        if (o.lockBeams) { log.push(`Beam ${dir}: cannot be designed at locked size ${bm.b}×${bm.D}`); return false; }
        if (bm.D + step <= maxBeamD) { bm.D += step; log.push(`Beam ${dir}: steel or shear beyond limits → depth ${bm.D} mm`); }
        else { bm.b += step; log.push(`Beam ${dir}: depth at limit → width ${bm.b} mm`); }
      }
      return false;
    };

    const growCol = (dir, why) => {
      if (o.lockColumn) return false;
      const key = dir === "X" ? "cx" : dir === "Y" ? "cy" : s.col.cx <= s.col.cy ? "cx" : "cy";
      if (s.col[key] + step > maxCol) return false;
      s.col[key] += step;
      log.push(`${why} → column ${s.col.cx}×${s.col.cy}`);
      return true;
    };

    // Least column steel (any practical layout) meeting P-M, spacing and SCWB.
    const designColumnSteel = () => {
      const cands = [];
      for (let nx = 2; nx <= 8; nx++) for (let ny = 2; ny <= 8; ny++) {
        for (const dc of BAR_DIAS.filter((d) => d >= 16)) for (const doo of BAR_DIAS.filter((d) => d >= 16 && d <= dc && dc - d <= 8)) {
          const trial = { ...s.col, nx, ny, cornerDia: dc, otherDia: doo };
          const b = colBars(trial);
          const rho = b.Asc / (s.col.cx * s.col.cy);
          if (rho < 0.008 || rho > 0.04) continue;
          if (!columnSpacing(trial).ok) continue;
          cands.push({ trial, Asc: b.Asc });
        }
      }
      cands.sort((a, b) => a.Asc - b.Asc);
      for (const c of cands) {
        const st = { ...s, col: c.trial, colAbove: s.colAbove && s.colAbove.same ? { same: true } : s.colAbove };
        const ev = evaluate(st);
        const ok = ev.checks.filter((x) => (x.step === "4 Column" && /Biaxial|Steel ratio|spacing/.test(x.item)) || x.step.startsWith("5 SCWB") || /Column lap/.test(x.item)).every((x) => x.status !== "fail");
        if (ok) return c.trial;
      }
      return null;
    };

    for (let iter = 0; iter < 60; iter++) {
      for (const d of ["X", "Y"]) if (s.beams[d].present && !designBeam(d)) return finish(false);

      // column geometry
      const PuMax = Math.max(...s.combos.map((c) => c.Pu));
      const maxBar = Math.max(s.beams.X.present ? s.beams.X.maxDia : 12, s.beams.Y.present ? s.beams.Y.maxDia : 12);
      const minDim = Math.max(300, 20 * maxBar);
      const above = s.colAbove && !s.colAbove.same ? s.colAbove : null;
      let geomOk = true;
      while ((PuMax * 1e3) / (s.mat.fck * s.col.cx * s.col.cy) > 0.4 || Math.min(s.col.cx, s.col.cy) < minDim ||
             (above && (s.col.cx < above.cx || s.col.cy < above.cy))) {
        const dir = above && s.col.cx < above.cx ? "X" : above && s.col.cy < above.cy ? "Y" : null;
        if (!growCol(dir, "Axial stress / bar anchorage / column above")) { geomOk = false; break; }
      }
      if (!geomOk) return finish(false);

      const colDes = designColumnSteel();
      if (!colDes) { if (!growCol(null, "Column steel would exceed 4 %")) return finish(false); continue; }
      Object.assign(s.col, colDes);
      const cb = colBars(s.col);
      s.col.barText = cb.Ac === cb.Ao && s.col.cornerDia === s.col.otherDia ? `${cb.nTotal}-${s.col.cornerDia}` : `4-${s.col.cornerDia} + ${cb.nTotal - 4}-${s.col.otherDia}`;
      s.col.Asc = cb.Asc;

      let ev = evaluate(s);
      // hoops: bigger diameter / more legs until spacing is practical (>= 75 mm)
      for (let t = 0; t < 8 && ev.hoops.s < 75; t++) {
        if (s.col.tieDia < 12) { s.col.tieDia += 2; log.push(`Hoops increased to ${s.col.tieDia} mm to avoid congestion`); }
        else if ((s.col.extraLegs || 0) < 2) { s.col.extraLegs = (s.col.extraLegs || 0) + 1; log.push("Extra cross-tie legs added to hoops"); }
        else break;
        ev = evaluate(s);
      }

      const jointFail = ev.checks.filter((c) => c.step.startsWith("7 Joint") && c.status === "fail");
      const otherFail = ev.checks.filter((c) => c.status === "fail" && !c.step.startsWith("7 Joint"));
      if (!jointFail.length && !otherFail.length) return finish(true);
      if (!jointFail.length) {
        if (!growCol(null, `Still failing: ${otherFail[0].item}`)) return finish(false);
        continue;
      }
      const dirs = [...new Set(jointFail.map((c) => c.step.slice(-1)))];
      let applied = false;
      while (!applied && sIdx < strategy.length) {
        const how = strategy[sIdx];
        if (how === "column") applied = dirs.map((d) => growCol(d, `Joint shear failed in ${d} (EQ22 option i)`)).some(Boolean);
        else if (how === "beam" && !o.lockBeams) {
          for (const d of dirs) {
            const bm = s.beams[d];
            if (bm.D + step <= Math.min(o.maxBeamD || 900, bm.Lc / 4)) { bm.D += step; applied = true; log.push(`Joint shear failed in ${d} → beam ${d} depth ${bm.D} mm (EQ22 option ii)`); }
          }
        } else if (how === "grade") {
          const gi = grades.indexOf(s.mat.fck);
          if (gi >= 0 && gi < grades.length - 1) { s.mat.fck = grades[gi + 1]; applied = true; log.push(`Joint shear failed → M${s.mat.fck} (EQ22 option iii; applies to the whole floor)`); }
        }
        if (!applied) sIdx++;
      }
      if (!applied) return finish(false);
    }
    return finish(false);

    function finish(converged) {
      const result = evaluate(s);
      const changes = stiffnessChanges(input, s);
      return { state: s, result, log, converged: converged && result.ok, reanalysis: changes };
    }
  }

  const api = {
    steelStress, tauC, tauCmax, devLength, beamCapacity, beamEndCaps, designBeamSupport, capacityShear, beamShear,
    colBars, colSection, columnPM, columnMuAtP, columnBiaxial, columnSpacing, jointBj, hoopDesign, deflectionCheck,
    chooseBeamBars, evaluate, redesign, quantities, autoConfinedFaces, stiffnessChanges, barArea,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SeismicEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
