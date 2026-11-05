# Seismic redesign automation

Checks and redesigns an RC beam-column joint for earthquake loading as per **IS 13920:2016** (with Amendments 1 & 2) and **IS 456:2000**. It follows the procedure of IITK-GSDMA **EQ22, Example 5** (interior beam-column joint, Zone V).

Starting from an initial design and its analysis forces, it makes sure that:

1. beams yield in flexure before they fail in shear, and
2. beams yield before columns and joints (strong column, weak beam).

## Files

| File | What it is |
|---|---|
| `flowchart.html` | The redesign procedure as a flowchart, with clause references and the review fixes |
| `dashboard.html` | Enter the initial design, get the code check, revised design, schedule and cost comparison |
| `engine.js` | All calculations (used by the dashboard, also runs in Node) |
| `example5.js` | EQ22 Example 5 input, shared by the dashboard and tests |
| `test_engine.js` | Checks against EQ22 Examples 1 and 5 and basic mechanics |

## Using it

Open `dashboard.html` in Chrome or Edge, keeping the other files in the same folder. Click **Load EQ22 Example 5** for a worked case, or enter your own design and press **Check & redesign**.

If the redesign changes any member's stiffness by more than 10 %, the result is marked **provisional**. Click **Use revised sizes as new input**, re-run your structural analysis with those sizes, enter the new forces and run again. Repeat until no member changes.

To compare with STAAD Pro / ETABS, enter the software's design under **Software design**. It is checked with the same forces.

To run the tests (needs Node.js):

```
node test_engine.js
```

## Method

- **Beams:** doubly reinforced design. The bottom steel required by Cl 6.2.3 is used as compression steel, giving the least top + bottom steel for the demand plus a design margin. Practical bar sets are chosen, and two-layer bars reduce the effective depth. Also checked: midspan, the ¼-top rule, deflection (span/d) and crack-control spacing.
- **Over-strength:** capacities are calculated by strain compatibility for the bars provided. Slab bars within the flange are included in the hogging capacity used for capacity design.
- **Beam shear:** Cl 6.3.3, using the hinge moments at both ends. The far end uses its own bars, and concrete is ignored.
- **Columns:**
  - axial stress ≤ 0.40 fck;
  - biaxial P-M with minimum eccentricity and slenderness moments (IS 456 Cl 39.7);
  - bar spacing, and laps fitting the middle half of the clear height;
  - strong column / weak beam: below + above column capacity ≥ 1.4 × beams, at each combination.
- **Column shear:** larger of the analysis shear and the beam-hinge shear. Hoops are designed for the shear the concrete can't carry.
- **Joint:** Cl 9, with beam and slab bars at 1.25 fy. Exterior joints also get an anchorage check.
- **Hoops:** least of the confinement (Ash), shear and code spacing limits. A minimum of 75 mm is kept to avoid congestion.
- **If the joint fails:** enlarge the column, deepen the beam or raise the grade (optional), each used until its limit, in the order chosen.
- **Cost:** main bars, links, hoops, concrete and formwork, with editable rates.

## Limits

- One joint at a time. The far beam end and the column above are inputs and should be checked at their own joints.
- No frame analysis inside the tool. It tells you when re-analysis is needed.
- Not covered: torsion, walls, flat slabs, foundations, P-Δ beyond IS 456 slenderness moments.
- Hoop spacing uses the stricter reading of Amendment 1 to Cl 7.6.1(b). Confirm against the printed amendment.

## References

The code documents are not included in this repository.

- IS 13920:2016, *Ductile Design and Detailing of Reinforced Concrete Structures Subjected to Seismic Forces*, Bureau of Indian Standards (with Amendments 1 and 2)
- IS 456:2000, *Plain and Reinforced Concrete – Code of Practice*
- IITK-GSDMA-EQ22-V3.0, *Explanatory Examples for Ductile Detailing of RC Buildings*, R. K. Ingle and S. K. Jain
