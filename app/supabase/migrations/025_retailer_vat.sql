-- What tax a shop's listed price already contains.
--
-- WHY THIS EXISTS
--
-- Raised on r/Diecast, 2026-10-12: "Do you also deduct VAT/GST for out of
-- country purchases? I get my Spark models from NZ because I can buy without
-- GST, making them cheaper than here in Australia."
--
-- The site showed every price exactly as the shop listed it, with no record of
-- what was inside that number. A Belgian price and an Australian price were
-- rendered identically while one carried 21% VAT and the other 10% GST, so the
-- comparison was not like for like and nothing on the page said so.
--
-- 12 of 47 retailers sit in a VAT region and 7 of them carry links. Three of
-- those carry 94% of the affected rows, so this is a small, checkable set
-- rather than a research project across the whole roster.
--
-- WHAT THIS DOES NOT CLAIM
--
-- vat_rate is what the LISTED PRICE INCLUDES. It is deliberately NOT a promise
-- that a non-EU buyer avoids it. Both of the shops carrying 88% of these rows
-- were read before this migration was written, and neither documents removing
-- VAT for export:
--
--   Miniatures Minichamps (BE)  "All visible prices ... includes all taxes",
--                               and for delivery outside the EU "the additional
--                               custom taxes and paperwork will be for the
--                               customer to pay". No VAT removal mentioned.
--   Mini Model Shop (UK)        cart states "Taxes included"; the shipping
--                               policy mentions only import tax/duty the buyer
--                               may owe. No VAT removal mentioned.
--
-- So the commenter's New Zealand experience is real but shop specific, and an
-- "ex-VAT" price would be a number nobody could actually obtain at these two.
-- Display states what is included. It does not subtract.
--
-- NULL means unknown or no sales tax in the listed price, not zero. A shop we
-- have not checked must not render a confident "includes 0% VAT".

ALTER TABLE retailers ADD COLUMN IF NOT EXISTS vat_rate NUMERIC;
COMMENT ON COLUMN retailers.vat_rate IS
  'Sales tax already inside the shop''s listed price, as a percentage. NULL = unknown or none. Not a claim that a buyer can avoid it.';

-- Standard consumer rates for the regions held. EU and UK law requires
-- consumer-facing prices to be shown inclusive of VAT, which is why these can
-- be set by region rather than per shop.
UPDATE retailers SET vat_rate = 21 WHERE region IN ('BE', 'NL', 'CZ');
UPDATE retailers SET vat_rate = 20 WHERE region IN ('UK', 'AT');
UPDATE retailers SET vat_rate = 19 WHERE region = 'DE';

-- Australian GST, which an Australian buyer pays and therefore belongs in the
-- same column for the same reason.
UPDATE retailers SET vat_rate = 10 WHERE region = 'AU';

-- Left NULL on purpose: US sales tax is added at checkout rather than included
-- in a listed price, and CN, CA and GLOBAL shops vary too much to state.

SELECT name, region, currency, vat_rate
FROM retailers
WHERE vat_rate IS NOT NULL
ORDER BY vat_rate DESC, name;
