# Seismic redesign automation

Checks and redesigns an RC beam-column joint for earthquake loading as per **IS 13920:2016** (with Amendments 1 & 2) and **IS 456:2000**. It follows the procedure of IITK-GSDMA **EQ22, Example 5** (interior beam-column joint, Zone V).

Starting from an initial design, it makes sure that:

1. beams yield in flexure before they fail in shear, and
2. beams yield before columns and joints (strong column, weak beam).

## Files

| File | What it is |
|---|---|
| `flowchart.html` | Phase 1: the redesign procedure as a flowchart, with clause references |
| `dashboard.html` | Phase 2: enter the initial design, get the code check and the revised design |
| `engine.js` | All calculations (used by the dashboard, also runs in Node) |
| `test_engine.js` | Checks the engine against the numbers in EQ22 Example 5 |

## Using it

Open `dashboard.html` in Chrome or Edge, keeping `engine.js` in the same folder. Click **Load EQ22 Example 5** to see a worked case, or enter your own design and press **Check & redesign**.

To run the tests (needs Node.js):

```
node test_engine.js
```

## Method

- **Beams** are designed as doubly reinforced sections. The bottom steel that Cl 6.2.3 requires (at least half the top steel at each column face) is used as compression steel, giving the least top + bottom steel. Capacities are calculated by strain compatibility (IS 456 Cl 38.1) for the bars actually chosen.
- **Beam shear** is the capacity-design shear of Cl 6.3.3: 1.2(DL+LL) plus 1.4 × hinge moments / clear span, with concrete ignored (Cl 6.3.4).
- **Columns** are checked for axial stress (≤ 0.40 fck), biaxial P-M (IS 456 Cl 39.6) and strong column / weak beam (ΣMc ≥ 1.4 ΣMb, Cl 7.2.1). Column capacity is taken as the least over the actual earthquake load combinations.
- **Joint shear** follows Cl 9.1: beam bars at 1.25 fy, joint strength 1.5 / 1.2 / 1.0 √fck × joint area.
- **Confinement** follows Cl 7.6 and 9.2.
- If the joint fails, the redesign tries EQ22's three options in order: enlarge the column, deepen the beam, or raise the concrete grade.

The dashboard also shows a "software-style" redesign using the usual simplifications: singly reinforced beam design, then ½-top bottom steel added, and column capacity at Pu = 0. This shows how much over-design those simplifications cause.

## Limits

- One joint at a time, with the same beam section on both sides of the joint.
- Columns are treated as having bars of equal area.
- Beam and column forces come from your own structural analysis.

## References

The code documents are not included in this repository.

- IS 13920:2016, *Ductile Design and Detailing of Reinforced Concrete Structures Subjected to Seismic Forces*, Bureau of Indian Standards (with Amendments 1 and 2)
- IS 456:2000, *Plain and Reinforced Concrete – Code of Practice*
- IITK-GSDMA-EQ22-V3.0, *Explanatory Examples for Ductile Detailing of RC Buildings*, R. K. Ingle and S. K. Jain
