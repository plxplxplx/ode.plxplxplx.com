# Elysium Decorative Elements

**Date:** 2026-04-10
**Status:** Approved

## Context

The PLX ODE JOY scaffold tower needs decorative elements that evoke an Elysium/classical festival atmosphere — nature creeping in alongside intentional festival dressing. The existing scene has vines, ivy, shrubs, and flowers. This adds lights and fruit to complete the feel.

## Elements

### 1. String lights
Catenary curves of small emissive spheres strung between scaffold poles horizontally. Warm amber glow. 15-20 strings at varying heights throughout the tower. Each string connects two poles across a bay with 8-12 light points along the sag curve.

### 2. Candle lanterns
Small glowing spheres placed on scattered platforms. Warm amber emissive material with slight size variation. 20-30 scattered throughout, seeded randomly. No actual PointLight on most — just emissive geometry. A subset of 5-6 get dim PointLights for scene illumination.

### 3. Grape clusters
Small sphere clusters (5-8 spheres per cluster) hanging from ledgers near existing vine locations. Deep purple color with slight metalness for a wet look. 30-40 clusters, concentrated where vines grow.

## Color palette
- Lanterns & string lights: warm amber/gold emissive
- Grape clusters: deep purple, slight metalness

## Technical approach
- All three use InstancedMesh for performance (matches existing shrub/vine pattern)
- Seeded PRNG for deterministic placement
- Subject to build-plane clipping (grow with scaffold during loading)
- Added to environment.js alongside existing plant systems
- String light geometry: catenary math for the wire, sphere instances for bulbs

## Excluded
- Urns/amphora
- Wisteria (existing vines suffice)
- Water features
- Laurel wreaths
