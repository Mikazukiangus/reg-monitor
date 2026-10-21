-- Upcoming key dates across the whole history, soonest first: for each
-- notice, the date it shows while that date is still ahead, as the site
-- works it out (upcomingDate in shared/keyDate.ts), from the dates in
-- notice_dates (migration 4, rebuilt by each scheduled check).
--
-- Two rare differences from the site: where a document states two closing
-- dates, the site takes the first it states and this query the soonest still
-- ahead; and the format is the one stored when the notice was last saved,
-- where the site classifies the notice again when it is read.
WITH today AS (
  -- The site's dates turn on the day in Hong Kong
  SELECT (now() AT TIME ZONE 'Asia/Hong_Kong')::date AS day
),
dates AS (
  -- The regulator's dates if it published any, else those the document states
  SELECT d.*, n.regulator, n.format, n.title, n.data->>'dossierUrl' AS url
  FROM notice_dates d JOIN notices n ON n.id = d.notice_id
  WHERE d.source = 'regulator' OR NOT EXISTS (
    SELECT 1 FROM notice_dates r WHERE r.notice_id = d.notice_id AND r.source = 'regulator')
),
upcoming AS (
  SELECT DISTINCT ON (notice_id) dates.*
  FROM dates, today
  WHERE date >= today.day
    -- A round-up's text quotes the dates of the papers it lists
    AND NOT (source = 'document' AND title ~* '\m(digest|newsletter|bulletin|round-?up)\M')
    AND CASE kind
      -- A closing date stated generally belongs only to a consultation
      WHEN 'closes' THEN NOT general OR format = 'Consultations'
      -- On consultations these dates are only proposed
      ELSE format NOT IN ('Consultations', 'Enforcement')
    END
  -- Comments still open come first, then the soonest date
  ORDER BY notice_id, kind <> 'closes', date
)
SELECT date,
  CASE kind WHEN 'closes' THEN 'Comments close' WHEN 'takesEffect' THEN 'Takes effect' ELSE 'Comply by' END AS what,
  regulator, title, source, quote, url, notice_id
FROM upcoming
ORDER BY date, regulator, title;
