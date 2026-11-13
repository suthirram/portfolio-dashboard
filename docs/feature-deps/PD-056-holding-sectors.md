# PD-056: Holding sector dependencies

* **Status**: Draft
* **Owner**: project owner
* **Requirements**: [PRD-013](../prds/PRD-013-holding-sectors.md)
* **Design**: [DD-013](../designs/DD-013-holding-sectors.md)
* **Plan**: [PD-056](../plans/PD-056-holding-sectors.md)

## 1. Libraries and images

No new Go module, npm package, container image, or browser script. Reuse Go's
standard HTTP/JSON/cookie/URL libraries, existing Cobra CLI, Mongo driver,
zap/OTel, React, Recharts, and the current test harnesses.

## 2. External service scope

Yahoo Finance remains the only external financial-data provider. Widen existing
chart access to `query2.finance.yahoo.com/v10/finance/quoteSummary`, with
session bootstrap at `fc.yahoo.com` and `query1.finance.yahoo.com/v1/test/getcrumb`.
These are unofficial endpoints with no availability guarantee. Send only public
ticker symbols and normal session information, never portfolio positions or
application credentials. No billing, API key, paid tier, or end-user Yahoo login
is introduced.
