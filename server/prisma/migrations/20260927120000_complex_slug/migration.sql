-- Public URL slug for each complex (tuturnito.com/<slug>).
ALTER TABLE "Complex" ADD COLUMN "slug" TEXT;

-- Backfill existing complexes from their name: lowercase, strip accents,
-- non-alphanumerics to single dashes; duplicates get a -2, -3... suffix.
WITH base AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(translate(lower("name"), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'complejo'
    ) AS base_slug,
    "createdAt"
  FROM "Complex"
),
ranked AS (
  SELECT "id", base_slug, ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY "createdAt", "id") AS n
  FROM base
)
UPDATE "Complex" AS c
SET "slug" = CASE WHEN r.n = 1 THEN r.base_slug ELSE r.base_slug || '-' || r.n END
FROM ranked AS r
WHERE c."id" = r."id";

ALTER TABLE "Complex" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Complex_slug_key" ON "Complex"("slug");
