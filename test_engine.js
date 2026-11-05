// Checks the engine against IITK-GSDMA EQ22 Example 5 (and Example 1/3 data it uses).
// Run: node test_engine.js
const E = require("./engine.js");

let fails = 0;
function near(label, got, want, tolPct) {
  const err = (Math.abs(got - want) / Math.abs(want)) * 100;
  const ok = err <= tolPct;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got.toFixed(1)}, EQ22 ${want} (${err.toFixed(1)} % off, tol ${tolPct} %)`);
}

const mat = { fck: 20, fy: 415 };

// Example 5 joint inputs. Column 400 (X) x 500 (Y), 10-25 + 4-16 = 5,714 mm2.
const example5 = {
  mat,
  building: { height: 15, zone: 5, storeys: 5 },
  col: { cx: 400, cy: 500, nx: 4, ny: 5, Asc: 5714, dc: 52.5, hst: 3000, Lu: 2500, minDia: 16, tieDia: 8, clearCover: 40 },
  beams: {
    // Longitudinal beam 300x500 (X): 2,261 top / 1,746 bottom
    X: { present: true, b: 300, D: 500, cover: 68, Lc: 3600, top: 2261, bot: 1746, MuHog: 250, MuSag: 180, VuAnalysis: 150,
         wDL_LL: 30, useFlange: true, bf: 1300, Df: 125, maxDia: 20, minDia: 16 },
    // Transverse beam 300x600 (Y): 2,374 top / 1,319 bottom
    Y: { present: true, b: 300, D: 600, cover: 68, Lc: 4500, top: 2374, bot: 1319, MuHog: 369, MuSag: 230, VuAnalysis: 250,
         wDL_LL: 34.5, useFlange: true, bf: 1633, Df: 125, maxDia: 20, minDia: 16 },
  },
  joint: { X: { left: true, right: true }, Y: { left: true, right: true }, roof: false, confinedFaces: 3, PuForMc: "zero" },
  combos: [
    { Pu: 1252, Mux: 204, Muy: 0 }, { Pu: 1199, Mux: 202, Muy: 0 }, { Pu: 1226, Mux: 1, Muy: 238 },
    { Pu: 1475, Mux: 255, Muy: 0 }, { Pu: 1409, Mux: 252, Muy: 0 }, { Pu: 1442, Mux: 2, Muy: 297 },
    { Pu: 898, Mux: 254, Muy: 0 }, { Pu: 832, Mux: 253, Muy: 0 }, { Pu: 865, Mux: 1, Muy: 297 },
  ],
  options: {},
};

console.log("\n-- Beam capacities (EQ22 used SP 16 tables / T-beam formula) --");
const capY = E.beamEndCapacities(example5.beams.Y, mat, 2374, 1319);
near("Transverse beam hogging", capY.hog.Mu, 377, 5);
near("Transverse beam sagging", capY.sag.Mu, 246, 5);

console.log("\n-- Column capacity at Pu = 0 (EQ22 used SP 16 chart 44) --");
const { secX, secY } = E.columnSections(example5.col, mat, 5714);
near("Column Mu, bending in Y (D = 500)", E.columnMuAtP(secY, 0), 380, 10); // SP 16 chart assumes bars spread evenly on 4 sides
near("Column Mu, bending in X (D = 400)", E.columnMuAtP(secX, 0), 284, 8);

console.log("\n-- Joint, earthquake in Y (EQ22 Sec 5.3) --");
const ev = E.evaluate(example5);
// EQ22 uses its own beam capacities (377 / 246) for Vcol; ours come from strain compatibility.
near("Joint shear Vj", ev.joint.Y.Vj, 1624, 3);
near("Joint capacity 1.2√fck·bj·hc", ev.joint.Y.cap, 1073, 1);
console.log(ev.joint.Y.Vj > ev.joint.Y.cap ? "PASS  Joint fails, as in EQ22" : (fails++, "FAIL  Joint should fail"));

console.log("\n-- Steel stress-strain sanity --");
near("Fe415 stress at 0.0038 strain", E.steelStress(0.0038, 415), 0.87 * 415, 0.1);
near("τc M20, pt = 1 %", E.tauC(20, 1.0), 0.62, 2);

console.log("\n-- Initial design check (IS 13920:2016) --");
for (const c of ev.checks.filter((c) => !c.ok)) console.log(`  not OK: [${c.step}] ${c.item}: ${c.value} vs ${c.limit} ${c.note}`);

console.log("\n-- Automatic redesign --");
const rd = E.redesign({ ...example5, joint: { ...example5.joint, PuForMc: "actual", confinedFaces: undefined } });
rd.log.forEach((l) => console.log("  " + l));
const s = rd.state;
console.log(`  converged: ${rd.converged}, all checks OK: ${rd.result.ok}`);
console.log(`  column ${s.col.cx} x ${s.col.cy}, ${s.col.barText} (${(100 * s.col.Asc / (s.col.cx * s.col.cy)).toFixed(2)} %), M${s.mat.fck}`);
for (const d of ["X", "Y"]) console.log(`  beam ${d} ${s.beams[d].b} x ${s.beams[d].D}: top ${s.beams[d].topText}, bottom ${s.beams[d].botText}`);
for (const c of rd.result.checks.filter((c) => !c.ok)) console.log(`  still not OK: [${c.step}] ${c.item}`);
if (!rd.result.ok) fails++;

console.log("\n-- Same redesign, conservative 'software-style' assumptions --");
const rc = E.redesign({ ...example5, joint: { ...example5.joint, PuForMc: "actual", confinedFaces: undefined }, options: { conservative: true } });
const cs = rc.state;
rc.log.forEach((l) => console.log("  " + l));
console.log(`  column ${cs.col.cx} x ${cs.col.cy}, ${cs.col.barText} (${(100 * cs.col.Asc / (cs.col.cx * cs.col.cy)).toFixed(2)} %), M${cs.mat.fck}`);
for (const d of ["X", "Y"]) console.log(`  beam ${d} ${cs.beams[d].b} x ${cs.beams[d].D}: top ${cs.beams[d].topText}, bottom ${cs.beams[d].botText}`);
console.log(`  steel near joint: refined ${E.steelQuantity(s).toFixed(0)} kg vs conservative ${E.steelQuantity(cs).toFixed(0)} kg`);
if (!rc.result.ok) fails++;

console.log(`\n${fails ? fails + " FAILED" : "All tests passed"}`);
process.exit(fails ? 1 : 0);
