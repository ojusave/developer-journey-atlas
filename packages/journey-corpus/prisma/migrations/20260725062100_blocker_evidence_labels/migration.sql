UPDATE "GateBlockerLink"
SET "confidence" = CASE
  WHEN "confidence" = 'confirmed' THEN 'model_selected'
  WHEN "confidence" = 'confirmed-empty' THEN 'model_abstained'
  ELSE "confidence"
END
WHERE "confidence" IN ('confirmed', 'confirmed-empty');
