/*
 * Seismic redesign engine - IS 13920:2016 (+ Amd 1 & 2), IS 456:2000.
 * Procedure follows IITK-GSDMA EQ22 Example 5 (beam-column joint).
 * Units: N, mm, MPa. Moments in kN-m and forces in kN at the input/output boundary only.
 *
 * Works in the browser (window.SeismicEngine) and in Node (module.exports).
 */
(function (root) {
  "use strict";

  const ES = 2e5;
  const BAR_DIAS = [12, 16, 20, 25, 28, 32];
  const barArea = (d) => (Math.PI * d * d) / 4;

  // ---------- Materials ----------

  // IS 456 Fig 23: design stress-strain for steel (returns signed stress, MPa).
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
    const p = Math.max(Math.min(pt, 3), 0.15);
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

  const xuMaxRatio = (fy) => 0.0035 / (0.0055 + (0.87 * fy) / ES);

  function bisect(fn, lo, hi, iters = 100) {
    let flo = fn(lo);
    for (let i = 0; i < iters; i++) {
      const mid = (lo + hi) / 2;
      const fm = fn(mid);
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ---------- Beam: doubly reinforced capacity by strain compatibility ----------
  /*
   * Rectangular (or flanged, for sagging) section with tension steel Ast at depth d and
   * compression steel Asc at depth dc from the compression face. Returns Mu (kN-m) and xu.
   * Flange (bf, Df) uses the IS 456 Annex G stress block.
   */
  function beamCapacity({ b, d, dc, Ast, Asc, fck, fy, bf = 0, Df = 0 }) {
    const flanged = bf > b && Df > 0;
    const conc = (xu) => {
      // returns [force N, moment about compression face N-mm]
      if (!flanged || xu <= Df) {
        const w = flanged ? bf : b;
        const C = 0.36 * fck * w * xu;
        return [C, C * 0.42 * xu];
      }
      const yf = Df / d <= 0.2 ? Df : Math.min(0.15 * xu + 0.65 * Df, Df);
      const Cw = 0.36 * fck * b * xu;
      const Cf = 0.45 * fck * (bf - b) * yf;
      return [Cw + Cf, Cw * 0.42 * xu + Cf * yf / 2];
    };
    const forces = (xu) => {
      const est = (0.0035 * (d - xu)) / xu;
      const esc = (0.0035 * (xu - dc)) / xu;
      const fst = steelStress(est, fy);
      let fsc = steelStress(esc, fy);
      if (esc > 0) fsc -= 0.446 * fck; // concrete displaced by compression bars
      const [C, Cm] = conc(xu);
      return { C, Cm, Fsc: Asc * fsc, T: Ast * fst, est };
    };
    const xu = bisect((x) => { const f = forces(x); return f.C + f.Fsc - f.T; }, 0.5, d * 1.2, 50);
    const f = forces(xu);
    const Mu = (f.T * d - f.Cm - f.Fsc * dc) / 1e6;
    return { Mu, xu, xuMax: xuMaxRatio(fy) * d, ductile: xu <= xuMaxRatio(fy) * d + 1e-6 };
  }

  // Hogging & sagging capacities at a beam end.
  function beamEndCapacities(beam, mat, top, bot) {
    const d = beam.D - beam.cover;
    const hog = beamCapacity({ b: beam.b, d, dc: beam.cover, Ast: top, Asc: bot, fck: mat.fck, fy: mat.fy });
    const sag = beamCapacity({
      b: beam.b, d, dc: beam.cover, Ast: bot, Asc: top, fck: mat.fck, fy: mat.fy,
      bf: beam.useFlange ? beam.bf : 0, Df: beam.useFlange ? beam.Df : 0,
    });
    return { hog, sag };
  }

  // ---------- Bar selection ----------
  function barsFit(n, dia, b, cover) {
    const clear = Math.max(dia, 25);
    const avail = b - 2 * (cover - dia / 2); // cover is to bar centre
    const perLayer = Math.max(2, Math.floor((avail + clear) / (dia + clear)));
    return n <= 2 * perLayer;
  }

  // Smallest-area combo n1-d1 (+ n2-d2) with at least 2 bars, >= req.
  function chooseBeamBars(req, b, cover, minDia = 12, maxDia = 32) {
    let best = null;
    const dias = BAR_DIAS.filter((d) => d >= minDia && d <= maxDia);
    for (const d1 of dias) {
      for (let n1 = 2; n1 <= 8; n1++) {
        for (const d2 of [0, ...dias.filter((x) => x < d1)]) {
          for (let n2 = 0; n2 <= (d2 ? 6 : 0); n2++) {
            if (d2 && n2 === 0) continue;
            const A = n1 * barArea(d1) + n2 * barArea(d2);
            if (A < req) continue;
            if (!barsFit(n1 + n2, d1, b, cover)) continue;
            if (!best || A < best.area - 1e-6 || (Math.abs(A - best.area) < 1e-6 && n1 + n2 < best.n)) {
              best = { area: A, n: n1 + n2, text: `${n1}-${d1}` + (n2 ? ` + ${n2}-${d2}` : ""), maxDia: d1 };
            }
          }
        }
      }
    }
    return best;
  }

  function chooseColumnBars(req, nTotal) {
    let best = null;
    for (const d1 of BAR_DIAS) {
      for (const d2 of BAR_DIAS.filter((x) => x <= d1)) {
        const A = 4 * barArea(d1) + (nTotal - 4) * barArea(d2);
        if (A < req) continue;
        if (!best || A < best.area) {
          best = { area: A, text: d1 === d2 ? `${nTotal}-${d1}` : `4-${d1} + ${nTotal - 4}-${d2}`, minDia: d2, maxDia: d1 };
        }
      }
    }
    return best;
  }

  // ---------- Beam design (economical, doubly reinforced) ----------
  /*
   * Finds the least top/bottom steel at the support so that
   *   hogging capacity >= Mu,hog using bottom bars as compression steel,
   *   sagging capacity >= Mu,sag using top bars as compression steel,
   *   bottom >= 0.5 top (Cl 6.2.3), rho >= rho_min (Cl 6.2.1), xu <= xu,max.
   * Software that designs each face as singly reinforced and then adds the
   * 50 % bottom steel on top ignores this compression-steel benefit.
   */
  function designBeamSupport(beam, mat, MuHog, MuSag) {
    const d = beam.D - beam.cover;
    const Amin = Math.max((0.24 * Math.sqrt(mat.fck) / mat.fy) * beam.b * d, 2 * barArea(12));
    const Amax = 0.025 * beam.b * d;
    const reqFor = (Mu, Asc, sag) => {
      const cap = (A) => {
        const r = beamCapacity({
          b: beam.b, d, dc: beam.cover, Ast: A, Asc, fck: mat.fck, fy: mat.fy,
          bf: sag && beam.useFlange ? beam.bf : 0, Df: sag && beam.useFlange ? beam.Df : 0,
        });
        return r;
      };
      if (cap(Amin).Mu >= Mu) return Amin;
      if (cap(Amax).Mu < Mu) return Infinity;
      return bisect((A) => cap(A).Mu - Mu, Amin, Amax, 60) * 1.0005;
    };
    if (beam.conservative) {
      // Typical package approach: each face designed as singly reinforced,
      // then bottom raised to half the top (compression steel not used).
      // Beyond Mu,lim the textbook (SP 16) doubly reinforced formula is used.
      const xm = xuMaxRatio(mat.fy) * d;
      const Mulim = (0.36 * mat.fck * beam.b * xm * (d - 0.42 * xm)) / 1e6;
      let top, ascNeed = 0;
      if (MuHog <= Mulim) top = Math.max(reqFor(MuHog, 0, false), Amin);
      else {
        const fsc = steelStress((0.0035 * (xm - beam.cover)) / xm, mat.fy) - 0.446 * mat.fck;
        ascNeed = ((MuHog - Mulim) * 1e6) / (fsc * (d - beam.cover));
        top = (0.36 * mat.fck * beam.b * xm) / (0.87 * mat.fy) + (ascNeed * fsc) / (0.87 * mat.fy);
      }
      const bot = Math.max(reqFor(MuSag, 0, true), 0.5 * top, ascNeed, Amin);
      if (!isFinite(top) || !isFinite(bot) || top > Amax || bot > Amax) return { top: Infinity, bot: Infinity, Amin, Amax, ok: false, d };
      return { top, bot, Amin, Amax, ok: true, d };
    }
    // Scan bottom (compression) steel; for each, find the least top steel that carries
    // the hogging moment while staying ductile. Keep the pair with the least total steel.
    let best = null;
    const step = Math.max((Amax - Amin) / 150, 5);
    for (let bot = Amin; bot <= Amax + 1e-6; bot += step) {
      const top = Math.max(reqFor(MuHog, bot, false), Amin);
      if (!isFinite(top) || top > Amax) continue;
      if (!beamCapacity({ b: beam.b, d, dc: beam.cover, Ast: top, Asc: bot, fck: mat.fck, fy: mat.fy }).ductile) continue;
      const botNeed = Math.max(reqFor(MuSag, top, true), 0.5 * top, Amin);
      if (!isFinite(botNeed) || botNeed > Amax) continue;
      const b2 = Math.max(bot, botNeed);
      if (!best || top + b2 < best.top + best.bot) best = { top, bot: b2 };
    }
    if (!best) return { top: Infinity, bot: Infinity, Amin, Amax, ok: false, d };
    return { top: best.top, bot: best.bot, Amin, Amax, ok: true, d };
  }

  // ---------- Beam shear (Cl 6.3) ----------
  function beamShear(beam, mat, caps, maxLongDiaMin) {
    const d = beam.D - beam.cover;
    const Vg = (1.2 * beam.wDL_LL * beam.Lc) / 2 / 1000; // kN, w in kN/m, Lc in mm
    const Vhinge = (1.4 * (caps.hog.Mu + caps.sag.Mu)) / (beam.Lc / 1000);
    const Vu = Math.max(beam.VuAnalysis || 0, Vg + Vhinge);
    const tv = (Vu * 1000) / (beam.b * d);
    const tmax = tauCmax(mat.fck);
    const legs = beam.b > 450 ? 4 : 2;
    let dia = 8, sCalc;
    for (dia of [8, 10, 12]) {
      sCalc = (0.87 * mat.fy * legs * barArea(dia) * d) / (Vu * 1000); // concrete ignored, Cl 6.3.4
      if (sCalc >= 75) break;
    }
    const sEndLimit = Math.min(d / 4, 8 * maxLongDiaMin, 100);
    const sEnd = Math.floor(Math.min(sCalc, sEndLimit) / 5) * 5;
    // Shear at 2d from face for the middle zone
    const Vmid = Math.max(Vu - (1.2 * beam.wDL_LL * 2 * d) / 1000, 0.4 * Vu);
    const sMidCalc = (0.87 * mat.fy * legs * barArea(dia) * d) / (Vmid * 1000);
    const sMid = Math.floor(Math.min(sMidCalc, d / 2) / 5) * 5;
    return {
      Vg, Vhinge, Vu, tv, tmax, ok: tv <= tmax && sEnd >= 50, legs, dia, sEnd, sMid,
      text: `${legs}L-${dia} @ ${sEnd} c/c over 2d (${Math.round(2 * d)} mm), ${sMid} c/c elsewhere; first link at 50 mm`,
    };
  }

  // ---------- Column: P-M by strain compatibility (IS 456 Cl 39) ----------
  /*
   * Bending about an axis so that "h" is the depth in the bending direction and
   * "w" the width. nFace = bars on each face perpendicular to bending (incl. corners),
   * nSide = bars on each side face (incl. corners). All bars equal area = Asc / nTotal.
   */
  function columnLayers(h, dc, nFace, nSide, Abar) {
    const layers = [{ y: dc, A: nFace * Abar }, { y: h - dc, A: nFace * Abar }];
    const inner = nSide - 2;
    for (let i = 1; i <= inner; i++) layers.push({ y: dc + ((h - 2 * dc) * i) / (inner + 1), A: 2 * Abar });
    return layers;
  }

  function columnPM(xu, { w, h, layers, fck, fy }) {
    let C, yC;
    if (xu <= h) {
      C = 0.36 * fck * w * xu; yC = 0.42 * xu;
    } else {
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

  // Moment capacity (kN-m) at axial load Pu (kN). Returns 0 if Pu exceeds capacity.
  function columnMuAtP(sec, Pu) {
    const lo = 1, hi = sec.h * 20;
    if (columnPM(hi, sec).P < Pu) return 0;
    if (columnPM(lo, sec).P > Pu) return columnPM(lo, sec).M; // tension-controlled extreme
    const xu = bisect((x) => columnPM(x, sec).P - Pu, lo, hi, 80);
    return Math.max(columnPM(xu, sec).M, 0);
  }

  function columnSections(col, mat, Asc) {
    const nTotal = 2 * col.nx + 2 * col.ny - 4;
    const Abar = Asc / nTotal;
    // Bending from X-direction beams: depth along X = cx; faces perpendicular to X carry ny bars.
    const secX = { w: col.cy, h: col.cx, layers: columnLayers(col.cx, col.dc, col.ny, col.nx, Abar), fck: mat.fck, fy: mat.fy };
    const secY = { w: col.cx, h: col.cy, layers: columnLayers(col.cy, col.dc, col.nx, col.ny, Abar), fck: mat.fck, fy: mat.fy };
    return { secX, secY, nTotal };
  }

  // IS 456 Cl 39.6 biaxial check. combos: [{Pu, Mux, Muy}] (kN, kN-m). Mux = moment in X-plane.
  function columnBiaxial(col, mat, Asc, combos) {
    const { secX, secY } = columnSections(col, mat, Asc);
    const Ag = col.cx * col.cy;
    const Puz = (0.45 * mat.fck * (Ag - Asc) + 0.75 * mat.fy * Asc) / 1e3;
    let worst = 0, worstRow = null;
    for (const c of combos) {
      const Mx1 = columnMuAtP(secX, c.Pu);
      const My1 = columnMuAtP(secY, c.Pu);
      const r = c.Pu / Puz;
      const an = r <= 0.2 ? 1 : r >= 0.8 ? 2 : 1 + (r - 0.2) / 0.6;
      const emin = (dim) => Math.max(col.Lu / 500 + dim / 30, 20) / 1000; // m
      const Mx = Math.max(Math.abs(c.Mux), c.Pu * emin(col.cx));
      const My = Math.max(Math.abs(c.Muy), c.Pu * emin(col.cy));
      const u = Mx1 > 0 && My1 > 0 ? Math.pow(Mx / Mx1, an) + Math.pow(My / My1, an) : 99;
      const util = c.Pu > 0.4 * mat.fck * Ag / 1e3 + 0.67 * mat.fy * Asc / 1e3 ? 99 : u;
      if (util > worst) { worst = util; worstRow = { ...c, Mx1, My1, an }; }
    }
    return { util: worst, ok: worst <= 1, worstRow, Puz };
  }

  // Least column moment capacity over the earthquake combos (Cl 7.2.1).
  function columnMcMin(sec, PuList) {
    let m = Infinity, atP = 0;
    for (const P of PuList) {
      const v = columnMuAtP(sec, P);
      if (v < m) { m = v; atP = P; }
    }
    return { Mc: m, atP };
  }

  // ---------- Joint (Cl 9) ----------
  function jointBj(bb, bc, hc) {
    return bb < bc ? Math.min(bc, bb + 0.5 * hc) : Math.min(bb, bc + 0.5 * hc);
  }

  // ---------- Confinement (Cl 7.6 as amended) ----------
  function confinement(col, mat, minLongDia, tieDia, clearCover) {
    const coreX = col.cx - 2 * clearCover, coreY = col.cy - 2 * clearCover;
    const Ak = coreX * coreY, Ag = col.cx * col.cy;
    const legsFor = (core) => Math.max(2, Math.ceil(core / 300) + 1);
    const h = Math.max(coreX / (legsFor(coreX) - 1), coreY / (legsFor(coreY) - 1));
    const Ash = barArea(tieDia);
    const k1 = 0.18 * h * (mat.fck / mat.fy) * (Ag / Ak - 1);
    const k2 = 0.05 * h * (mat.fck / mat.fy);
    const sAsh = Ash / Math.max(k1, k2);
    const sMax = 6 * minLongDia; // Amd 1, Cl 7.6.1(b)
    const s = Math.max(Math.floor(Math.min(sAsh, sMax) / 5) * 5, 0);
    const lo = Math.max(Math.max(col.cx, col.cy), col.Lu / 6, 450);
    return { lo, s, sAsh, sMax, h, legsX: legsFor(coreY), legsY: legsFor(coreX), tieDia, ok: s >= 50 };
  }

  // ---------- Full check of one design state ----------
  function evaluate(state) {
    const { mat, col, beams, joint, combos } = state;
    const out = { checks: [], beams: {}, column: {}, joint: {} };
    const add = (step, clause, item, value, limit, ok, note = "") => out.checks.push({ step, clause, item, value, limit, ok, note });

    // Step 0 - materials
    const minGrade = state.building.height > 15 && state.building.zone >= 3 ? 25 : 20;
    add("0 Materials", "5.2", "Concrete grade", `M${mat.fck}`, `≥ M${minGrade}`, mat.fck >= minGrade);
    add("0 Materials", "5.3.1 (Amd 2)", "Steel grade", `Fe${mat.fy}`, "Fe415 / 500 / 550", [415, 500, 550].includes(mat.fy));

    let maxBeamBar = 12;
    const PuList = combos.map((c) => c.Pu);
    const ΣMb = {};

    for (const dir of ["X", "Y"]) {
      const bm = beams[dir];
      if (!bm.present) continue;
      const d = bm.D - bm.cover;
      maxBeamBar = Math.max(maxBeamBar, bm.maxDia || 20);
      // Step 1 - geometry
      add(`1 Beam ${dir}`, "6.1.2", "Width b", `${bm.b} mm`, "≥ 200 mm", bm.b >= 200);
      add(`1 Beam ${dir}`, "6.1.1", "b / D", (bm.b / bm.D).toFixed(2), "≥ 0.3", bm.b / bm.D >= 0.3 - 1e-9);
      add(`1 Beam ${dir}`, "6.1.3", "D vs clear span", `${bm.D} mm`, `≤ Lc/4 = ${Math.round(bm.Lc / 4)}`, bm.D <= bm.Lc / 4);
      const c2 = dir === "X" ? col.cy : col.cx, c1 = dir === "X" ? col.cx : col.cy;
      const bwMax = c2 + 2 * Math.min(c2, 0.75 * c1);
      add(`1 Beam ${dir}`, "6.1.4", "Width vs column", `${bm.b} mm`, `≤ ${Math.round(bwMax)} mm`, bm.b <= bwMax);

      // Step 2 - flexure
      const Amin = (0.24 * Math.sqrt(mat.fck) / mat.fy) * bm.b * d;
      const Amax = 0.025 * bm.b * d;
      const caps = beamEndCapacities(bm, mat, bm.top, bm.bot);
      add(`2 Beam ${dir}`, "6.2.1", "Top & bottom ≥ ρmin", `${Math.round(Math.min(bm.top, bm.bot))} mm²`, `≥ ${Math.round(Amin)} mm²`, Math.min(bm.top, bm.bot) >= Amin);
      add(`2 Beam ${dir}`, "6.2.2", "ρ ≤ 2.5%", `${(100 * Math.max(bm.top, bm.bot) / (bm.b * d)).toFixed(2)} %`, "≤ 2.5 %", Math.max(bm.top, bm.bot) <= Amax);
      add(`2 Beam ${dir}`, "6.2.3", "Bottom ≥ ½ top at face", `${Math.round(bm.bot)} mm²`, `≥ ${Math.round(bm.top / 2)} mm²`, bm.bot >= bm.top / 2 - 1);
      add(`2 Beam ${dir}`, "IS 456", "Hogging capacity", `${caps.hog.Mu.toFixed(0)} kN-m`, `≥ ${bm.MuHog} kN-m`, caps.hog.Mu >= bm.MuHog, "doubly reinforced, strain compatibility");
      add(`2 Beam ${dir}`, "IS 456", "Sagging capacity", `${caps.sag.Mu.toFixed(0)} kN-m`, `≥ ${bm.MuSag} kN-m`, caps.sag.Mu >= bm.MuSag, bm.useFlange ? "T-beam with slab flange" : "rectangular");
      add(`2 Beam ${dir}`, "IS 456 38.1", "Ductile (xu ≤ xu,max) hogging", `${caps.hog.xu.toFixed(0)} mm`, `≤ ${caps.hog.xuMax.toFixed(0)} mm`, caps.hog.ductile);

      // Step 3 - capacity shear
      const sh = beamShear(bm, mat, caps, bm.minDia || 16);
      add(`3 Beam ${dir}`, "6.3.3", "Design shear (hinges at both ends)", `${sh.Vu.toFixed(0)} kN`, `= 1.2(D+L) ${sh.Vg.toFixed(0)} + 1.4ΣMu/Lc ${sh.Vhinge.toFixed(0)}`, true);
      add(`3 Beam ${dir}`, "IS 456 T20", "τv ≤ τc,max", `${sh.tv.toFixed(2)} MPa`, `≤ ${sh.tmax} MPa`, sh.tv <= sh.tmax);
      add(`3 Beam ${dir}`, "6.3.5", "Links (concrete ignored, 6.3.4)", sh.text, "s ≤ d/4, 8φ, 100", sh.ok);

      const nSides = (joint[dir].left ? 1 : 0) + (joint[dir].right ? 1 : 0);
      ΣMb[dir] = nSides === 2 ? caps.hog.Mu + caps.sag.Mu : Math.max(caps.hog.Mu, caps.sag.Mu);
      out.beams[dir] = { caps, shear: sh, Amin, Amax, d };
    }

    // Step 4 - column
    const Ag = col.cx * col.cy;
    const PuMax = Math.max(...PuList);
    const axial = (PuMax * 1e3) / (mat.fck * Ag);
    add("4 Column", "7.1 (Amd 2)", "Pu / (fck Ag)", axial.toFixed(3), "≤ 0.40", axial <= 0.4);
    const minDim = Math.max(300, 20 * maxBeamBar);
    add("4 Column", "7.1.1", "Min dimension", `${Math.min(col.cx, col.cy)} mm`, `≥ ${minDim} mm`, Math.min(col.cx, col.cy) >= minDim);
    add("4 Column", "7.1.2", "Aspect ratio", (Math.min(col.cx, col.cy) / Math.max(col.cx, col.cy)).toFixed(2), "≥ 0.45", Math.min(col.cx, col.cy) / Math.max(col.cx, col.cy) >= 0.45);
    const rho = (100 * col.Asc) / Ag;
    add("4 Column", "IS 456 26.5.3", "Steel ratio", `${rho.toFixed(2)} %`, "0.8 – 4 %", rho >= 0.8 && rho <= 4.0);
    const bx = columnBiaxial(col, mat, col.Asc, combos);
    add("4 Column", "IS 456 39.6", "Biaxial P-M utilisation", bx.util.toFixed(2), "≤ 1.00", bx.ok);
    out.column.biaxial = bx;

    // Step 5 - strong column weak beam
    const { secX, secY } = columnSections(col, mat, col.Asc);
    const nCol = joint.roof ? 1 : 2;
    for (const dir of ["X", "Y"]) {
      if (!beams[dir].present) continue;
      const mc = columnMcMin(dir === "X" ? secX : secY, joint.PuForMc === "zero" ? [0] : joint.PuForMc === "both" ? [0, ...PuList] : PuList);
      const ΣMc = nCol * mc.Mc;
      const ratio = ΣMc / ΣMb[dir];
      const waived = joint.roof && state.building.storeys > 4;
      add(`5 SCWB ${dir}`, "7.2.1", "ΣMc / ΣMb", ratio.toFixed(2), waived ? "waived (roof, > 4 storeys)" : "≥ 1.4", waived || ratio >= 1.4,
        `ΣMc = ${ΣMc.toFixed(0)} (Mc at Pu = ${mc.atP} kN), ΣMb = ${ΣMb[dir].toFixed(0)} kN-m`);
      out.column["Mc" + dir] = mc;
      out.column["ratio" + dir] = ratio;

      // Step 6 - column shear
      const Vcol = (1.4 * ΣMb[dir]) / (col.hst / 1000);
      const Vu = Math.max(Vcol, col["Vu" + dir] || 0);
      const w = dir === "X" ? col.cy : col.cx, h = dir === "X" ? col.cx : col.cy;
      const dcol = h - col.dc;
      const PuMin = Math.max(Math.min(...PuList), 0);
      const delta = Math.min(1 + (3 * PuMin * 1e3) / (Ag * mat.fck), 1.5);
      const Vc = (tauC(mat.fck, rho / 2) * delta * w * dcol) / 1e3;
      const tv = (Vu * 1e3) / (w * dcol);
      add(`6 Col shear ${dir}`, "7.5", "Shear demand", `${Vu.toFixed(0)} kN`, `Vc = ${Vc.toFixed(0)} kN`, tv <= tauCmax(mat.fck),
        Vu > Vc ? `ties for Vus = ${(Vu - Vc).toFixed(0)} kN` : "concrete alone sufficient");
      out.column["Vcol" + dir] = Vcol;
      out.column["Vus" + dir] = Math.max(Vu - Vc, 0);
      out.column["d" + dir] = dcol;

      // Step 7 - joint shear
      const bm = beams[dir];
      const caps = out.beams[dir].caps;
      const T1 = (1.25 * mat.fy * bm.top) / 1e3;
      const C2 = joint[dir].left && joint[dir].right ? (1.25 * mat.fy * bm.bot) / 1e3 : 0;
      const Vcj = (1.4 * (caps.hog.Mu + (C2 ? caps.sag.Mu : 0))) / (col.hst / 1000);
      const Vj = T1 + C2 - Vcj;
      const hc = h, bc = w;
      const bj = jointBj(bm.b, bc, hc);
      const faces = joint.confinedFaces ?? autoConfinedFaces(state);
      const kj = faces >= 4 ? 1.5 : faces === 3 ? 1.2 : 1.0;
      const cap = (kj * Math.sqrt(mat.fck) * bj * hc) / 1e3;
      add(`7 Joint ${dir}`, "9.1 (Amd 2)", "Joint shear Vj", `${Vj.toFixed(0)} kN`, `≤ ${kj}√fck·bj·hc = ${cap.toFixed(0)} kN`, Vj <= cap,
        `T = ${T1.toFixed(0)}, C = ${C2.toFixed(0)}, Vcol = ${Vcj.toFixed(0)}, bj = ${bj.toFixed(0)}, hc = ${hc}`);
      add(`7 Joint ${dir}`, "9.1.3", "Column width ≥ 20 × beam bar", `${hc} mm`, `≥ ${20 * (bm.maxDia || 20)} mm`, hc >= 20 * (bm.maxDia || 20));
      out.joint[dir] = { Vj, cap, bj, hc, kj, ratio: Vj / cap };
    }

    // Step 8 - confinement
    const conf = confinement(col, mat, col.minDia || 16, col.tieDia || 10, col.clearCover || 40);
    const fullJoint = (joint.confinedFaces ?? autoConfinedFaces(state)) >= 4;
    add("8 Confinement", "7.6.1", "Special confining zone lo", `${conf.lo.toFixed(0)} mm`, "≥ max(D, Lc/6, 450)", true);
    add("8 Confinement", "7.6.1(c)", "Hoop spacing", `${col.tieDia || 10} mm @ ${conf.s} c/c`, `Ash ⇒ ${conf.sAsh.toFixed(0)}, 6φ ⇒ ${conf.sMax}`, conf.ok,
      `link leg spacing h = ${conf.h.toFixed(0)} mm`);
    add("8 Confinement", "9.2.1", "Joint hoops", fullJoint ? `${col.tieDia || 10} @ ${Math.min(2 * conf.s, 150)} (½ Ash)` : `${col.tieDia || 10} @ ${conf.s} (full Ash)`,
      fullJoint ? "4 faces confined" : "not all faces confined", true);
    out.confinement = conf;

    out.ok = out.checks.every((c) => c.ok);
    return out;
  }

  function autoConfinedFaces(state) {
    const { col, beams, joint } = state;
    let n = 0;
    // X-beams frame into faces of width cy; Y-beams into faces of width cx.
    for (const side of ["left", "right"]) {
      if (beams.X.present && joint.X[side] && beams.X.b >= 0.75 * col.cy) n++;
      if (beams.Y.present && joint.Y[side] && beams.Y.b >= 0.75 * col.cx) n++;
    }
    return n;
  }

  // ---------- Automatic redesign ----------
  /*
   * Follows the flowchart: economical beams first (they are the fuse), then the
   * column is sized to beat them by 1.4, then the joint. A joint failure sends the
   * design back with a bigger column (EQ22 option i), deeper beam (ii) or higher grade (iii).
   */
  function redesign(input) {
    const s = JSON.parse(JSON.stringify(input));
    const log = [];
    if (s.options.conservative) {
      s.beams.X.conservative = s.beams.Y.conservative = true;
      s.joint.PuForMc = "both"; // least of Pu = 0 and actual Pu
    }
    const strategy = s.options.jointStrategy || ["column", "beam", "grade"];
    const grades = [20, 25, 30, 35, 40];
    let sIdx = 0;

    for (let iter = 0; iter < 40; iter++) {
      // --- Beams (Steps 1-3) ---
      for (const dir of ["X", "Y"]) {
        const bm = s.beams[dir];
        if (!bm.present) continue;
        for (let k = 0; k < 20; k++) {
          const des = designBeamSupport(bm, s.mat, bm.MuHog, bm.MuSag);
          const tv = () => {
            const caps = beamEndCapacities(bm, s.mat, des.top, des.bot);
            const sh = beamShear(bm, s.mat, caps, 16);
            return sh.tv <= sh.tmax;
          };
          if (des.ok && tv()) {
            // Keep 20 x bar dia within the column (Cl 7.1.1, 9.1.3), 25 mm max for practicality.
            const dLim = Math.max(16, Math.min(25, Math.floor(Math.min(s.col.cx, s.col.cy) / 20)));
            const topB = chooseBeamBars(des.top, bm.b, bm.cover, 12, dLim);
            const botB = chooseBeamBars(des.bot, bm.b, bm.cover, 12, dLim);
            if (topB && botB) {
              bm.top = topB.area; bm.bot = Math.max(botB.area, 0);
              bm.topText = topB.text; bm.botText = botB.text;
              bm.maxDia = Math.max(topB.maxDia, botB.maxDia);
              bm.minDia = 12;
              break;
            }
          }
          if (bm.D + 50 <= bm.Lc / 4) { bm.D += 50; log.push(`Beam ${dir}: steel beyond limits, depth increased to ${bm.D} mm`); }
          else { bm.b += 50; log.push(`Beam ${dir}: width increased to ${bm.b} mm`); }
        }
      }

      // --- Column size for axial stress & geometry (Step 4) ---
      const PuMax = Math.max(...s.combos.map((c) => c.Pu));
      let maxBar = Math.max(s.beams.X.maxDia || 12, s.beams.Y.maxDia || 12);
      const minDim = Math.max(300, 20 * maxBar);
      while ((PuMax * 1e3) / (s.mat.fck * s.col.cx * s.col.cy) > 0.4 || Math.min(s.col.cx, s.col.cy) < minDim) {
        if (s.col.cx <= s.col.cy) s.col.cx += 50; else s.col.cy += 50;
        log.push(`Column enlarged to ${s.col.cx} x ${s.col.cy} for axial stress / beam bar anchorage`);
      }

      // --- Column steel: least ρ meeting P-M and SCWB (Steps 4-5) ---
      const Ag = s.col.cx * s.col.cy;
      const nTotal = 2 * s.col.nx + 2 * s.col.ny - 4;
      let found = null;
      for (let rho = 0.8; rho <= 4.0001; rho += 0.05) {
        const req = (rho / 100) * Ag;
        const bars = chooseColumnBars(req, nTotal);
        if (!bars || bars.area > 0.04 * Ag) continue;
        const trial = { ...s.col, Asc: bars.area, minDia: bars.minDia };
        const st = { ...s, col: trial };
        const ev = evaluate(st);
        const pmOk = ev.checks.filter((c) => c.step === "4 Column" && c.item === "Biaxial P-M utilisation").every((c) => c.ok);
        const scwbOk = ev.checks.filter((c) => c.step.startsWith("5 SCWB")).every((c) => c.ok);
        if (pmOk && scwbOk) { found = bars; break; }
      }
      if (!found) {
        if (s.col.cx <= s.col.cy) s.col.cx += 50; else s.col.cy += 50;
        log.push(`Column steel would exceed 4 % → column enlarged to ${s.col.cx} x ${s.col.cy}`);
        continue;
      }
      s.col.Asc = found.area; s.col.barText = found.text; s.col.minDia = found.minDia;

      // --- Joint (Step 7) ---
      const ev = evaluate(s);
      const jointFail = ev.checks.filter((c) => c.step.startsWith("7 Joint") && !c.ok);
      const confFail = ev.checks.filter((c) => c.step.startsWith("8") && !c.ok);
      if (!jointFail.length && !confFail.length) {
        // tie diameter for column shear
        return { state: s, result: ev, log, converged: true };
      }
      if (confFail.length && s.col.tieDia < 12) { s.col.tieDia += 2; log.push(`Confining hoop diameter increased to ${s.col.tieDia} mm`); continue; }
      const how = strategy[sIdx % strategy.length];
      sIdx++;
      const failDirs = jointFail.map((c) => c.step.slice(-1));
      if (how === "column") {
        for (const dir of new Set(failDirs)) { if (dir === "X") s.col.cx += 50; else s.col.cy += 50; }
        log.push(`Joint shear failed (${[...new Set(failDirs)].join(", ")}) → column enlarged to ${s.col.cx} x ${s.col.cy} (EQ22 option i)`);
      } else if (how === "beam") {
        for (const dir of new Set(failDirs)) {
          const bm = s.beams[dir];
          if (bm.D + 50 <= bm.Lc / 4) { bm.D += 50; log.push(`Joint shear failed → beam ${dir} deepened to ${bm.D} mm (EQ22 option ii)`); }
        }
      } else if (how === "grade") {
        const gi = grades.indexOf(s.mat.fck);
        if (gi >= 0 && gi < grades.length - 1) { s.mat.fck = grades[gi + 1]; log.push(`Joint shear failed → concrete raised to M${s.mat.fck} (EQ22 option iii)`); }
      }
    }
    return { state: s, result: evaluate(s), log, converged: false };
  }

  // Steel volume per joint region (rough quantity for comparing designs), kg.
  function steelQuantity(state) {
    const kgPerMm3 = 7850e-9;
    let v = 0;
    for (const dir of ["X", "Y"]) {
      const bm = state.beams[dir];
      if (bm.present) v += (bm.top + bm.bot) * bm.Lc * ((state.joint[dir].left ? 1 : 0) + (state.joint[dir].right ? 1 : 0));
    }
    v += state.col.Asc * state.col.hst * (state.joint.roof ? 1 : 2);
    return v * kgPerMm3;
  }

  const api = {
    steelStress, tauC, tauCmax, beamCapacity, beamEndCapacities, designBeamSupport, beamShear,
    columnSections, columnPM, columnMuAtP, columnBiaxial, columnMcMin, jointBj, confinement,
    chooseBeamBars, chooseColumnBars, evaluate, redesign, steelQuantity, autoConfinedFaces, barArea,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SeismicEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
