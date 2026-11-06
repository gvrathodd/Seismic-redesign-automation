// Checks the engine against IITK-GSDMA EQ22 (Examples 1 and 5) and basic mechanics.
// Run: node test_engine.js
const E = require("./engine.js");
const { EXAMPLE5 } = require("./example5.js");

let fails = 0;
function near(label, got, want, tolPct, why = "") {
  const err = (Math.abs(got - want) / Math.abs(want)) * 100;
  const ok = err <= tolPct;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got.toFixed(1)}, expected ${want} (${err.toFixed(1)} % off, tol ${tolPct} %)${why ? " – " + why : ""}`);
}
function truthy(label, cond) {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
}
const mat = { fck: 20, fy: 415 };

console.log("-- Material models --");
near("Fe415 design yield stress", E.steelStress(0.0038, 415), 361.05, 0.1);
near("τc, M20, pt = 1 % (IS 456 Table 19: 0.62)", E.tauC(20, 1.0), 0.62, 2);
near("Ld, 20 mm Fe415 M20 (SP 16 Table 65: 47φ = 940)", E.devLength(20, 415, 20), 940, 1);

console.log("\n-- EQ22 Example 1: beam 300x600, d = 532, d' = 68, Mu = 369 kN-m (SP 16 Table 50) --");
const ex1 = { b: 300, D: 600, cover: 68, useFlange: false };
const tb = E.designBeamSupport(ex1, mat, 369, 0, true);
near("Top steel, textbook doubly reinforced", tb.top, 2330, 2);
near("Compression steel from Mu > Mu,lim", tb.bot, 1165, 2, "EQ22 raises 862 to ½ top = 1,165 (Cl 6.2.3)");
const rf = E.designBeamSupport(ex1, mat, 369, 0, false);
truthy(`Refined design needs less steel: ${Math.round(rf.top + rf.bot)} vs ${Math.round(tb.top + tb.bot)} mm²`, rf.top + rf.bot < tb.top + tb.bot);
const hinge = E.capacityShear(0, { sag: { Mu: 286 }, hog: { Mu: 377 } }, { sag: { Mu: 286 }, hog: { Mu: 377 } }, 5000);
near("Hinge shear 1.4(286 + 377)/5 (EQ22 186 kN)", hinge.Vhinge, 186, 0.5);

console.log("\n-- Mechanics cross-check: column with bars on 2 faces at Pu = 0 equals the doubly reinforced beam --");
const twoFace = { cx: 500, cy: 300, nx: 2, ny: 4, Asc: 8 * 314.16, dc: 50 };
const colM = E.columnMuAtP(E.colSection(twoFace, mat, "X"), 0);
const beamM = E.beamCapacity({ b: 300, d: 450, dc: 50, Ast: 4 * 314.16, Asc: 4 * 314.16, fck: 20, fy: 415 }).Mu;
near("Column M at P = 0 vs beam M", colM, +beamM.toFixed(1), 1.5);

console.log("\n-- EQ22 Example 5: interior joint --");
const capY = E.beamEndCaps(EXAMPLE5.beams.Y, mat, 2374, 1319, false);
near("Transverse beam hogging", capY.hog.Mu, 377, 5, "EQ22 reads SP 16 table at the lower value; exact is higher");
near("Transverse beam sagging (T-beam)", capY.sag.Mu, 246, 5);
const ev = E.evaluate({ ...EXAMPLE5, joint: { ...EXAMPLE5.joint, confinedFaces: 3 }, beams: { X: { ...EXAMPLE5.beams.X, slabAs: 0 }, Y: { ...EXAMPLE5.beams.Y, slabAs: 0 } } });
near("Joint shear Vj, Y (no slab bars, as EQ22)", ev.joint.Y.Vj, 1624, 3);
near("Joint capacity 1.2√fck·bj·hc", ev.joint.Y.cap, 1073, 1);
truthy("Joint fails, as in EQ22", ev.joint.Y.Vj > ev.joint.Y.cap);
// Information only: SP 16 chart 44 assumes bars spread evenly on all faces; layout here differs.
const McY = E.columnMuAtP(E.colSection(EXAMPLE5.col, mat, "Y"), 0);
console.log(`INFO  Column Mu at Pu = 0, Y: ${McY.toFixed(0)} kN-m vs EQ22 chart value 380 (bar layout differs from chart)`);

console.log("\n-- Slab bars raise the beam's over-strength --");
const withSlab = E.beamEndCaps({ ...EXAMPLE5.beams.Y, slabAs: 600 }, mat, 2374, 1319, true).hog.Mu;
truthy(`Hogging with 600 mm² slab bars ${withSlab.toFixed(0)} > ${capY.hog.Mu.toFixed(0)} kN-m`, withSlab > capY.hog.Mu + 20);

console.log("\n-- Initial design check --");
const ev0 = E.evaluate(EXAMPLE5);
for (const c of ev0.checks.filter((c) => c.status !== "ok")) console.log(`  ${c.status.toUpperCase()}: [${c.step}] ${c.item}: ${c.value} vs ${c.limit}`);

function show(tag, rd) {
  const s = rd.state;
  console.log(`\n-- Redesign: ${tag} --`);
  rd.log.forEach((l) => console.log("  " + l));
  console.log(`  passes all checks: ${rd.result.ok}, warnings: ${rd.result.warnings}`);
  console.log(`  column ${s.col.cx} x ${s.col.cy}, ${s.col.barText} (${(100 * s.col.Asc / (s.col.cx * s.col.cy)).toFixed(2)} %), hoops ${rd.result.hoops.tieDia} @ ${rd.result.hoops.s}, M${s.mat.fck}`);
  for (const d of ["X", "Y"]) {
    const b = s.beams[d];
    console.log(`  beam ${d} ${b.b} x ${b.D}: top ${b.topText}, bottom ${b.botText}, midspan bottom ${b.midBotText}`);
  }
  const q = rd.result.qty;
  console.log(`  steel ${q.steelKg.toFixed(0)} kg + links ${q.linksKg.toFixed(0)} kg, concrete ${q.concreteM3.toFixed(2)} m³, cost ₹${Math.round(q.cost).toLocaleString("en-IN")}`);
  console.log(`  re-analysis needed for: ${rd.reanalysis.join("; ") || "nothing"}`);
  for (const c of rd.result.checks.filter((c) => c.status === "fail")) console.log(`  STILL FAILS: [${c.step}] ${c.item}`);
  return rd;
}
const t0 = Date.now();
const r1 = show("refined", E.redesign(EXAMPLE5));
const r2 = show("simplified textbook method", E.redesign({ ...EXAMPLE5, options: { ...EXAMPLE5.options, conservative: true } }));
console.log(`  (${Date.now() - t0} ms)`);
truthy("Refined redesign passes", r1.result.ok);
truthy("Simplified redesign passes", r2.result.ok);
truthy("Sizes changed, so re-analysis is flagged", r1.reanalysis.length > 0);

const r3 = E.redesign({ ...EXAMPLE5, options: { ...EXAMPLE5.options, lockColumn: true, lockBeams: true } });
truthy(`Locked sizes: reports failure instead of resizing (converged = ${r3.converged})`, !r3.converged && r3.state.col.cx === EXAMPLE5.col.cx);

console.log("\n-- Health Centre (STAAD, Zone V): gravity-only design at column D3, first floor --");
const { HEALTH_CENTRE } = require("./example_health_centre.js");
const hc0 = E.evaluate(HEALTH_CENTRE);
truthy(`Gravity-only design fails the seismic checks (${hc0.checks.filter((c) => c.status === "fail").length} failures)`, !hc0.ok);
const hc = E.redesign(HEALTH_CENTRE);
truthy(`Redesign passes: column ${hc.state.col.cx}×${hc.state.col.cy} ${hc.state.col.barText}, beams ${hc.state.beams.X.D} / ${hc.state.beams.Y.D} deep`, hc.result.ok);

console.log(`\n${fails ? fails + " FAILED" : "All tests passed"}`);
process.exit(fails ? 1 : 0);
