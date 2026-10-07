# How RegSonar Gets Its Data

RegSonar has no special access or data agreements. Every notice and figure comes from a public page or feed that the regulator itself publishes, and the server reads it the same way a browser would.

## The flow of a sync

1. **A server on Vercel (Hong Kong region, `hkg1`) fetches each source.** The site's own Express server (`server.ts`) does the fetching, not the visitor's browser and not any AI service. Each source is fetched at most once every 10 minutes; the HKMA liquidity page every 30.
2. **Each item is put into a common format:** title, regulator, date, link, type and so on.
3. **Key points are quoted from the document itself** (`summarize.ts`). For each notice, the server opens the linked document once and picks its most central sentences word for word using TextRank, a ranking algorithm, not an AI model. It also picks out sentences containing dates and reference numbers. Scanned PDFs are read with Tesseract OCR, and those quotes are labelled "OCR".
4. **Vercel's CDN keeps a copy** of the combined result for up to 5 minutes. Visitors get it instantly, and "Data as of" shows when it was built.
5. **The visitor's device keeps its own copy** (`public/sw.js`) for offline use.

## Where each source comes from

| Regulator | How it's read | Notes |
|---|---|---|
| **US SEC & CFTC** | Federal Register API, the US government's official JSON API | Includes comment deadlines and effective dates |
| **HKMA notices** | Official RSS feeds for press releases, circulars and consultations | Circulars link to HKMA's regulatory-document site (BRDR), so key points come from the PDF |
| **HKMA liquidity** | The Daily Monetary Statistics web page, read as HTML | The HKMA Open API's firewall blocks cloud servers, so the public web page is used instead. Before about 7pm Hong Kong time, the most recent dated page is used |
| **SFC** | Official RSS feeds for press releases, circulars and consultations | Document pages load their text from SFC's own JSON service, which the server reads for key points |
| **MAS** | The search service behind mas.gov.sg/news (JSON) | Undocumented, and MAS shows a "Maintenance" page to unknown clients, so the server identifies itself like a normal browser |
| **ASIC** | The JSON file that ASIC's newsroom page loads | ASIC publishes no RSS feed. Its times are Sydney time mislabelled as UTC, so they are converted |
| **JFSA** | Official English news RSS feed | Press conference transcripts, overseas-visitor programmes and the weekly newsletter are left out. "JST" dates are converted |
| **Bank of England PRA** | Official RSS feed | |
| **FCA** | Official RSS feed | Cloudflare sometimes blocks it. It works from Vercel but is often blocked when run locally |
| **BIS & Basel Committee** | Official BIS media-release feed (RSS, older RDF format) | Basel Committee items are tagged BCBS |

## What the site works out itself

These come from rules in the code, not from the regulators:

- **Impact score and severity:** based on the type of document. Enforcement actions and proposed rules score higher. This is not a legal assessment.
- **Sector:** assigned by keywords, such as "crypto" for digital assets or "climate" for ESG.
- **Deadlines:** taken from the Federal Register's own date fields, or from dated sentences found in the document.

## Other things that use the same data

- **Status checks:** every 5 minutes, each source gets a single request to see whether it is up, slow, or blocked by a firewall or maintenance page. This feeds the "sources up" count.
- **Email digest** (`digest.ts`, rules in `digest-rules.ts`): a Vercel cron job runs each morning at about 08:00 Singapore time. It re-reads each source with a larger limit (20 items) and emails the site owner, through Resend, the previous day's notices that match the rules. No email is sent on days with no matches. It needs `CRON_SECRET`, `RESEND_API_KEY` and `DIGEST_TO` in the Vercel project settings (see `.env.example`).

## Ground rules

- No firewalls are bypassed. Where a source blocks cloud servers, the site uses another page the regulator publishes.
- Requests are spaced out to stay polite to the regulators' sites.
- There is no sample or made-up data. If a source fails, the last good data is kept and the error is shown.
