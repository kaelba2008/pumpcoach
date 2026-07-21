-- ============================================================
-- Session 5 Part 1b: Seed insight_templates + notifications_content
-- Author: Katie Clark, IBCLC  Version: 1.0
-- ============================================================

-- ── TEMPLATE 1: long_gap_between_sessions ─────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output, trigger_notes) VALUES
(
  'long_gap_between_sessions', 'exclusive_pumping_early', 'early',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning'],
  'Exclusive pumper in early postpartum (0-12 weeks). Frequent stimulation is critical for building long-term supply. Body is still establishing baseline production.',
  ARRAY['Remind about recommended gap lengths','Mention overnight pumping if user skips overnight','Validate that life is busy','Encourage consistency over perfection'],
  ARRAY['your supply is dropping','supplements','waking baby to pump','you failed','you missed'],
  'Warm, nurturing, IBCLC-friend', 'mild', 'light',
  'After reviewing your logs, I noticed a 6-hour gap yesterday afternoon. Because you are exclusively pumping and still in the early postpartum weeks, frequent stimulation is important for building long-term supply. Your body is laying down the framework to be able to produce milk for the long haul, so I would recommend keeping daytime gaps to 2-3 hours and overnight to 4-5 hours when you can. Pumping between 2-3 AM is key in this early window. Life gets busy and I never want you to feel like you need a rigid schedule, but consistency when you can matters most right now.',
  'Only mention 2-3 AM pump if logs show she is skipping overnight sessions specifically.'
),
(
  'long_gap_between_sessions', 'exclusive_pumping_established', 'established',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning'],
  'Exclusive pumper in established postpartum (12+ weeks). Supply is more resilient but consistent removal still matters.',
  ARRAY['Note that supply is more established','Recommend daytime gap guidance','Suggest watching supply if longer overnight gaps are being incorporated'],
  ARRAY['your supply is dropping','supplements','waking baby','you failed'],
  'Warm, nurturing, IBCLC-friend', 'informational', 'light',
  'It looks like you had a longer gap between sessions yesterday. With where you are postpartum, your supply is more established and less reactive to gaps here and there. For exclusive pumpers, I generally recommend daytime gaps of no more than 3-4 hours. Longer overnight stretches can be appropriate for some moms, but I would recommend watching a little more closely if you are incorporating longer gaps to make sure your supply stays where you want it to be.',
  NULL
),
(
  'long_gap_between_sessions', 'equal_pumping_nursing_any', 'any',
  ARRAY['equal_pumping_nursing'], ARRAY['mostly_nursing','weaning'],
  'Mom pumping and nursing about equally. Gaps between pumps are usually fine if baby is nursing in between.',
  ARRAY['Distinguish pump gaps from total milk-removal gaps','Watch for gaps where neither nursing nor pumping is happening'],
  ARRAY['your supply is dropping','supplements','you failed'],
  'Warm, nurturing, IBCLC-friend', 'informational', 'light',
  'I noticed a longer gap in your pump sessions yesterday. Since you are splitting your time between pumping and nursing pretty equally, gaps between pumps are usually fine if baby is nursing in between. The main thing to watch is gaps where neither is happening, like long stretches where baby is sleeping and you are not pumping either. Those are the ones that may impact supply over time. Keep an eye on your daily output if you are trying to shift things around, and do not forget your rest matters too.',
  NULL
),
(
  'long_gap_between_sessions', 'work_pumping_any', 'any',
  ARRAY['work_pumping'], ARRAY['mostly_nursing','weaning'],
  'Mom pumping at work, nursing otherwise. Work schedule makes consistent pumping challenging.',
  ARRAY['Validate work difficulty','Recommend mirroring baby feeding frequency','Mention HR support if scheduling is an issue','Suggest shorter but effective sessions'],
  ARRAY['your supply is dropping','supplements','you failed','you should pump more'],
  'Warm, nurturing, IBCLC-friend', 'informational', 'light',
  'It looks like you had a longer gap yesterday during work than normal. Pumping at work can be challenging, and I want you to know that is completely understandable. What I generally recommend is trying to mimic what your baby would do if you were together, at least in the beginning. This usually means pumping every 2-4 hours during your shift. Longer gaps can lead to discomfort and over time a drop in output for some moms. If your schedule makes it hard to find time, focusing on shorter but effective sessions can help. Just do the best you can, and do not be afraid to speak with HR if you need support managing pumping at work.',
  'Only count gaps during work hours for this context.'
),
(
  'long_gap_between_sessions', 'supply_building_any', 'any',
  ARRAY['supply_building'], ARRAY['mostly_nursing','weaning'],
  'Mom nursing and adding pump sessions to build supply. Missing a bonus pump does not eliminate baseline but slows building progress.',
  ARRAY['Note that nursing covers baseline','Explain how missed pumps slow building','Validate that life got in the way','Encourage sustainable planning'],
  ARRAY['your supply is dropping','supplements','you failed'],
  'Warm, nurturing, IBCLC-friend', 'informational', 'light',
  'I noticed you missed your usual pump windows yesterday. Since you are nursing and adding pumps to build supply, missed pumps probably will not hurt your baseline (nursing has that covered) but they may slow your building progress. If life got in the way, that is okay. Building a sustainable plan matters most, so adjust things where you need to, including your goals if needed. You are doing great.',
  NULL
),
(
  'long_gap_between_sessions', 'triple_feeding_any', 'any',
  ARRAY['triple_feeding'], ARRAY['mostly_nursing','weaning'],
  'Mom triple feeding. Gaps happen because of exhaustion. Triple feeding is temporary and unsustainable long-term.',
  ARRAY['Validate exhaustion','Note that triple feeding is meant to be temporary','Encourage IBCLC support for sustainable path forward'],
  ARRAY['your supply is dropping','supplements','you should pump more','you failed'],
  'Warm, nurturing, deeply compassionate', 'mild', 'strong',
  'I noticed a few gaps in your logs from yesterday. Triple feeding is truly exhausting, and gaps happen because you are running on empty, not because you are not trying. Triple feeding is meant to be very temporary, and if you feel like there is no way out, it might be time to work with an IBCLC who can help you find a more sustainable path forward. I know that making milk and feeding your baby is important to you, and we may be able to find something that works better for your whole situation.',
  'Only fire for triple feeding users who have been in this pattern for more than 7 days.'
);

-- ── TEMPLATE 2: morning_output_higher_than_evening ────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'morning_output_higher_than_evening', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','unspecified'],
  ARRAY['mostly_nursing'],
  'Prolactin is naturally higher in early morning hours. Morning sessions typically yield more milk. This is a universal pattern, not a problem.',
  ARRAY['Normalize the pattern','Explain prolactin timing','Suggest leaning into morning pumps if schedule allows','Note evening sessions can be shorter'],
  ARRAY['evening output is bad','skip evening pumps','your prolactin level is','alarm'],
  'Warm, reassuring, slightly educational', 'informational', 'none',
  'Your morning sessions are running about 30% higher than your evenings. I know that might seem alarming at first, but it is actually completely normal. Prolactin, the hormone that drives milk production, is naturally higher in the early morning hours, especially in the early weeks. If your supply is more established and your baby is sleeping longer stretches, your first pump sessions of the day can also be higher as a result. If your schedule allows, leaning into morning pumps can be a smart strategy. Evening sessions can be shorter without affecting your overall output. No changes needed here, just good information to have.'
);

-- ── TEMPLATE 3: sessions_too_long_for_output_curve ────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'sessions_too_long_for_output_curve', 'early_postpartum', 'early',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','unspecified'],
  ARRAY['mostly_nursing','weaning'],
  'In early weeks, slightly longer sessions can help establish supply, but past 25 minutes most output has already been collected. Risk of burnout and nipple irritation.',
  ARRAY['Recommend 20-25 minute sessions','Suggest adding sessions instead of extending','Validate that burnout is real'],
  ARRAY['you are doing it wrong','you must pump for exactly','NICU moms do not apply'],
  'Warm, practical, encouraging', 'informational', 'light',
  'I noticed your sessions are running closer to 30 minutes. In the early weeks, slightly longer sessions can help establish supply, but past 25 minutes you are usually getting diminishing returns and risking burnout or nipple irritation. Most of your output is happening in the first 10-15 minutes anyway. Try sticking around 20-25 minutes and see how it feels. If you need more total milk, adding a session usually beats extending the ones you have.'
),
(
  'sessions_too_long_for_output_curve', 'established', 'established',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','unspecified'],
  ARRAY['mostly_nursing','weaning'],
  'At 12+ weeks, most milk is collected in the first 10-15 minutes. Longer sessions rarely add meaningful output and contribute to burnout.',
  ARRAY['Note that most output happens in first 10-15 minutes','Suggest 20-minute trial','Recommend adding sessions over extending','Validate burnout'],
  ARRAY['you are doing it wrong','you must pump for exactly'],
  'Warm, practical, encouraging', 'informational', 'light',
  'You are averaging 30-plus minute sessions. Most moms get the majority of their output in the first 10-15 minutes, so longer sessions often are not as impactful as you might think. If you are feeling burned out, try shortening to 20 minutes per session for a few days and see how your totals compare. If you need more milk, adding a session usually beats extending the ones you are already doing. The body sometimes needs a break :)'
);

-- ── TEMPLATE 4: output_trending_up ────────────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'output_trending_up', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','mostly_nursing','unspecified'],
  ARRAY[]::text[],
  'User has seen meaningful improvement in 7-day rolling average. This is worth celebrating and encouraging.',
  ARRAY['Celebrate the win genuinely','Invite her to reflect on what changed','Encourage her to keep going'],
  ARRAY['transactional','selling','promise the trend will continue','compare to other moms'],
  'Warm, genuinely encouraging, celebratory', 'celebratory', 'none',
  'Good news -- your 7-day average is up 12% from the week before. We do not always notice improvements session to session, but I hope you feel encouraged and proud. Whatever you are doing, keep going. If you can pinpoint what changed -- maybe you added a session, had better hydration, or experienced less stress -- those are things worth noting. Pumping is hard, often invisible work. Celebrate this win!'
);

-- ── TEMPLATE 5: stable_output_plateau ────────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'stable_output_plateau', 'exclusive_pumping_early', 'early',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Exclusive pumper in early weeks with plateau. Supply is still being established; plateaus warrant watching.',
  ARRAY['Note plateau is worth watching in early weeks','Suggest evaluating one variable at a time','Offer IBCLC support'],
  ARRAY['alarmed','galactagogues','supplements'],
  'Warm, reassuring, gently curious', 'informational', 'moderate',
  'It looks like your supply has been holding steady for a few weeks. In these early months of exclusive pumping, a plateau is worth watching since this is when supply is being established. If your supply is where you want it to be, awesome. If it is not quite what you would expect for this stage, it might be helpful to watch things closely. The basics are usually a good place to start: are your sessions frequent enough, is your flange the right fit, are your pump settings working for you? Pick one to evaluate this week. If you are hoping to push higher, working with an IBCLC who can see your specific situation is probably worth it.'
),
(
  'stable_output_plateau', 'exclusive_pumping_established', 'established',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Exclusive pumper at 12+ weeks with plateau. Body may have reached its natural capacity; that is often the goal.',
  ARRAY['Reframe plateau as possibly reaching capacity','Normalize steady supply as the goal','Suggest one variable to experiment with if she wants more'],
  ARRAY['alarmed','galactagogues','supplements'],
  'Warm, reassuring, gently curious', 'informational', 'moderate',
  'Your output has held steady for about three weeks. At a certain point, we will not see it keep increasing and the goal becomes maintaining what you have. Many bodies settle into a consistent supply once things are established. If your current output meets your baby needs, this is exactly what you want. If you are hoping for more, this is a good moment to look at one variable: session consistency, flange fit, or pump settings. Pick one to experiment with and reach out to an IBCLC if you need help.'
),
(
  'stable_output_plateau', 'equal_pumping_nursing_any', 'any',
  ARRAY['equal_pumping_nursing'], ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Mom pumping and nursing equally. Pump output does not reflect full supply -- nursing transfer is not tracked.',
  ARRAY['Contextualize that pump output is not full supply picture','Redirect to baby cues and diaper output','Normalize steady numbers for this context'],
  ARRAY['alarmed','galactagogues','supplements'],
  'Warm, reassuring, gently curious', 'informational', 'moderate',
  'Your pump output has been holding steady for about three weeks. Something worth keeping in mind: this is just your pump output, not your full supply, since we cannot really track how much your baby is transferring during nursing sessions. Steady pump numbers often mean your body has found its natural pattern with the nursing and pumping combo. If you are worried about overall supply, look at baby diaper output, weight gain, and feeding behavior. Those tell you more than pump output does in your situation.'
),
(
  'stable_output_plateau', 'work_pumping_any', 'any',
  ARRAY['work_pumping'], ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Work pumper with plateau. Steady numbers likely mean consistent work routine -- a good sign.',
  ARRAY['Reframe stability as routine success','Offer options if she wants more','Validate that meeting baby needs is the goal'],
  ARRAY['alarmed','galactagogues','supplements'],
  'Warm, reassuring, gently curious', 'informational', 'light',
  'Your work-day pump output has held steady for about three weeks. That usually means your work routine is consistent and your body has settled into it, which is the goal. If you want more output to stretch your daycare bottles further, typically the best options are adding a session, slightly extending one, or revisiting pump settings. But if you are meeting baby needs, no need to change anything.'
),
(
  'stable_output_plateau', 'supply_building_any', 'any',
  ARRAY['supply_building'], ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Mom building supply with plateau. This can be discouraging but plateaus are normal; body has limits.',
  ARRAY['Normalize the plateau','List common causes','Offer IBCLC support','Celebrate consistency'],
  ARRAY['alarmed','galactagogues','supplements','your body cannot'],
  'Warm, reassuring, gently curious', 'informational', 'moderate',
  'Your output has held steady for about three weeks. Plateaus during supply building can be discouraging, but they can be very normal. Our bodies are not designed to make infinite amounts of milk. This could be your body reaching its current capacity, the added pumps not being quite enough signal, or factors like sleep, hydration, or stress capping progress. If you are concerned, this is a really good moment to work with an IBCLC who can look at your specific situation. If not, way to go!'
);

-- ── TEMPLATE 6: weekend_output_dip ───────────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'weekend_output_dip', 'exclusive_pumping', 'any',
  ARRAY['exclusive_pumping'], ARRAY['equal_pumping_nursing','mostly_nursing','weaning','triple_feeding'],
  'Exclusive pumper with consistent weekend dip. Almost always schedule-related: later wake-ups, longer gaps, less routine.',
  ARRAY['Normalize that this pattern is common','Connect dip to schedule changes','Suggest anchor sessions','Validate that weekends are for being human'],
  ARRAY['shame about wanting rest','you must pump on weekends','rigid schedule required'],
  'Warm, validating', 'informational', 'light',
  'I noticed your weekend output is about 18% lower than weekdays. This is actually one of the most common patterns I see, and it almost always comes down to schedule. Weekends usually mean later wake-ups, longer gaps, and less routine. Your body responds to consistency. If you want to even things out, try keeping a minimum pump schedule on weekends, even just one or two anchor sessions. But weekends are also for being human and connecting with your baby, so do not stress too much. Stress is one of the biggest factors that can affect supply!'
),
(
  'weekend_output_dip', 'work_pumping', 'any',
  ARRAY['work_pumping'], ARRAY['equal_pumping_nursing','mostly_nursing','weaning','triple_feeding'],
  'Work pumper with weekend dip. Likely nursing more and pumping less on weekends -- often intentional.',
  ARRAY['Validate that nursing more on weekends is intentional and fine','Suggest optional anchor sessions if building stash','Affirm enjoyment of nursing baby on weekends'],
  ARRAY['shame about nursing on weekends','you must pump on weekends'],
  'Warm, validating', 'informational', 'light',
  'I noticed your weekend pump output runs about 18% lower than weekdays. For work pumpers, this usually means you are nursing more and pumping less on weekends, which is totally fine. But if you are trying to get ahead of weekday pumping, you may want to pump when you can. Even one or two anchor sessions can help. If you are happy with how things are going, no need to add more pumping if you are enjoying nursing your baby on weekends.'
),
(
  'weekend_output_dip', 'supply_building', 'any',
  ARRAY['supply_building'], ARRAY['equal_pumping_nursing','mostly_nursing','weaning','triple_feeding'],
  'Supply builder with weekend dip. Bonus pump sessions tend to get skipped on weekends, which slows progress.',
  ARRAY['Explain that missed bonus pumps slow building but do not undo progress','Suggest protecting one or two weekend pumps'],
  ARRAY['shame','you must pump on weekends','your supply is failing'],
  'Warm, validating', 'informational', 'light',
  'I noticed your weekend pump output runs about 18% lower than weekdays. Since you are adding pumps to build supply, weekends are usually when those bonus sessions get skipped. It is not undoing your work, but it may slow your building progress. If you can fit in even one or two extra pumps on weekends, you may see faster and more consistent results.'
);

-- ── TEMPLATE 7: first_week_encouragement ─────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'first_week_encouragement', 'primary_pumping', 'early',
  ARRAY['exclusive_pumping','equal_pumping_nursing','supply_building','triple_feeding'],
  ARRAY['weaning'],
  'First week postpartum with primary pumping. Output is low and inconsistent by design. Frequency matters more than volume right now.',
  ARRAY['Offer congratulations','Normalize low inconsistent output','Encourage 8 sessions per 24 hours as a guide','Validate the overwhelm','Invite IBCLC support'],
  ARRAY['compare to normal output','alarm about volume','recommend formula unless asked','supplements'],
  'Warm, deeply reassuring, encouraging', 'celebratory', 'moderate',
  'Congratulations on your sweet baby. I hope you are adjusting okay. Trust me, I know how those early days can feel. If you are incorporating pumping, that can feel like a lot on top of everything else. The first week is its own world, and I want you to know that the numbers right now can feel confusing and overwhelming. Output is typically low and inconsistent and that is exactly what we would expect. What matters most this week is frequency, not volume. Aim for around 8 sessions per 24 hours if you can, though some moms need more and some need less. Your body is doing massive work behind the scenes. Trust the process and reach out if you need support.'
),
(
  'first_week_encouragement', 'occasional_pumping', 'early',
  ARRAY['work_pumping','mostly_nursing','unspecified'],
  ARRAY['weaning'],
  'First week postpartum with occasional or work pumping. Nursing is primary; pumping not necessarily needed for supply in early days.',
  ARRAY['Offer congratulations','Normalize low inconsistent output','Encourage rest and nursing first','Note pumping may not be necessary yet','Invite IBCLC support'],
  ARRAY['compare to normal output','alarm about volume','recommend formula unless asked','supplements'],
  'Warm, deeply reassuring, encouraging', 'celebratory', 'moderate',
  'Congratulations on your sweet baby. I hope you are adjusting okay. Trust me, I know how those early days can feel. If you are adding pumping into the mix, that can feel like a lot. The first week is its own world and output is typically low and inconsistent in these early days, which is completely normal. Do not put pressure on the numbers right now. Focus on nursing and rest, and pump if you need to. In many situations, pumping is not necessary for supply in those early days, but always work with a lactation consultant for your specific situation. Your body is doing massive work behind the scenes. Trust the process and connect with a lactation consultant if you need support.'
);

-- ── TEMPLATE 8: approaching_drop_window ──────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'approaching_drop_window', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','supply_building'],
  ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Baby approaching 8-10, 12-14, or 24-26 week mark. Common supply regulation windows. Supply may dip temporarily as it transitions from prolactin-driven to supply-and-demand.',
  ARRAY['Give heads up about the window','Normalize that dip is not certain','Note that recovery usually happens within 1-2 weeks of consistent pumping'],
  ARRAY['dread','promise supply will not dip','supplements'],
  'Warm, prepares without alarming', 'informational', 'light',
  'Just giving you a little heads up -- your baby is coming up on the 12-week mark, which is a common time moms notice a change in their supply. This is actually a normal transition: your supply is moving from being driven mostly by prolactin to being driven by supply and demand. If your body does not think you need all the milk you were producing, it levels off. Some moms see a dip, some do not. If yours dips and it worries you, it usually recovers within a week or two of consistent pumping. Just wanted you to know so you are prepared!'
),
(
  'approaching_drop_window', 'work_pumping_12week', 'any',
  ARRAY['work_pumping'],
  ARRAY['mostly_nursing','weaning','triple_feeding'],
  'Work pumper approaching the 12-week mark, which often coincides with returning to work. Double adjustment: supply regulation + new work pumping routine.',
  ARRAY['Mention two simultaneous transitions','Normalize work-related adjustment period of 2-3 weeks','Recommend consistency','Offer IBCLC support if dip is drastic'],
  ARRAY['dread','promise supply will not dip','supplements'],
  'Warm, prepares without alarming', 'informational', 'light',
  'It looks like your baby is coming up on the 12-week mark. Two things often happen around this time that I want you to be aware of: supply transitions from prolactin-driven to supply-and-demand, and many moms are returning to work around this time too. Both can cause what seems like a dip. The work transition specifically takes 2-3 weeks for most bodies to settle into. If your output drops during the adjustment, that is usually expected. Consistency is what gets it back. If you notice anything too drastic, reach out for lactation support.'
);

-- ── TEMPLATE 9: high_schedule_variability ────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'high_schedule_variability', 'exclusive_pumping_early', 'early',
  ARRAY['exclusive_pumping'], ARRAY['equal_pumping_nursing','work_pumping','mostly_nursing','weaning'],
  'Exclusive pumper in early weeks with highly variable schedule. Consistency helps the body establish baseline production.',
  ARRAY['Point out variability gently','Encourage flexible but consistent schedule','Validate newborn overwhelm'],
  ARRAY['you are doing it wrong','rigid schedule required','shame'],
  'Warm, validating, never punitive', 'informational', 'moderate',
  'It looks like your pumping routine has some variability. Some days you have 5 sessions, other days 8, and there are some larger gaps in between. In these early weeks of exclusive pumping, your body is still figuring out how much to make, and consistency helps that signal come through. A flexible but consistent schedule helps more than no schedule. Newborn life can be a lot. Keep doing your best.'
),
(
  'high_schedule_variability', 'exclusive_pumping_established', 'established',
  ARRAY['exclusive_pumping'], ARRAY['equal_pumping_nursing','work_pumping','mostly_nursing','weaning'],
  'Established exclusive pumper with variable schedule. More flexibility at this stage but consistent removal still matters.',
  ARRAY['Note that variability may explain unpredictable output','Suggest aiming for same number of sessions per day','Acknowledge that if supply feels stable it may not matter'],
  ARRAY['you are doing it wrong','rigid schedule required','shame'],
  'Warm, validating, never punitive', 'informational', 'moderate',
  'I noticed your pumping schedule varies quite a bit day to day. At this stage your body has more flexibility, but consistent removal still drives consistent output. If you have felt like your output is unpredictable lately, this could be part of it. Even just aiming for the same number of sessions each day at roughly similar times can smooth things out. But if things still seem stable, feel free to disregard.'
),
(
  'high_schedule_variability', 'supply_building_any', 'any',
  ARRAY['supply_building'], ARRAY['equal_pumping_nursing','work_pumping','mostly_nursing','weaning'],
  'Supply builder with inconsistent bonus pump sessions. Irregular pumps still help but consistent signals build faster.',
  ARRAY['Validate that inconsistent pumps still help','Explain why consistency accelerates progress','Suggest protecting 2-3 specific time slots'],
  ARRAY['you are doing it wrong','shame'],
  'Warm, validating, never punitive', 'informational', 'moderate',
  'I noticed your extra pump sessions have been pretty inconsistent. Inconsistent pumps are still helpful, but the body builds supply most reliably from steady, predictable signals. If you can pick two or three time slots that you protect most days, you will see more progress than the same total number of pumps spread randomly.'
),
(
  'high_schedule_variability', 'triple_feeding_any', 'any',
  ARRAY['triple_feeding'], ARRAY['equal_pumping_nursing','work_pumping','mostly_nursing','weaning'],
  'Triple feeder with variable schedule. Variability almost always signals hitting the wall. Sustainability matters more than perfect schedule.',
  ARRAY['Validate hitting the wall','Acknowledge that triple feeding cannot continue indefinitely','Strongly encourage IBCLC support for sustainable plan'],
  ARRAY['you should be more consistent','shame','rigid schedule required'],
  'Warm, compassionate, deeply validating', 'mild', 'strong',
  'I noticed your schedule has been a bit variable lately. With triple feeding, that almost always means you are hitting the wall, and that is understandable because triple feeding is really tough. The variability is not really the issue -- the underlying intensity is. This is a moment where an IBCLC who can help you find a sustainable path forward matters way more than trying to be more consistent. You should not have to be stuck in this pattern forever.'
);

-- ── TEMPLATE 10: declining_output_trend ──────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'declining_output_trend', 'exclusive_pumping_early', 'early',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning'],
  'Exclusive pumper in early weeks with downward trend. Most common causes are temporary. Clinical eyes matter at this stage.',
  ARRAY['Name the trend clearly','List common temporary causes','Strongly encourage IBCLC outreach','Encourage consistent sessions and pump part checks'],
  ARRAY['supply is failing','supplements','medications','diagnose'],
  'Warm, attentive, clear about IBCLC support', 'needs_attention', 'strong',
  'I am noticing your output has been trending down over the last few days, around a 12% decrease. In these early weeks of exclusive pumping, this is something worth watching. The most common causes are temporary: stress, illness, a missed session, hormonal shifts, or sometimes a pump or flange issue. Often it recovers quickly. But this is a moment where eyes that know your situation matter more than an app. If you have access to an IBCLC, this is a great time to reach out. In the meantime, focus on consistent sessions and check the basics, like changing pump parts if needed.'
),
(
  'declining_output_trend', 'exclusive_pumping_established', 'established',
  ARRAY['exclusive_pumping'], ARRAY['mostly_nursing','weaning'],
  'Established exclusive pumper with downward trend. Most causes are life-related and recover with routine.',
  ARRAY['Name the trend','List common causes','Encourage return to normal routine','Recommend IBCLC if continues'],
  ARRAY['supply is failing','supplements','medications','diagnose'],
  'Warm, attentive, clear about IBCLC support', 'needs_attention', 'strong',
  'I am seeing your output trend down over the last few days, about a 12% decrease. At this stage, common causes include a returning period, illness, stress, schedule changes, or just being overwhelmed with life. Most of the time it bounces back within a week of getting back to your normal routine. Try to get back on a regular schedule as soon as you are able to. If it continues or you are worried, working with an IBCLC who can look at your specific situation is the best move. They will catch things an app cannot.'
),
(
  'declining_output_trend', 'equal_pumping_nursing_any', 'any',
  ARRAY['equal_pumping_nursing'], ARRAY['mostly_nursing','weaning'],
  'Mom pumping and nursing equally. Pump output drop may reflect increased nursing, not actual supply drop.',
  ARRAY['Contextualize that pump output is not full picture when nursing','Redirect to baby cues','Note when IBCLC is warranted'],
  ARRAY['supply is failing','supplements','medications','diagnose'],
  'Warm, attentive, clear about IBCLC support', 'needs_attention', 'moderate',
  'I am noticing your pump output has trended down over the last few days. Something worth considering: pump output is not always a perfect signal of overall supply when you are nursing too. Baby may just be nursing more right now, and when that happens, we would not expect as much output. But if baby diaper output, weight, or feeding behavior has changed, or if you are concerned for any reason, that is a sign to work with an IBCLC.'
),
(
  'declining_output_trend', 'work_pumping_any', 'any',
  ARRAY['work_pumping'], ARRAY['mostly_nursing','weaning'],
  'Work pumper with downward trend. Stress and schedule disruption are common culprits.',
  ARRAY['Name common work-pumping causes','Encourage routine recovery','Recommend IBCLC if persistent'],
  ARRAY['supply is failing','supplements','medications','diagnose'],
  'Warm, attentive, clear about IBCLC support', 'needs_attention', 'strong',
  'I am noticing your work-day pump output trending down over the last few days, around a 12% decrease. Common causes for work pumpers include a stressful week, missed sessions, getting a period back, illness, or hydration. Most of the time it recovers within a week of getting back to your normal routine. If it continues or you are worried, working with an IBCLC is the move.'
),
(
  'declining_output_trend', 'supply_building_any', 'any',
  ARRAY['supply_building'], ARRAY['mostly_nursing','weaning'],
  'Supply builder with downward trend. Especially discouraging given the effort involved. Outside factors often to blame.',
  ARRAY['Acknowledge the discouragement','List common causes','Encourage patience for outside factors to resolve','Recommend IBCLC if persistent'],
  ARRAY['supply is failing','supplements','medications','diagnose','your body cannot'],
  'Warm, attentive, clear about IBCLC support', 'needs_attention', 'strong',
  'I am noticing your output trending down over the last few days. When you are working to build your supply, this can be especially discouraging because you are so focused on upward progress. The causes are usually: stress, illness, a period, schedule disruption, hydration. Usually we will see continued progress once outside factors are resolved. But if you are putting in a lot of effort and still seeing a decrease, getting an IBCLC to look at your specific situation is genuinely worth it.'
),
(
  'declining_output_trend', 'triple_feeding_any', 'any',
  ARRAY['triple_feeding'], ARRAY['mostly_nursing','weaning'],
  'Triple feeder with downward trend. May signal hitting physical and emotional limit. IBCLC support is urgent.',
  ARRAY['Validate the intensity','Note drop may mean she is hitting her limit','Strongly encourage IBCLC'],
  ARRAY['supply is failing','supplements','medications','diagnose','pump harder'],
  'Warm, compassionate, urgent about IBCLC', 'needs_attention', 'strong',
  'I am noticing your output trending down over the last few days. Triple feeding is A LOT, and a drop in output might mean you are hitting your limit. This is a moment where an IBCLC matters more than the data. They can help you figure out whether what you are doing is sustainable, what is working, and what is worth changing. Please do not try to push through this alone if you can avoid it.'
);

-- ── TEMPLATE 11: new_user_first_session_encouragement ────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'new_user_first_session_encouragement', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','mostly_nursing','unspecified'],
  ARRAY[]::text[],
  'New user who has logged 0-2 sessions. App gets more useful with more data. Low-pressure encouragement to log consistently.',
  ARRAY['Explain that app gets more useful with more sessions','Suggest logging even quickly','Note that casual tracking is also fine'],
  ARRAY[]::text[],
  'Warm, low-pressure, friendly', 'informational', 'none',
  'Just a heads up -- Pump Coach gets way more useful once you have logged a handful of sessions. Even quick logs, just time and output, are enough for the patterns to start showing up. If logging in the moment is hard, you can set reminders or batch-log later in the day. Or if you are just using this for casual tracking, that is great too. No pressure :)'
);

-- ── TEMPLATE 12: approaching_milestone ───────────────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'approaching_milestone', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','mostly_nursing','unspecified'],
  ARRAY[]::text[],
  'User approaching a significant milestone: 100 oz, 500 oz, 1 month, 3 months, 6 months, 1 year. Worth acknowledging the invisible work.',
  ARRAY['Celebrate genuinely','Acknowledge the invisible effort behind the number','Encourage continuing without pressure'],
  ARRAY['obligated to keep going','upgrade','compare to other moms'],
  'Warm, celebratory, personal, joyful', 'celebratory', 'none',
  'Did I just see you are about to cross 500 oz pumped? Um, you are a total rock star! You may not always see the day to day successes, but behind that number is hundreds of sessions, missed sleep, awkward setups, and a body working super hard. Whatever your goal is, you should be so proud of yourself. You keep showing up, even when it is hard. Go get yourself a bowl of ice cream to celebrate!'
);

-- ── TEMPLATE 13: pump_parts_replacement_reminder ─────────

INSERT INTO insight_templates (pattern_name, context_variant, postpartum_stage, applicable_contexts, skip_for_contexts, clinical_context, acceptable_actions, forbidden_phrases, tone, severity, professional_deference, example_output) VALUES
(
  'pump_parts_replacement_reminder', 'general', 'any',
  ARRAY['exclusive_pumping','equal_pumping_nursing','work_pumping','supply_building','triple_feeding','unspecified'],
  ARRAY['mostly_nursing','weaning'],
  'User has been pumping for 60-90 days. Membranes and valves typically need replacing every 4-8 weeks; other parts every few months. Worn parts are a common cause of output drops.',
  ARRAY['Remind about replacement timelines','Connect worn parts to potential output changes','Keep it practical and low-pressure'],
  ARRAY[]::text[],
  'Helpful, practical, low-pressure', 'informational', 'none',
  'Quick reminder -- pump parts wear out faster than most people realize. Membranes and valves typically need replacing every 4-8 weeks with regular use, and other parts every few months. Worn parts are one of the most common reasons for a sudden drop in output. If your output seems stable, you might be able to get a little more life out of them. But if things have changed, it might be time to check when you last replaced them.'
);

-- ============================================================
-- SEED: notifications_content (28 rows)
-- ============================================================

INSERT INTO notifications_content (category, body) VALUES

-- Affirmations (9)
('affirmation', 'In case no one told you today, you are doing something important, even when it is hard. It matters more than you know.'),
('affirmation', 'Every session counts, even the short ones and the hard ones.'),
('affirmation', 'Your rest matters too. Do not forget to take care of yourself.'),
('affirmation', 'There is no perfect pumping journey. Focus on what you are able to do, not what you see on social media.'),
('affirmation', 'Some days are harder than others. It is okay to want a break.'),
('affirmation', 'You may not love every second of pumping. That is completely normal and it does not make you any less of an amazing mom.'),
('affirmation', 'Pumping is invisible work. We see it even when no one else does.'),
('affirmation', 'Your best looks different every day. Always remember that.'),
('affirmation', 'You are doing better than you think you are.'),

-- Milestone Acknowledgments (10)
('milestone', 'You have logged sessions for 7 days in a row. Keep up the consistency!'),
('milestone', 'Two weeks in. The early days are often the hardest and you are through them.'),
('milestone', 'You just crossed 100 oz pumped. That is a lot of work and a lot of love.'),
('milestone', 'One month of pumping. That is an accomplishment that should not go unnoticed.'),
('milestone', 'You are halfway to your stash goal. Keep going!'),
('milestone', 'Three months postpartum. Your supply is more established than it has ever been.'),
('milestone', 'Six months. Whatever comes next, you have given your baby something really meaningful.'),
('milestone', 'You logged a session today. Small things done consistently are how big things happen.'),
('milestone', 'Your output this week is up from last week. Your hard work is paying off.'),
('milestone', 'You have been at this for a while now. That is a lot of days of showing up for your baby.'),

-- Gentle Presence Check-ins (9)
('check_in', 'Good morning. Whatever today brings, you have got this.'),
('check_in', 'Pump Coach is here whenever you need it. No pressure, just support.'),
('check_in', 'How are you doing today? Not your output, you.'),
('check_in', 'The hard days are part of it too. You do not have to have it figured out.'),
('check_in', 'I am rooting for you, even on the days you do not feel it.'),
('check_in', 'You are doing more than enough.'),
('check_in', 'Some seasons of pumping are easier than others. Wherever you are, keep going.'),
('check_in', 'A gentle reminder that your worth as a mom has nothing to do with your output numbers.'),
('check_in', 'You built something today. Even if it does not feel like it.');
