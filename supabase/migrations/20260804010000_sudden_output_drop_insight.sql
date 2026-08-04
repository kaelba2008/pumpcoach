-- Sudden sharp output drop — leads directly with "check your pump parts"
-- rather than listing it as one of several possible causes the way
-- declining_output_trend's copy does. See lib/patternDetection.ts for the
-- detection logic (30%+ drop over the last 2 days vs the prior week).

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'sudden_output_drop', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','mostly_pumping','unspecified'],
  ARRAY['mostly_nursing','weaning'],
  'A sharp, sudden output drop (30%+) over the last two days against the mom''s own recent baseline — distinct from a gradual decline. This magnitude and suddenness is a strong signal for worn or clogged pump parts (perished membrane, blocked valve, cracked duckbill) rather than a genuine supply change. Also worth naming: if she notices breast pain, a tender lump, or redness alongside the drop, that points toward a clogged duct in her own body, not just the pump equipment, and warrants prompt IBCLC or provider contact.',
  ARRAY['Lead with checking pump parts first, before other causes','Name membranes, valves, and duckbills specifically as common culprits','Mention a clogged duct as a possibility if paired with breast pain or a lump','Reassure that swapping parts often resolves it quickly','Recommend IBCLC contact if a parts check does not help or if pain/lump is present'],
  ARRAY['supply is failing','your body cannot','diagnose','medications'],
  'Warm, direct, practical, a little urgent without being alarming', 'needs_attention', 'moderate',
  'Your output dropped sharply over the last couple of days -- more than the usual day-to-day swing. When a drop is this sudden, the most common cause isn''t your body, it''s your pump parts. Membranes, valves, and duckbills wear out faster than people expect, and a worn or cracked one can tank your suction fast. Check your parts first -- if anything looks cracked, stretched, or discolored, swap it out and see if output bounces back over the next session or two (it often does, quickly). If you''re also noticing breast pain, a tender spot, or a lump, that could be a clogged duct on your end, and it''s worth reaching out to your IBCLC or provider soon rather than waiting it out. And if a fresh set of parts doesn''t bring things back up within a day or two, that''s also a good time to loop in an IBCLC.'
);
