# Plot 3D demo (Sunrise Enclave)

An interactive 3D map for selling plots in a gated colony or township. It runs in any browser, uses Three.js and has no build step.

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Then open http://localhost:4451/ (or run `preview_start plot-3d-demo` from Claude).

## Features
- **Explore:** Aerial, 2D plan, Entrance (street level), Central park, Villa plots and Commercial views; presentation tour; auto-rotate when idle
- **Availability colours:** green, amber and red for available, on hold and sold; a "natural soil" look when colours are switched off
- **Sample homes:** switch them on for all sold plots to show how the colony looks once built
- **Find your plot:** filter by size, facing, budget, corner only, park-facing only and available only; matching plots listed by price
- **Plot card:** size, dimensions in ft, facing, front road, rate and price, corner / park / avenue badges, WhatsApp enquiry
- **On the plot itself:** dimension and road-width labels; "See a home on this plot" builds a G+1/G+2 home inside setbacks with its built-up area; "Stand in front of the plot" gives a street-level view
- **Plot numbers:** shown automatically once they're large enough on screen to read
- **Nearby:** landmark pins with an animated route from the gate
- **Amenities:** fly to each amenity
- **Live inventory:** `data/plots.json` is re-read every 30 s

## Adapting for a client
| What | Where |
|---|---|
| Name, location, WhatsApp, prices on/off, landmarks | `data/project.json` |
| Every plot (polygon in metres, size, facing, price, status) | `data/plots.json` |
| Roads, parks, green belts, amenity sites, wall, gate | `data/layout.json` |
| Demo layout generator (replace by tracing the real layout plan) | `tools/generate-layout.py` |

Plots are plain polygons, so irregular, angled or trapezoid plots from a real layout plan work as they are. Trace the approved layout PDF or image into `plots.json` and `layout.json`.

North is -Z and east is +X. Units are metres.
