/*
 * EQ22 Example 5 input (interior joint, Zone V), shared by the dashboard and tests.
 * From EQ22: sizes, bars, beam capacities, column forces (Example 3, Table 3.2).
 * Not given in EQ22 and assumed here: beam design moments for the X beam, midspan
 * values, gravity loads, slab bars, analysis shears and the column above.
 */
(function (root) {
  const EXAMPLE5 = {
    mat: { fck: 20, fy: 415 },
    building: { height: 15, zone: 5, storeys: 5 },
    col: { cx: 400, cy: 500, nx: 4, ny: 5, Asc: 5714, cornerDia: 0, otherDia: 0, maxDia: 25, minDia: 16, dc: 52.5,
      hst: 3000, Lu: 2400, kEff: 1.2, tieDia: 8, clearCover: 40, Vu: { X: 120, Y: 140 } },
    colAbove: { same: true },
    beams: {
      X: { present: true, b: 300, D: 500, cover: 68, Lc: 3600, top: 2261, bot: 1746, farTop: 2261, farBot: 1746, midTop: 603, midBot: 1005,
        maxDia: 20, minDia: 16, MuHog: 250, MuSag: 180, MuMid: 120, VuAnalysis: 150, wDL_LL: 30,
        useFlange: true, bf: 1300, Df: 125, slabAs: 450, slabCover: 30 },
      Y: { present: true, b: 300, D: 600, cover: 68, Lc: 4500, top: 2374, bot: 1319, farTop: 2374, farBot: 1545, midTop: 603, midBot: 1206,
        maxDia: 20, minDia: 16, MuHog: 369, MuSag: 230, MuMid: 180, VuAnalysis: 250, wDL_LL: 34.5,
        useFlange: true, bf: 1633, Df: 125, slabAs: 560, slabCover: 30 },
    },
    joint: { X: { left: true, right: true }, Y: { left: true, right: true }, roof: false, PuForMc: "actual" },
    combos: [[1252, 204, 0], [1199, 202, 0], [1226, 1, 238], [1475, 255, 0], [1409, 252, 0], [1442, 2, 297], [898, 254, 0], [832, 253, 0], [865, 1, 297]]
      .map(([Pu, Mux, Muy]) => ({ Pu, Mux, Muy, PuAbove: Math.round(Pu * 0.78) })),
    options: { margin: 5, sizeStep: 50, maxColDim: 900, maxBeamD: 750, jointStrategy: ["column", "beam", "grade"], allowGrade: true },
    costs: { steel: 80, formwork: 600, concrete: { 20: 6500, 25: 7000, 30: 7500, 35: 8000, 40: 8500 } },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = { EXAMPLE5 };
  else root.EXAMPLE5 = EXAMPLE5;
})(typeof window !== "undefined" ? window : globalThis);
