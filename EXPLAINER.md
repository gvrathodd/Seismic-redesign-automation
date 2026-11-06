# Seismic redesign of RC beam-column joints — the full explanation

This document explains the project from first principles. If you know how to design a beam, a column and a slab to IS 456, you should be able to read this once and then explain every step of the project to a structural engineer: what is being checked, which clause requires it, the formula used, and why it is done that way.

Contents

1. [The problem in one page](#1-the-problem-in-one-page)
2. [Background: why earthquake design is different](#2-background-why-earthquake-design-is-different)
3. [The documents used](#3-the-documents-used)
4. [The procedure, step by step](#4-the-procedure-step-by-step)
5. [Why "more steel" is not "more safe"](#5-why-more-steel-is-not-more-safe)
6. [How the automatic redesign works](#6-how-the-automatic-redesign-works)
7. [Worked example 1: EQ22 Example 5](#7-worked-example-1-eq22-example-5)
8. [Worked example 2: the Health Centre (STAAD.Pro)](#8-worked-example-2-the-health-centre-staadpro)
9. [How the results were validated](#9-how-the-results-were-validated)
10. [Assumptions and limits](#10-assumptions-and-limits)
11. [Questions a structural engineer will ask](#11-questions-a-structural-engineer-will-ask)
12. [Glossary](#12-glossary)

---

## 1. The problem in one page

A building's beams and columns are first designed for gravity: dead load and live load, IS 456, load factor 1.5. In an earthquake zone that design is only a starting point. The members must then be checked, and usually revised, so that **when a strong earthquake comes, the building fails in a controlled, predictable order**:

1. **Beams must fail before columns.** A damaged beam affects one floor locally; a failed column can bring down every floor above it.
2. **Beams must fail in bending (flexure) before they fail in shear.** Bending failure is slow and visible — steel yields, cracks open, the beam sags and absorbs energy. Shear failure is sudden and brittle, with no warning.
3. **The joint where beams meet the column must not fail at all**, and the concrete at the yielding zones must be confined by closely spaced ties so it can deform without crushing.

The Indian code that enforces these rules is **IS 13920:2016** (ductile design and detailing). The project:

- **Phase 1 — flowchart:** the full procedure from an initial design to a code-compliant seismic design, with every clause ([flowchart.html](flowchart.html)).
- **Phase 2 — dashboard:** a web page where you enter the initial design and the analysis forces, and it runs every check, then automatically redesigns the members until everything passes ([live dashboard](https://gvrathodd.github.io/Seismic-redesign-automation/), file `index.html`).

The dashboard also compares two ways of redesigning — an exact method and the usual simplified textbook/software method — because commercial software such as STAAD.Pro is known to give heavier designs than needed. Section 5 explains why over-design is not harmless in earthquake design.

---

## 2. Background: why earthquake design is different

### 2.1 Earthquake forces are inertia forces, and they reverse

During an earthquake the ground moves; the building's mass resists that movement, and the result is horizontal inertia forces at every floor. These forces push the building one way, then the other, several times a second. So:

- every beam end sees **hogging** in one direction of sway and **sagging** in the other — which is why the code demands substantial **bottom steel at supports**, not just top steel;
- the shear in a column changes sign with each cycle.

### 2.2 We deliberately design for a fraction of the real force

If a building were designed to stay elastic in a design earthquake, the members would be enormous. IS 1893 instead lets us design for the elastic force divided by the **response reduction factor R** (R = 5 for a special moment-resisting frame, SMRF). The building is then expected to **yield** and survive by deforming in the inelastic range.

> The design lateral force is roughly one-fifth of what the earthquake would actually apply to an elastic building. The difference is absorbed by yielding. **This only works if the yielding happens in the right places and the yielding parts can deform a lot without breaking.** That ability is called *ductility*, and IS 13920 exists to guarantee it.

### 2.3 Plastic hinges and the two possible collapse mechanisms

When the steel at a section yields, the section keeps carrying its moment capacity while rotating — it behaves like a hinge that resists moment. This is a **plastic hinge**. Where these hinges form decides how the building collapses:

```
 Beam-sway mechanism (wanted)          Storey mechanism (dangerous)
 hinges at beam ends + column base     hinges at top and bottom of one storey's columns

   o----o----o----o                      ┌────┬────┬────┐
   |    |    |    |                      │    │    │    │
   o----o----o----o                      o    o    o    o   <- all columns hinge
   |    |    |    |                      o    o    o    o   <- top and bottom
   o----o----o----o                      │    │    │    │
   |    |    |    |
   o    o    o    o  (column bases)
```

- **Beam-sway:** many hinges, spread over the whole building, each rotating a little. Large energy dissipation, the building stays standing.
- **Storey (soft-storey) mechanism:** all the deformation concentrates in one storey's columns. Few hinges, huge rotations, the columns also carry gravity load — collapse.

Everything in IS 13920 steers the building toward the beam-sway mechanism.

### 2.4 Capacity design — the central idea

Choose the element that is allowed to yield (the "fuse": **beam flexure**), design it normally, then design **everything else for the force the fuse can actually deliver**, not for the analysis force:

- beam shear is designed for the shear that exists when **both beam ends have formed hinges**;
- columns must be **stronger than the beams** framing into them (by a factor of 1.4);
- columns are designed for the shear created when the beams hinge;
- joints are designed for the force in beam bars that have **yielded and strain-hardened (1.25 fy)**.

The key word is **over-strength**: real beams are stronger than their design value (actual steel is stronger than fy, slab bars help, steel strain-hardens). The protected elements must be designed for that real, higher strength — otherwise the "fuse" is stronger than the "wire" and the wrong thing fails.

### 2.5 Confinement

Plain concrete crushes at a strain of about 0.0035. A plastic hinge needs much more. Closely spaced closed hoops with 135° hooks hold the core concrete together (like a hose clamp), raising its usable strain several times and stopping the longitudinal bars from buckling. That is the purpose of the "special confining reinforcement" of Cl 7.6.

---

## 3. The documents used

| Document | Role in this project |
|---|---|
| **IS 1893 (Part 1):2016** | Earthquake forces: zone factor Z, importance I, R, spectrum Sa/g, base shear, load combinations |
| **IS 456:2000** | Section strength: flexure (Cl 38), columns (Cl 39), shear (Cl 40), development length (Cl 26.2), serviceability (Cl 23.2, 26.3.3) |
| **IS 13920:2016** with Amendments 1 (2018) and 2 (2020) | Ductile design and detailing: everything in Section 4 marked "Cl" without another code name |
| **IITK-GSDMA EQ22**, *Explanatory examples for ductile detailing* (Ingle & Jain) | Worked examples; Example 5 (interior joint, Zone V) is the procedure followed here and the benchmark used to test the calculations |

Note: EQ22 was written against a **draft** of IS 13920. Where it differs from the 2016 code, the project follows the 2016 code. The two differences that matter: the strong-column factor is **1.4** (EQ22 used 1.1), and joint shear strength is written in terms of **√fck** (Amendment 2).

---

## 4. The procedure, step by step

Notation: fck = concrete cube strength, fy = steel yield strength, b × D = section, d = effective depth, d′ = cover to compression steel, Lc = clear span, hst = storey height, Lu = clear column height.

### Inputs

- Beams in both plan directions: size, clear span, bars at the joint face, at the far end and at midspan, slab bars within the effective flange.
- Column below and above the joint: size, bar layout, storey height.
- Forces from structural analysis (e.g. STAAD.Pro): beam moments and shears, column Pu, Mux, Muy for every earthquake load combination, axial load in the column above, column shears.
- Options: design margin, size limits, which fix to try first, cost rates.

### Step 0 — Materials (Cl 5.2, 5.3 as amended)

- Concrete at least **M20**; **M25** if the building is taller than 15 m in Zones III–V.
- Steel only Fe415, Fe500 or Fe550, with elongation ≥ 14.5 % and ultimate/yield ratio between 1.15 and 1.25 (Amendment 2). The ratio matters: if steel hardens too much, beams become stronger than planned and over-strength exceeds what the 1.4 and 1.25 factors allow for.

### Step 1 — Beam geometry (Cl 6.1)

| Rule | Why |
|---|---|
| b ≥ 200 mm | room for confinement and bars |
| b/D ≥ 0.3 (preferred) | very thin deep beams buckle laterally and confine poorly |
| D ≤ Lc/4 | very deep short beams behave like walls and fail in shear |
| b ≤ c₂ + min(c₂, 0.75 c₁) | beam bars must pass through or near the column to transfer moment |

### Step 2 — Beam flexure, designed as a doubly reinforced section

**Detailing rules (Cl 6.2):**

- at least 2-12 mm bars top and bottom everywhere;
- ρmin = 0.24 √fck / fy on each face; ρmax = 2.5 % on each face;
- **bottom steel at a column face ≥ ½ top steel** (Cl 6.2.3) — because sway reverses, the support sees sagging too;
- **any section, either face ≥ ¼ of the top steel at the face** (Cl 6.2.4) — so the beam has some capacity everywhere when the moment diagram shifts.

**Why "doubly reinforced":** because of Cl 6.2.3, every support section *always* has substantial bottom steel. Under hogging that bottom steel sits in the compression zone and works as compression reinforcement. A singly reinforced design ignores it and therefore needs more top steel than necessary.

**How capacity is calculated (IS 456 Cl 38.1, strain compatibility):**

1. Assume a neutral axis depth xu.
2. Strain is linear: εc = 0.0035 at the top fibre; steel strain at depth y is 0.0035 (xu − y)/xu.
3. Steel stress from the IS 456 design stress–strain curve for Fe415/500 (Fig. 23 — a bilinear-with-knee curve, not simply 0.87 fy).
4. Concrete force C = 0.36 fck b xu acting at 0.42 xu from the top (the IS 456 stress block). Compression steel force = Asc (fsc − 0.446 fck) — the 0.446 fck removes the concrete the bar displaces.
5. Find xu by equilibrium C + Cs = T, then take moments.
6. Ductility: xu ≤ xu,max (= 0.48 d for Fe415, 0.46 d for Fe500) so the steel yields before the concrete crushes.

For sagging at the support the slab acts as a flange (T-beam, IS 456 Annex G), with bf = L₀/6 + bw + 6Df.

**Design (not just check):** the program scans the bottom-steel quantity and, for each, finds the least top steel that carries the hogging moment while staying ductile; it keeps the pair with the least total steel that also satisfies sagging, the ½-top rule and ρmin. The demand is increased by a **design margin** (5 % by default) so the design is not exactly at 100 %.

**Bar selection:** real bars — one size, or two neighbouring sizes (e.g. 20 + 16, never 20 + 12). If bars need two layers, the effective depth reduces and the design repeats until consistent. Bars must also satisfy **crack control** (IS 456 Cl 26.3.3: clear spacing between tension bars ≤ 180 mm for Fe415, 150 mm for Fe500) and **20 × bar diameter ≤ column depth** (Cl 9.1.3).

**Serviceability (IS 456 Cl 23.2.1):** span/effective-depth ≤ 26 × kt × kc × kf (modification factors for tension steel stress, compression steel and flanges).

**Over-strength capacities:** after bars are chosen, the program calculates the hogging and sagging capacities **of the bars provided** at both beam ends. For hogging, **slab bars within the effective flange are added** — they are in tension with the beam's top bars and raise its real strength. These over-strength capacities, not the analysis moments, drive Steps 3, 5, 6 and 7.

### Step 3 — Beam shear by capacity design (Cl 6.3)

When the frame sways right, a sagging hinge forms at the left end A and a hogging hinge at the right end B (and the opposite for sway left). Taking moments for the beam as a free body:

```
Vu,a = V(D+L),a − 1.4 (Mu,A,sag + Mu,B,hog) / Lc      (sway right)
Vu,b = V(D+L),b + 1.4 (Mu,A,sag + Mu,B,hog) / Lc
(and the mirror case for sway left; Amendment 2 corrects the signs)
```

- V(D+L) is the simply supported gravity shear with load factor **1.2**.
- **1.4** covers over-strength of the hinges.
- The far end B uses its own bars (it may differ from the joint end).
- Design shear = larger of this and the analysis shear.

**Concrete contribution is ignored** (Cl 6.3.4): at a hinge the concrete is cracked through and through after cycles of reversal, so links alone carry Vu:

```
s = 0.87 fy Asv d / Vu
```

Spacing within 2d of each face ≤ d/4, 8 × smallest bar, 100 mm; first link ≤ 50 mm from the face; elsewhere ≤ d/2 (Cl 6.3.5). Links must be closed with 135° hooks. The program also flags link spacing below 75 mm as too congested to concrete properly.

**This step is what guarantees "flexure before shear":** the links are designed for the largest shear the beam can ever develop, because that shear is limited by the bending capacity.

### Step 4 — Column geometry and strength (Cl 7.1; IS 456 Cl 39)

| Check | Why |
|---|---|
| Pu / (fck Ag) ≤ 0.40 (Amendment 2) | above this, columns lose ductility rapidly (compression-controlled) |
| least dimension ≥ max(300 mm, 20 × largest beam bar) | beam bars must anchor/pass through the joint without slipping |
| smaller/larger dimension ≥ 0.45 | very elongated sections behave like walls |
| column above not larger than below (practice) | bars can run straight through |
| steel 0.8 – 4 % | IS 456 allows 6 %, but at laps the steel doubles — 4 % keeps laps buildable |
| bar clear spacing ≥ max(φ, 25 mm), centres ≤ 300 mm | concreting, and every face restrained |

**P–M interaction:** for a given axial load Pu the moment capacity comes from the same strain-compatibility idea as the beam, extended past the section depth (IS 456 Cl 39.1: when the neutral axis is outside the section the maximum strain is 0.002 at 3D/7 from the most compressed face). Each layer of bars contributes according to its strain.

**Biaxial bending (IS 456 Cl 39.6):** (Mux/Mux1)^αn + (Muy/Muy1)^αn ≤ 1, with αn from 1 to 2 depending on Pu/Puz.

**Minimum eccentricity:** emin = Lu/500 + D/30 ≥ 20 mm.

**Slenderness (IS 456 Cl 39.7):** if effective length / D > 12, an additional moment Ma = Pu D/2000 × (le/D)² is added, reduced by k = (Puz − Pu)/(Puz − Pb). Clear height is calculated as storey height minus the deepest beam, so it changes when beams change.

**Design:** the program searches practical layouts (bars per face, corner and side bar sizes) and keeps the lightest that satisfies P–M, spacing, laps and the strong-column rule.

### Step 5 — Strong column, weak beam (Cl 7.2.1)

At every joint, in each direction, for both sway directions:

```
ΣMc ≥ 1.4 ΣMb
```

- ΣMb = sum of beam over-strength capacities at the joint in the same rotational sense (one beam hogging, the other sagging) — including slab bars.
- ΣMc = capacity of the column below + column above, **in the opposite sense**, calculated **at the axial load that gives the least capacity** for that combination. The column above has a smaller axial load — it is entered separately.
- The check may be waived at roof joints of buildings taller than 4 storeys.

**Why "least capacity over the actual combinations" matters:** a column's moment capacity is not constant — it rises with axial load up to the *balanced point* and then falls. EQ22 takes Pu = 0 "to be on the conservative side". That is conservative only for lightly loaded columns. For a heavily loaded column (above the balanced point) the capacity at the real Pu is *lower* than at Pu = 0, and the Pu = 0 shortcut is unsafe. In EQ22 Example 5 itself the least capacity occurs at the highest load (1,475 kN).

If a column cannot satisfy this, the code says it may only be treated as a gravity column, not part of the lateral system.

### Step 6 — Column shear (Cl 7.5)

When the beams above and below hinge, the column must carry:

```
Vu = 1.4 (Mu,beam,sag + Mu,beam,hog) / hst    (≥ analysis shear)
```

Concrete may contribute here (IS 456 shear, with the axial-load factor δ = 1 + 3Pu/(Ag fck) ≤ 1.5, taken at the least compression). The rest, Vus = Vu − Vc, goes to the hoops and is combined with confinement in Step 8.

### Step 7 — Beam-column joint (Cl 9, the heart of EQ22 Example 5)

Cut the joint free. On one side the top bars of one beam are in tension, on the other side the bottom bars of the other beam (sway reverses them). Both are assumed to have yielded and strain-hardened to **1.25 fy**:

```
            Vcol
     ┌───────────────┐
 T1 →│     JOINT     │← C2 = T2
     └───────────────┘
            Vcol
 T1 = 1.25 fy (Ast,top + slab bars)       T2 = 1.25 fy Ast,bot
 Vj = T1 + C2 − Vcol                        (interior joint)
 Vj = 1.25 fy × larger face − Vcol           (exterior joint)
```

Capacity (Cl 9.1.1 as amended):

```
Vj ≤ k √fck × bj × hc
k = 1.5  joint confined by beams on all four faces
    1.2  on three faces
    1.0  otherwise
```

- hc = column depth in the direction considered; bj = effective joint width = min(bc, bb + 0.5 hc) when the beam is narrower than the column (Fig. 15, Amendment 2).
- A face counts as "confined" here when the beam covers at least ¾ of the column face width (the same criterion Cl 9.2.1 uses for hoops).
- Interior joints: column depth ≥ 20 × largest beam bar passing through (Cl 9.1.3), so bars don't slip under reversal.
- Exterior joints: beam bars anchored for Ld + 10φ − 8φ (Cl 6.2.5, the 8φ being the allowance for the 90° bend).

**If the joint fails**, EQ22 Section 5.5 gives three remedies, which the program applies in the order you choose, each until it reaches its limit:

1. **enlarge the column** — more joint area (but see the confinement subtlety in Section 8);
2. **deepen the beam** — the same moment needs less steel, so less force enters the joint;
3. **raise the concrete grade** — strength grows with √fck (a whole-floor decision, so it is optional).

### Step 8 — Hoops and detailing (Cl 7.4, 7.6, 9.2)

Over a length lo = max(D, Lu/6, 450 mm) at each end of the column and through the joint, the hoop spacing is the least of:

| Requirement | Formula / limit |
|---|---|
| Confinement (Cl 7.6.1(c)) | Ash ≥ max[0.18 s h (fck/fy)(Ag/Ak − 1), 0.05 s h fck/fy] |
| Shear (Step 6) | s = 0.87 fy Asv d / Vus |
| Spacing limits | b/4, 6 × smallest longitudinal bar, 100 mm |

h = longer dimension of the hoop leg (≤ 300 mm, so cross-ties are added on wide faces), Ak = confined core area. Amendment 1 rewrote Cl 7.6.1(b) as "6 × smallest bar"; the program keeps the older b/4 and 100 mm limits as well, so the result is safe under either reading.

- **Practical minimum 75 mm:** if the calculated spacing is tighter, the program increases the hoop diameter (8 → 10 → 12) and then adds cross-ties instead of producing an unbuildable cage.
- **Joint hoops (Cl 9.2.1):** half the confining steel at ≤ 150 mm if all four faces are confined; full otherwise.
- Hooks: 135° with 8φ (≥ 75 mm) extension (Amendment 1).
- Outside lo: spacing ≤ b/2, 16φ, 300 mm and the shear requirement.
- **Laps:** length Ld; columns only in the middle half of the clear height; beams not within the joint or within 2d of a face; ≤ 50 % of bars lapped at one section; closer links over the lap.

### Step 9 — Re-analysis loop

Forces came from an analysis of the *initial* sizes. A bigger column is stiffer and attracts more moment; a deeper beam does too. If any member's stiffness (b·D³/12) changed by more than 10 %, the dashboard marks the design **provisional**. You put the revised sizes back into STAAD, re-run, enter the new forces and run the dashboard again, until no member changes.

---

## 5. Why "more steel" is not "more safe"

In gravity design, a bit of extra steel is harmless. In capacity design it is not, because **every later step is driven by the beam's actual strength**:

```
extra beam steel ─► higher beam hinge moment
                    ├─► higher capacity shear       (more beam links)
                    ├─► higher ΣMb, so higher ΣMc   (more column steel / bigger column)
                    ├─► higher column shear          (more hoops)
                    └─► higher joint force 1.25 fy As (bigger joint)
```

And if the beam is accidentally much stronger than the column (because extra steel was added "to be safe" without re-checking), the **column hinges first** — the exact failure the code is trying to prevent.

The usual simplifications that inflate beam strength, and what this project does instead:

| Usual simplification | This project |
|---|---|
| Beam faces designed singly reinforced, then bottom raised to ½ top | Bottom steel used as compression steel — least top + bottom |
| Capacities read from SP 16 tables at the nearest lower value; bars rounded up generously | Strain compatibility for the bars actually chosen; least bar set that works |
| Column capacity taken at Pu = 0 | Least capacity over the real combinations (also safer for heavy columns) |
| Members grouped, all designed for the worst one | Each joint for its own forces |

What is **not** relaxed: the 1.4 and 1.25 factors, the 0.40 fck limit, the joint strength, the confinement formula, concrete being ignored in beam shear — all code safety provisions stay exactly as written. Slab bars are *added* to the over-strength, which makes the design safer.

The dashboard shows the result of both approaches side by side, plus the actual software design if you enter it. The claim "software over-designs" is only proven for your project if that comparison shows it.

---

## 6. How the automatic redesign works

The order follows the flowchart, because each element is designed for the strength of the one before it:

1. **Beams first** (they are the fuse): least steel for the demand × (1 + margin); if the steel exceeds 2.5 % or the section cannot be ductile, deepen the beam (unless beam sizes are locked); if depth reaches its limit, widen it.
2. **Column size**: enlarge in steps until Pu/(fck Ag) ≤ 0.40, the least side ≥ 20 × beam bar, and it is not smaller than the column above.
3. **Column steel**: lightest practical layout satisfying P–M, spacing, laps and ΣMc ≥ 1.4 ΣMb. If even 4 % is not enough, enlarge the column.
4. **Hoops**: least of confinement, shear and limits; if below 75 mm, bigger hoop bars, then extra cross-ties.
5. **Joint**: if it fails, apply the chosen fixes in order (column → beam → grade by default), each until it reaches its limit, then go back to step 1.
6. **Report**: sizes, bars, hoops, laps (schedule); every check with clause and OK/warning/fail; quantities and cost; the list of members whose stiffness changed (re-analysis).

Three versions are produced: the **initial design** (as given), the **refined redesign**, and the **simplified textbook redesign** (singly reinforced up to Mu,lim, compression steel only beyond it, bottom raised to ½ top, column capacity as the lower of Pu = 0 and actual). A fourth, the **software design**, is checked if you enter it.

---

## 7. Worked example 1: EQ22 Example 5

Ground + 4 storey office building, Zone V, interior joint. Column 400 × 500 with 10-25 + 4-16 (5,714 mm²); transverse beam 300 × 600 (top 2,374, bottom 1,319 mm²); longitudinal beam 300 × 500 (top 2,261, bottom 1,746 mm²); M20, Fe415.

| Quantity | EQ22 | This program | Comment |
|---|---|---|---|
| Transverse beam hogging capacity | 377 kN-m | 392 kN-m | EQ22 reads SP 16 at the lower value; exact strain compatibility is higher |
| Transverse beam sagging (T-beam) | 246 kN-m | 251 kN-m | |
| Joint shear Vj (Y) | 1,624 kN | 1,616 kN | 1.25 fy on top and bottom bars minus column shear |
| Joint capacity | 1,073 kN | 1,073 kN | joint fails, as in EQ22 |

Under the 2016 code the original design also fails strong-column/weak-beam (ratio 0.90 and 0.95 against 1.4). EQ22 enlarged the column to 600 × 600 and deepened the beam to 600 mm. With slab bars included and the 2016 factors, the program's refined redesign gives a 650 × 700 column with lighter steel; the simplified method gives 700 × 700. Example 5 does not list beam moments, midspan steel, slab bars, gravity loads or analysis shears, so those inputs are assumed (they are listed in `example5.js`).

---

## 8. Worked example 2: the Health Centre (STAAD.Pro)

### 8.1 The building

G+1 health centre, IIT Mandi (CE 353P group project). 3D RC frame, 24 columns 350 × 350, main beams 300 × 500, plinth beams 230 × 400, 150 mm slabs, M25, Fe500. Originally analysed and designed for **gravity only** (DL + LL, 1.5 factor).

### 8.2 Adding the earthquake (IS 1893:2016)

The STAAD model was copied (the original is unchanged) and IS 1893:2016 static seismic loading was added:

| Parameter | Value | Reason |
|---|---|---|
| Zone factor Z | 0.36 | Mandi, Himachal Pradesh — Zone V |
| Importance I | 1.5 | hospital (IS 1893 Table 8) |
| Response reduction R | 5 | SMRF, detailed to IS 13920 |
| Soil | Type II (medium) | SBC 200 kN/m² |
| Height h | 8.55 m | top of footing (−1.50) to roof (+7.05) |
| Period T = 0.075 h^0.75 | 0.375 s | RC moment frame |
| Sa/g | 2.5 | plateau of the spectrum |
| Ah = (Z/2)(I/R)(Sa/g) | 0.135 | |
| Seismic weight W | 10,975 kN | full DL + 25 % LL (≤ 3 kN/m²) or 50 % (> 3 kN/m²), no roof LL |
| **Base shear VB = Ah W** | **1,482 kN** | each direction; STAAD and hand calculation agree |
| Floor forces | 41 kN (plinth), 530 kN (first floor), 911 kN (roof) | distributed ∝ Wi hi² |

Load combinations (IS 1893 Cl 6.3): 1.2(DL + LL ± EQ), 1.5(DL ± EQ), 0.9 DL ± 1.5 EQ, each with the **100 % + 30 %** rule for the orthogonal direction (Cl 6.3.4.1) — 24 earthquake combinations, plus 1.5(DL + LL). Script: `staad_health_centre/health_centre_seismic.py` (kept outside this repository).

### 8.3 The joint studied

First-floor joint at **column D3** (grid D, x = 13.0 m; grid 3, y = 7.2 m) — interior in both directions. From STAAD:

- Column below: Pu from 282 to 687 kN across combinations; Mux up to 181 kN-m, Muy up to 226 kN-m; shears 102 / 128 kN.
- Beams (300 × 500): hogging at the joint 230 kN-m (grid 3) and 258 kN-m (frame D, span D3–D4); sagging at the face up to 131 kN-m — sway reverses the moment.

Initial design (from the gravity design, `07_RC_Design`): beams 2-16 + 3-12 top (741 mm²), 3-16 bottom (603 mm²); column 350 × 350 with 8-16 (1.31 %), ties 8 mm @ 250.

### 8.4 What the checks show

The gravity design **fails 9 checks**:

| Check | Required | Provided |
|---|---|---|
| Beam hogging capacity | 242 / 271 kN-m | 137 kN-m |
| Beam sagging at face (frame D) | 138 kN-m | 123 kN-m |
| Column biaxial P–M | ≤ 1.0 | 2.64 |
| Strong column / weak beam | ≥ 1.4 | 0.60 |
| Joint shear X / Y | ≤ 919 kN | 989 / 988 kN |
| Hoop spacing for confinement | ≥ 75 mm practical | 30 mm needed with 8 mm hoops |

This is expected: the earthquake roughly doubles the beam end moments and introduces reversal, and the columns were sized for axial load only.

### 8.5 The redesign

| | Initial | Refined redesign | Simplified (textbook) |
|---|---|---|---|
| Column | 350 × 350, 8-16 | **550 × 600, 10-20 (0.95 %)** | 600 × 600, 18-16 |
| Hoops in lo | 8 @ 250 | 10 mm, 3 × 3 legs @ 95 | 10 @ 95 |
| Beam X (grid 3), 300 × 500 | 741 / 603 mm² | top 7-16, bottom 3-16 + 1-12 | top 7-16 + 1-12, bottom 7-12 |
| Beam Y (frame D), 300 × 500 | 741 / 603 mm² | top 5-20, bottom 7-12 | top 4-20 + 2-16, bottom 2-20 + 1-16 |
| ΣMc/ΣMb | 0.60 | 1.50 / 1.46 | — |
| Joint shear use | 108 % | 90 % / 94 % | — |
| All checks | 9 fail | pass | pass |
| Cost of the joint region* | ₹63,500 | **₹77,900** | ₹81,000 |

\* Beams on both sides over their clear spans plus one storey of column; placeholder rates (₹80/kg steel, ₹7,000/m³ M25, ₹600/m² formwork).

Points to note:

- **The beams keep their 300 × 500 size**; only their steel changes. The column governs.
- **The joint, not the column strength, decides the column size.** The column needs only ~1 % steel at 550 × 600 — it is that large to give the joint enough area.
- **Confinement subtlety:** at 350 × 350 the 300 mm beams cover more than ¾ of each column face, so the joint is "confined on four faces" (k = 1.5). At 550 × 600 they cover less than ¾, so k drops to 1.0. Enlarging the column adds area but loses the confinement bonus — which is why it had to grow so much. Wider beams (e.g. 450 mm) would restore k = 1.5 and allow a smaller column — a design option worth discussing.
- **Re-analysis is required:** the column stiffness changed far more than 10 %. The next step is to put 550 × 600 columns into the STAAD model, re-run, and run the dashboard again.
- The refined method is about 4 % cheaper than the simplified one here, and both are code-compliant. The saving is real but modest; the bigger message is that **the gravity-only design is not adequate for a hospital in Zone V**.
- Only frame D's longer span (D3–D4) was used for beam Y. The shorter span D2–D3 (2.7 m) has a higher hinge shear (1.4ΣM / Lc with a small Lc) and should be checked separately.

---

## 9. How the results were validated

`test_engine.js` checks, automatically:

| Test | Source of the expected value |
|---|---|
| Steel design stress, τc (IS 456 Table 19), development length (SP 16 Table 65) | code tables |
| Beam design for Mu = 369 kN-m: Ast 2,330 mm², Asc raised to 1,165 mm² | EQ22 Example 1 (SP 16 Table 50) |
| Hinge shear 1.4(286 + 377)/5 = 186 kN | EQ22 Example 1 |
| Column with bars on two faces at P = 0 equals the same doubly reinforced beam | mechanics (two independent routines must agree) |
| Beam capacities, joint shear 1,624 kN, joint capacity 1,073 kN, joint fails | EQ22 Example 5 |
| Slab bars increase over-strength | expected behaviour |
| Redesigns pass every check; re-analysis flagged when sizes change; locked sizes report failure instead of resizing | expected behaviour |
| Health Centre: gravity design fails, redesign passes | STAAD forces |

The STAAD seismic loading was checked by hand: T, Ah and VB match STAAD's printout.

---

## 10. Assumptions and limits

- One joint at a time; the same beam section on both sides of the joint. The far beam end and column above are inputs and must be checked at their own joints.
- The tool does **not** analyse the frame; it tells you when re-analysis is needed.
- Moments are taken at the joint centre (STAAD node), not at the column face — slightly conservative.
- Rectangular columns with corner and side bars; beams with up to two layers.
- Not covered: torsion, shear walls, flat slabs, foundations, P-Δ beyond IS 456 slenderness moments, irregular buildings.
- Hoop spacing uses the stricter reading of Amendment 1 to Cl 7.6.1(b) — confirm against the printed amendment.
- Cost rates are placeholders.

---

## 11. Questions a structural engineer will ask

**Q. Why not just let STAAD design it?**
STAAD (and similar software) can run IS 13920 checks, but it typically designs each member from its own envelope, rounds steel up, and uses simplified capacity assumptions. In capacity design those choices propagate: heavier beams force heavier columns and joints. This tool makes every step transparent and lets you compare against the software's design using the same forces.

**Q. Isn't minimising beam steel risky?**
Beam strength is set by the demand × (1 + margin) and checked by exact mechanics. Everything downstream is designed for the beam's over-strength — 1.4 × capacity including slab bars, or 1.25 fy in the joint. So under-estimating beam strength would be the risk, and the tool deliberately adds slab bars and keeps the code factors to avoid it.

**Q. Why 1.4 for strong column / weak beam?**
It covers beam over-strength (actual fy above characteristic, strain hardening, slab participation) and the fact that the dynamic distribution of moment between the column above and below is uneven. 1.4 is the IS 13920:2016 value (ACI uses 1.2 with nominal strengths, Eurocode 1.3).

**Q. Why 1.25 fy in the joint, but 1.4 × capacity elsewhere?**
The joint check uses bar forces directly, so over-strength is applied to the steel stress (1.25 fy, covering strain hardening). Elsewhere the over-strength is applied to the design moment capacity (which already uses 0.87 fy), so the factor is larger.

**Q. Why ignore concrete in beam shear but not in column shear?**
At a beam hinge, cracks from both directions of sway cross the full depth and aggregate interlock degrades — the code removes the concrete term. Columns carry axial compression, which keeps cracks closed, so IS 456 shear with the axial-load enhancement is allowed (Cl 7.5.1).

**Q. Why does the joint check govern so often?**
Joint shear grows with the beam steel (1.25 fy × Ast on both faces), while its capacity grows only with √fck and joint area. Heavily reinforced beams on small columns — typical of gravity designs — almost always fail it. This is the main lesson of EQ22 Example 5.

**Q. The column went from 350 × 350 to 550 × 600. Isn't that excessive for a G+1 building?**
It is driven by the joint and the loss of four-face confinement (Section 8.5). Options: wider beams (≥ ¾ of the column face) to restore k = 1.5; deeper beams to reduce steel and joint force; higher concrete grade. The dashboard lets you set the order of these fixes, lock sizes, and compare.

**Q. Why are forces not updated automatically?**
That needs a frame analysis. The tool flags any stiffness change above 10 % and supports the iteration (revised sizes → STAAD → new forces → dashboard) until sizes converge.

**Q. What about the 100 % + 30 % rule?**
It is applied in the STAAD combinations for the Health Centre. Each combination's Pu, Mux, Muy is checked biaxially, and the strong-column check uses each combination's own axial loads in the columns below and above.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| Ductility | ability to deform well beyond yield without losing strength |
| Plastic hinge | a yielded zone that rotates while carrying its moment capacity |
| Capacity design | design the fuse normally; design everything else for the fuse's real strength |
| Over-strength | real strength above design strength (material, strain hardening, slab bars) |
| SMRF | special moment-resisting frame — detailed to IS 13920, R = 5 |
| Doubly reinforced | section with steel in both tension and compression zones counted in strength |
| Strain compatibility | finding section strength from linear strains and material stress–strain curves |
| Balanced point | axial load at which concrete crushing and steel yield happen together; column moment capacity is highest there |
| SCWB | strong column, weak beam (Cl 7.2.1) |
| Confinement | closely spaced hoops holding the concrete core together, increasing its strain capacity |
| lo | length at column ends and through joints where confining hoops are required |
| Re-analysis | re-running the structural analysis after member sizes change |
