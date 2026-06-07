---
name: cod-product
description: COD Parcel System for Thai Post — product context, users, brand, and design principles
metadata:
  type: project
register: product
---

## Product

**COD Parcel System (ระบบพัสดุ COD)** — internal web app for Thai Post (ไปรษณีย์ไทย) branches to manage Cash-on-Delivery parcels: tracking, operator assignments, photo evidence, daily reporting, and branch self-registration.

## Users

- **Branch Admin (หัวหน้า ปณ.):** uploads QMS Excel data, manages parcel status, approves photo permissions, generates reports, administers branch settings. Uses desktop and mobile.
- **Employee (พนักงาน ปณ.):** selects their name, views assigned parcels, captures photo evidence. Mobile-primary.
- **New Branch Manager:** self-registers their branch on first use. One-time flow.

## Brand

**Thai Post (ไปรษณีย์ไทย):** red + white as primary surface. Blue as accent. Modern, bright, clean.

Anti-references: dark admin dashboards, heavy SaaS grids, navy-and-gold fintech, glassmorphism decoration, neon.

## Strategic principles

- Mobile-first: most employees use phones; admin is split desktop/mobile.
- Fast at a glance: parcel counts and urgent statuses must be scannable in under 2 seconds.
- Thai-first UX: Thai font, Thai labels, intuitive for non-tech postal staff.
