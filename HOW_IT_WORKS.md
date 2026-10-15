# How RegSonar Gets Its Data

RegSonar has no special access or data agreements. Every notice and figure comes from a public page or feed that the regulator itself publishes, and the server reads it the same way a browser would.

## The flow of a sync

1. **A server on Vercel (Hong Kong region, `hkg1`) fetches each source.** The site's own Express server (`server.ts`) does the fetching, not the visitor's browser and not any AI service. Each source is fetched at most once every 10 minutes when someone visits; the HKMA liquidity page every 30. Separately, a scheduled check reads every source every three hours (see "Keeping every source up to date" below).
2. **Each item is put into a common format:** title, regulator, date, link, type and so on.
3. **Key points are quoted from the document itself** (`summarize.ts`). For each notice, the server opens the linked document once (key points already in the history are reused, so a new server instance doesn't read the documents again) and picks its most central sentences word for word using TextRank, a ranking algorithm, not an AI model. It also picks out sentences containing dates and reference numbers. Scanned PDFs are read with Tesseract OCR, and those quotes are labelled "OCR". Chinese and Japanese documents are split into sentences at "。" and quoted as published, not translated.
4. **Each notice is saved to the history database** (`db.ts`, Postgres on Neon) when a database is connected. See "Notice history" below.
5. **Vercel's CDN keeps a copy** of the combined result for up to 5 minutes. Visitors get it instantly, and "Data as of" shows when it was built. A refresh (the Sync button, or a copy older than 10 minutes) skips the CDN; the server then reuses a result it built in the last minute, and each visitor may refresh 6 times a minute (after that the server answers HTTP 429 and the page says when to try again). Both limits are kept per server instance.
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
| **SGX RegCo** (Singapore Exchange Regulation) | The content API that SGX RegCo's own web pages load (JSON): public consultations, public disciplinary actions, and the SGX media list filtered to regulatory announcements, public regulatory statements, Regulator's Column, items tagged Regulation and speeches given for SGX RegCo | SGX publishes no RSS feed and its pages are filled in by JavaScript. Consultation closing dates come from SGX's own field. Key points are read from the same API |
| **Bank Negara Malaysia** | The press release table on BNM's page for each year (HTML), with last year's page added early in the year | BNM's RSS feed is behind a Cloudflare check that automated requests cannot pass, so it isn't used. Dates are Malaysian days. Key points come from the press release page |
| **Securities Commission Malaysia** | The media release list built into SC's media release page (HTML) | The page carries the whole archive with each release's own short description, which is kept as the summary. Dates are Malaysian days |
| **ASX** | The public consultations table on ASX's consultations page (HTML) | Recordings and event notices are left out. The title is the entry's first sentence; the closing date comes from the entry's text; key points come from the linked consultation paper (PDF) |
| **JPX** (Tokyo Stock Exchange, Osaka Exchange, Tokyo Commodity Exchange, Japan Exchange Regulation) | The English rule-revision tables on jpx.co.jp (HTML), one per exchange | Key points come from the English outline of each revision (PDF). Dates are Japan time |
| **FINRA** | Official notices RSS feed | Board election notices are left out. Feed titles are only the notice number, so the title adds the opening sentence of FINRA's own summary. FINRA's Cloudflare challenges clients that pose as a browser, so the server identifies itself plainly as "RegSonar-Feed-Gateway/2.0" there. FINRA rate-limits quickly, so notice pages are fetched only once each, for key points |
| **ESMA** | Official news RSS feed | The publication date is read from the item's description |
| **BIS & Basel Committee** | Official BIS media-release feed (RSS, older RDF format) | Basel Committee items are tagged BCBS |
| **FSB** | Official publications RSS feed | Regional consultative group meetings and auditor reports are left out |

### Rules for artificial intelligence

These come from the official body in each jurisdiction that makes or enforces AI rules. Feeds that cover all of an agency's work are narrowed by `src/lib/aiTopics.ts`: the title must be about AI (English, Chinese or Japanese words for it) and the title or summary must concern rules or their enforcement (a law, rules, guidance, consultation, investigation, executive order and so on), so funding rounds, industry programmes and passing mentions are left out. A narrowed feed often has nothing new; that is not an error. Every notice from these sources is tagged "AI rules".

| Jurisdiction | Source | Notes |
| --- | --- | --- |
| **EU** | The European Commission's news list on its "Shaping Europe's digital future" site, filtered to the AI topic (HTML) | Covers the AI Act, its guidelines and codes of practice, and the AI Office and AI Board. The site's RSS feed covers every digital topic and can't be filtered. Dates are Brussels days |
| **UK** | GOV.UK's search API: the Department for Science, Innovation and Technology and the AI Security Institute (JSON) | The UK has no AI act; its regulators apply their own rules (the PRA's and FCA's are read already) |
| **US federal** | Federal Register API: documents containing "artificial intelligence" whose title is about AI | Executive orders, rules, policy statements and requests for information from any agency. Meeting, nomination and paperwork notices are left out. The most specific agency is named |
| **US federal** | FTC press releases (RSS) | Inquiries, enforcement and policy statements on AI (the feed's items on privacy are kept too; see "Data privacy" below) |
| **California** | The Governor's site search for "artificial intelligence" (WordPress RSS), and CalPrivacy's news feed (RSS) | The Governor signs the state's AI laws; CalPrivacy (the CPPA) makes the rules on automated decisionmaking technology. Every CalPrivacy item is kept as data privacy; those mentioning AI are also tagged "AI rules" |
| **Colorado** | The Attorney General's site search for "artificial intelligence" (WordPress RSS) | The Attorney General enforces, and makes rules under, the Colorado AI Act |
| **South Korea** | The Ministry of Science and ICT's English press releases (HTML) | MSIT administers the Framework Act on AI. Titles and dates are written into the list page by a script, which the server reads. Dates are Korean days |
| **China** | The State Council's policy library on gov.cn, through the search service its page uses: documents with 人工智能 (artificial intelligence) in the title from the State Council, its departments and the State Council Gazette (JSON, in Chinese) | China's AI rules are made by the Cyberspace Administration (CAC) and other departments; the CAC's own site doesn't accept connections from the hosting region (Hong Kong). Orders printed in the Gazette are department rules and score as rules made, as do measures (办法) and provisions (规定); the Gazette prints orders some weeks after they are issued, and reprints of documents already listed are dropped. Titles need a word for rules (measures, labelling, ethics, standards and so on), so plans to promote AI in an industry ("人工智能+"), pilot zones and speeches are left out. The issuing department is named (CAC, MIIT and so on). Titles and key points stay in Chinese, as published; dates such as "自2026年7月15日起施行" (takes effect from) are read from the text |
| **Japan** | The topics list of the Cabinet Office's AI strategy pages (HTML, in Japanese) | Under the AI Promotion Act. Meetings count as routine; calls for comments are consultations, with the closing date read from the page ("…までの間、意見を募集します"; Reiwa years converted) |

Left out: Texas (its AI law is enforced by the Attorney General, whose news releases rarely concern AI: two of the 90 most recent mentioned it, neither about the law), EUR-Lex (it answers automated requests with a bot check), the CAC's own site (it doesn't accept connections from the hosting region, and its JSON list service refuses automated requests; its notices, such as the register of generative AI services, are therefore not covered), China's State Council English site (one AI item in its last 150 releases) and Singapore's IMDA (its AI news is mostly industry programmes; MAS covers Singapore's AI rules for financial firms).

### Data privacy

These come from the data protection authority of each jurisdiction RegSonar already covers. A privacy regulator's own news is kept whole, less speeches, events and procurement notices. Feeds that also cover other work (the FTC's and the OAIC's, and China's policy library) keep only items about privacy or personal data (`src/lib/privacyTopics.ts`: English, Chinese and Japanese words for it, and abbreviations such as GDPR and PDPA in capitals). Every notice from these sources is tagged "Data privacy"; one that is also about AI rules (an AI and personal data consultation, a fine for automated decision-making) is tagged "AI rules" too. Data privacy is also a sector, "Data Privacy & Protection" (link key `privacy`), with its own filter and Radar row. Privacy words give it (the same words as above, from any source), and every notice from a data protection authority is in it, even when its words give other sectors too ("Complaints about automated nuisance calls" is Conduct and Data Privacy); "Why these tags?" then says the regulator is a data protection authority. On 15 October 2026 privacy was briefly part of the AI sector's name ("AI, Data Privacy, Cyber & Tech Risk"); bookmarks and offline copies saved under that name are read as "AI, Cyber & Tech Risk" and refreshed from the feed when shown. A link or saved view with only some sectors ticked lists them by key, so one made before the new sector doesn't include it; tick it and save the view again to add it. One with every sector ticked has no list and includes it.

| Jurisdiction | Source | Notes |
| --- | --- | --- |
| **UK** | The ICO's news, blogs and statements, through the search service its news page uses (JSON, asked by POST) | Speeches are left out, and so are freedom-of-information items unless they concern personal data. Dates are London days |
| **EU** | The European Data Protection Board's news feed (RSS) | The Board's guidelines, opinions and statements, and national authorities' decisions it reports (fines count as enforcement) |
| **US** | FTC press releases (RSS) and CalPrivacy's news feed (RSS) | FTC items whose title concerns privacy or personal data; every CalPrivacy item |
| **Singapore** | The PDPC's media and events list, through the listing service its page uses (JSON) | Events and speeches are left out. "New Commission's Decision and Undertakings on …" are its enforcement decisions. Reports linked as files are read as PDFs |
| **Malaysia** | The Personal Data Protection Department's (JPDP) English site feed (WordPress RSS) | Procurement notices are left out. The feed carries only its latest few announcements |
| **Australia** | The OAIC's media centre list (HTML) | The OAIC also handles freedom of information, so only items about privacy or data breaches are kept. Links are read from the site search's redirect. Dates are Sydney days |
| **Japan** | The Personal Information Protection Commission's news list (HTML, in Japanese) | Kept: the Act on the Protection of Personal Information and the My Number Act, press releases, calls for comments, international cooperation and activity reports. Commission meetings, recruitment, budgets, procurement, and lists of opt-out filings received are left out. Its English site adds a few items a year |
| **South Korea** | The Personal Information Protection Commission's English notices (HTML) | "The PIPC Sanctions …" are enforcement. Dates are Korean days |
| **China** | The State Council's policy library on gov.cn (as for AI rules), searched for 个人信息 (personal information) in the title (JSON, in Chinese) | The search also returns titles without the phrase, so the title must contain it. Measures such as those on cross-border transfers of personal information |

Left out: Hong Kong's Privacy Commissioner for Personal Data (PCPD; its site answers automated requests with a bot check) and the Federal Register (its privacy documents are almost all Privacy Act housekeeping notices about agencies' own records).

Sources considered and left out: SGX Group news releases about listings, awards, indices and results (only regulatory items are kept), JPX market news (mostly listings and index changes), IOSCO (its site refuses automated requests), Bursa Malaysia (its site is behind a Cloudflare check), EBA (its feed only carries daily e-mail alert bulletins) and APRA (its feed only carries statistics releases).

## What the site works out itself

These come from rules in the code, not from the regulators:

- **Impact score and severity:** one rubric for every source, described below.
- **Sector and format:** assigned by keyword rules in `src/lib/tagging.ts`, described below.
- **Dates:** taken from the source's own date fields where there are any (the Federal Register's comment and effective dates, MAS's and SGX's consultation closing dates). Otherwise from a sentence in the document that states a date for the document itself, and every date says what kind it is:
  - **Comments close:** a request for comments with its date ("Comments should be submitted by 30 November 2026"), or, on a consultation only, a statement such as "The consultation closes on 14 October 2026". A digest or event notice can mention another paper's closing date, so there the general statement is not used. A closing date already past is shown as "Comments closed".
  - **Takes effect:** "will take effect on", "become effective on", "the effective date ... is", "shall apply on". Not used on consultations, where the date is only proposed.
  - **Comply by:** an obligation with a date ("should have ... in place by 1 July 2030").
  - The cue must come right before the date, so another date in the same sentence is not taken for it ("gazetted on 16 October and become effective on 1 November" gives 1 November). Sentences about proposals, conditions or views ("proposed", "would", "if", "differing views") give no effective or compliance date, a date being replaced ("instead of 1 January 2027") is skipped, and enforcement actions and digests take no dates from their text.
  - The date shown is the closing date if comments are still open, else the soonest upcoming effective or compliance date, else a past closing date. The sentence it came from is shown with the notice's dated statements and on hover.
  - The rules are tested on sentences from real notices (`tests/dates.test.ts`). Dates from the text are worked out again whenever a stored notice is read, so a rule change applies to the whole history.
- **Consultation links:** a consultation is linked to the conclusions or response published later by the same regulator, and back, when their titles share most of their topic words. Regulators don't publish this link in a form a program can read, so it is labelled "matched by title".

## Keeping every source up to date

A visit refreshes each source's newest 3 or 4 items, so a regulator that publishes more than that between visits, or a source added later, would otherwise have gaps. To close them:

- **Scheduled check** (`/api/feeds/poll`): Vercel cron jobs call it every three hours (03:00, 06:00 … 21:00 UTC; the 00:00 digest does the same check). The Hobby plan allows each cron job to run once a day, so there are seven daily jobs at different hours, and Vercel may start each one up to an hour late. It needs `CRON_SECRET`, like the digest.
- It reads the newest 20 items of every source and saves them to the history. If none of those 20 is in the history yet (a new source, or more than 20 items published since the last check), it reads back 50.
- It adds key points to up to 5 documents per source per run, newest first, so a backlog is worked through over the next few runs without hammering any site.
- When it finishes it requests the public feed, so the copy Vercel's CDN serves visitors includes what it found.
- **Rate limits:** requests to FINRA are spaced 4 seconds apart. After an HTTP 429 (too many requests) from any site, the server doesn't ask that site again for as long as its Retry-After header says, or 15 minutes.

## Notice history

Most feeds only list their latest 10 to 50 items, so without a store older notices drop out of view. When the Vercel project has a Postgres database (Neon, added in the project's Storage tab, which sets `DATABASE_URL`), the server saves every notice it reads, with its key points, after each successful refresh. The feed then also shows notices from the last 30 days that are no longer in the live feeds, marked "From history", and the search box searches the whole history by title, summary and key points. Without a database the site works from the live feeds alone.

## Other things that use the same data

- **Status checks:** every 5 minutes, each source gets a single request to see whether it is up, slow, or blocked by a firewall or maintenance page. This feeds the "sources up" count.
- **Email digest** (`digest.ts`, rules in `digest-rules.ts`): a Vercel cron job runs each morning at about 08:00 Singapore time. It runs the scheduled check below and emails the site owner, through Resend, the previous day's notices that match the rules. No email is sent on days with no matches. It needs `CRON_SECRET`, `RESEND_API_KEY` and `DIGEST_TO` in the Vercel project settings (see `.env.example`).

## Sectors and formats

Each notice gets up to three of twelve sectors: Banking & Prudential; Capital Markets & Listings; Funds & Asset Management; Insurance & Pensions; FinTech, Payments & Digital Assets; AI, Cyber & Tech Risk; Data Privacy & Protection; ESG & Sustainability; AML/CFT & Financial Crime; Conduct & Consumer Protection; Monetary & Financial Stability; General & Institutional.

- **Whole words only.** "AI" no longer matches inside "maintain", and "fund" doesn't match "own funds" or "guarantee fund". Regulator names are removed before matching, so "Monetary Authority" doesn't make a notice about monetary policy, and "Bank of England" doesn't make it about banks.
- **The title counts most.** A word in the title scores 3; a word in the summary or key points scores 1. A sector needs 3, so the summary alone can add a sector only when several of its words appear.
- **Ties** go to the more specific topic (for example AML before Banking). For market regulators and exchanges, Capital Markets goes first.
- **No topic words:** market regulators and exchanges default to Capital Markets & Listings, the PRA and Basel Committee to Banking & Prudential, everyone else to General & Institutional. The notice says that the tag is a default.
- **Format** (Consultation, Enforcement, Guidelines, Technical Standards, else Circular) also comes from phrases in the title, checked in a fixed order: speeches and approval orders are never enforcement or consultations; "orders", "no-action letter" or "suspended companies" alone don't make a notice enforcement.
- **Reasons are kept.** Every notice records the words that gave each tag, and the card shows them under "Why these tags?".
- **Old notices are re-tagged** when read back from the history, so a rule change applies to everything shown.

Quality checks:

- `tests/tagging.test.ts` holds hand-labelled notices taken from the live sources, with the sector and format a reader would give them. A rule change that breaks one fails the tests.
- `npm run tags:review` reads the live sources and lists the notices whose tags rest on the weakest evidence: defaults because no topic words matched, sectors that came from the summary only, and circulars by default. Reading that list now and then shows rules that are missing. When a tag is wrong, add the notice to the test file with the right answer, then change the rules until every test passes.

## Impact score

Every notice gets its score from one function, `src/lib/impact.ts`, the same way for every source and for notices read back from the history. Before this, each source set a fixed number per format and the Federal Register used its own scale, so a routine SEC paperwork notice scored "High" while a final MAS circular scored "Info", and notices kept whatever score they were stored with.

What the document does (the first that applies):

| Kind | Score |
| :--- | :--- |
| Routine: data releases, events, appointments, speeches, cooperation agreements, periodic reports, paperwork notices | 3 |
| An exchange's or SRO's rule filing published by the SEC | 4 |
| Other circulars and announcements | 5 |
| Technical standards | 6 |
| Guidance | 6.5 |
| Enforcement action | 7 |
| Consultation open for comment | 7 |
| Rules made: final rules, amendments, policy statements, consultation conclusions, requirements taking effect | 7.5 |

Dates move it: +1.5 when comments close within 14 days or rules take effect within 30 days (the Federal Register's effective date, or a "Takes effect" date from the document's text; a "Comply by" date does not move the score); a consultation whose closing date has passed scores 4. Severity follows the score: Critical from 8.5 (so only something with a date close at hand), High from 6.5, Info below. The steps are shown on each notice under "Why these tags and score?". Because dates move scores, they are worked out each time notices are served, not stored.

The format also comes from the source's own category and the title alone, every time. Consultation conclusions and responses are not counted as open consultations, nor are SEC rule filings by exchanges. The Consultations card counts only consultations still open for comment and shows how many have closed.

The score does not know how much a notice matters to a particular firm, and is not a legal assessment.

## Checks

- **Dates:** `tests/dates.test.ts` checks the date rules on sentences from real notices, including ones that used to be given the wrong date.
- **Tests** (`npm test`, in `tests/`): each source's reader is run against saved copies of that source's real responses, so a change that breaks how a source is read fails the test. Tagging rules are tested against hand-labelled notices (see "Sectors and formats"). The impact rubric is tested the same way (`tests/impact.test.ts`), and every source's notices are checked to carry the rubric's reasons. GitHub runs the type check, the tests and the build on every push (`.github/workflows/ci.yml`).

## Ground rules

- No firewalls are bypassed. Where a source blocks cloud servers, the site uses another page the regulator publishes.
- Requests are spaced out to stay polite to the regulators' sites.
- There is no sample or made-up data. If a source fails, the last good data is kept and the error is shown.

## Security headers

`vercel.json` sends a Content Security Policy with every response: scripts only from the site itself (plus the one inline script in `index.html` that sets the theme before the page draws, allowed by its hash), styles and fonts only from the site and Google Fonts, no framing by other sites, and no plugins. It also sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a `Referrer-Policy` that sends other sites only the origin, and a `Permissions-Policy` that turns off camera, microphone and location. A test fails if the inline script changes without its hash. The server does not send `X-Powered-By`.

The icon font is loaded with only the icons the page uses (`icon_names` in `index.html`, about 13 KB instead of 4 MB), and nothing is drawn until it arrives, so icon names never show as words. A test fails if the page uses an icon that is not in the list.
