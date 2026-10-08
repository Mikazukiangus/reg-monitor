# How RegSonar Gets Its Data

RegSonar has no special access or data agreements. Every notice and figure comes from a public page or feed that the regulator itself publishes, and the server reads it the same way a browser would.

## The flow of a sync

1. **A server on Vercel (Hong Kong region, `hkg1`) fetches each source.** The site's own Express server (`server.ts`) does the fetching, not the visitor's browser and not any AI service. Each source is fetched at most once every 10 minutes; the HKMA liquidity page every 30.
2. **Each item is put into a common format:** title, regulator, date, link, type and so on.
3. **Key points are quoted from the document itself** (`summarize.ts`). For each notice, the server opens the linked document once and picks its most central sentences word for word using TextRank, a ranking algorithm, not an AI model. It also picks out sentences containing dates and reference numbers. Scanned PDFs are read with Tesseract OCR, and those quotes are labelled "OCR".
4. **Each notice is saved to the history database** (`db.ts`, Postgres on Neon) when a database is connected. See "Notice history" below.
5. **Vercel's CDN keeps a copy** of the combined result for up to 5 minutes. Visitors get it instantly, and "Data as of" shows when it was built.
6. **The visitor's device keeps its own copy** (`public/sw.js`) for offline use.

## Where each source comes from

| Regulator | How it's read | Notes |
|---|---|---|
| **US SEC & CFTC** | Federal Register API, the US government's official JSON API | Includes comment deadlines and effective dates |
| **HKMA notices** | Official RSS feeds for press releases, circulars and consultations | Circulars link to HKMA's regulatory-document site (BRDR), so key points come from the PDF |
| **HKMA liquidity** | The Daily Monetary Statistics web page, read as HTML | The HKMA Open API's firewall blocks cloud servers, so the public web page is used instead. Before about 7pm Hong Kong time, the most recent dated page is used |
| **SFC** | Official RSS feeds for press releases, circulars and consultations | Document pages load their text from SFC's own JSON service, which the server reads for key points |
| **HKEX** | Official RSS feed of regulatory announcements | Disciplinary actions, censures and sanctions are classed as enforcement |
| **MAS** | The search service behind mas.gov.sg/news (JSON): media releases, consultations, and circulars and guidelines | Undocumented, and MAS shows a "Maintenance" page to unknown clients, so the server identifies itself like a normal browser. Times are Singapore time mislabelled as UTC, so they are converted. Consultation closing dates come from MAS's own closing-date field |
| **ASIC** | The JSON file that ASIC's newsroom page loads | ASIC publishes no RSS feed. Its times are Sydney time mislabelled as UTC, so they are converted |
| **JFSA** | Official English news RSS feed | Press conference transcripts, overseas-visitor programmes and the weekly newsletter are left out. "JST" dates are converted |
| **Bank of England PRA** | Official RSS feed | |
| **FCA** | Official RSS feed | Cloudflare sometimes blocks it. It works from Vercel but is often blocked when run locally |
| **SGX RegCo** (Singapore Exchange Regulation) | The content API that SGX RegCo's own web pages load (JSON): public consultations, public disciplinary actions, and the SGX media list filtered to regulatory announcements, public regulatory statements, Regulator's Column and items tagged Regulation | SGX publishes no RSS feed and its pages are filled in by JavaScript. Consultation closing dates come from SGX's own field. Key points are read from the same API |
| **ASX** | The public consultations table on ASX's consultations page (HTML) | Recordings and event notices are left out. The title is the entry's first sentence; the closing date comes from the entry's text; key points come from the linked consultation paper (PDF) |
| **JPX** (Tokyo Stock Exchange, Osaka Exchange, Tokyo Commodity Exchange, Japan Exchange Regulation) | The English rule-revision tables on jpx.co.jp (HTML), one per exchange | Key points come from the English outline of each revision (PDF). Dates are Japan time |
| **FINRA** | Official notices RSS feed | Board election notices are left out. Feed titles are only the notice number, so the title adds the opening sentence of FINRA's own summary. FINRA's Cloudflare challenges clients that pose as a browser, so the server identifies itself plainly as "RegSonar-Feed-Gateway/2.0" there. FINRA rate-limits quickly, so notice pages are fetched only once each, for key points |
| **ESMA** | Official news RSS feed | The publication date is read from the item's description |
| **BIS & Basel Committee** | Official BIS media-release feed (RSS, older RDF format) | Basel Committee items are tagged BCBS |
| **FSB** | Official publications RSS feed | Regional consultative group meetings and auditor reports are left out |

Sources considered and left out: SGX Group news releases about listings, awards, indices and results (only regulatory items are kept), JPX market news (mostly listings and index changes), IOSCO (its site refuses automated requests), EBA (its feed only carries daily e-mail alert bulletins) and APRA (its feed only carries statistics releases).

## What the site works out itself

These come from rules in the code, not from the regulators:

- **Impact score and severity:** based on the type of document. Enforcement actions and proposed rules score higher. This is not a legal assessment.
- **Sector:** assigned by keywords, such as "crypto" for digital assets or "climate" for ESG.
- **Deadlines:** taken from the source's own date fields where there are any (the Federal Register's comment and effective dates, MAS's consultation closing date), or from dated sentences found in the document.
- **Comments close:** for consultations without a date field, the server looks for a sentence in the document that says when comments, responses or submissions are due (for example "Comments should be submitted by 30 November 2026") and shows the date from it. A closing date already past is shown as "Comments closed".
- **Consultation links:** a consultation is linked to the conclusions or response published later by the same regulator, and back, when their titles share most of their topic words. Regulators don't publish this link in a form a program can read, so it is labelled "matched by title".

## Notice history

Most feeds only list their latest 10 to 50 items, so without a store older notices drop out of view. When the Vercel project has a Postgres database (Neon, added in the project's Storage tab, which sets `DATABASE_URL`), the server saves every notice it reads, with its key points, after each successful refresh. The feed then also shows notices from the last 30 days that are no longer in the live feeds, marked "From history", and the search box searches the whole history by title, summary and key points. The first few digest runs read 50 items per source to fill the history back. Without a database the site works from the live feeds alone.

## Other things that use the same data

- **Status checks:** every 5 minutes, each source gets a single request to see whether it is up, slow, or blocked by a firewall or maintenance page. This feeds the "sources up" count.
- **Email digest** (`digest.ts`, rules in `digest-rules.ts`): a Vercel cron job runs each morning at about 08:00 Singapore time. It re-reads each source with a larger limit (20 items, or 50 while the history is still filling) and emails the site owner, through Resend, the previous day's notices that match the rules. No email is sent on days with no matches. It needs `CRON_SECRET`, `RESEND_API_KEY` and `DIGEST_TO` in the Vercel project settings (see `.env.example`).

## Checks

- **Tests** (`npm test`, in `tests/`): each source's reader is run against saved copies of that source's real responses, so a change that breaks how a source is read fails the test. GitHub runs the type check, the tests and the build on every push (`.github/workflows/ci.yml`).

## Ground rules

- No firewalls are bypassed. Where a source blocks cloud servers, the site uses another page the regulator publishes.
- Requests are spaced out to stay polite to the regulators' sites.
- There is no sample or made-up data. If a source fails, the last good data is kept and the error is shown.
