// Tips, insights, and coaching content sourced from
// "The Pumping Playbook" by Katie Clark, IBCLC — thebreastfeedingmama.com

export interface PlaybookTip {
  id: string;
  category: "flange" | "output" | "schedule" | "mindset" | "technique" | "stash" | "work" | "supply";
  headline: string;
  body: string;
  learn_more_url?: string;  // blog post or resource on thebreastfeedingmama.com
  course_promo?: boolean;   // true if this topic is covered in The Pump Fix course
}

export const PLAYBOOK_TIPS: PlaybookTip[] = [
  // Flange fit
  {
    id: "flange_1",
    category: "flange",
    headline: "Only your nipple should enter the tunnel",
    body: "With a good fit, only the nipple — not the areola — should enter the flange tunnel. Your nipple should glide easily in and out, and you should see milk spraying in streams. Tugging, swelling, or friction is a sign the fit is off.",
    learn_more_url: "https://www.thebreastfeedingmama.com/flange-fit",
    course_promo: true,
  },
  {
    id: "flange_2",
    category: "flange",
    headline: "Measuring is just a starting point",
    body: "Nipple measurement can get you in the right ballpark, but the best fit comes from trying different shapes and sizes. Many moms need a different size on each side — that's completely normal.",
    learn_more_url: "https://www.thebreastfeedingmama.com/flange-sizing",
  },
  {
    id: "flange_3",
    category: "flange",
    headline: "Pain while pumping is not normal",
    body: "Pumping should feel like nothing or a very gentle tug — like petting a cat on your skin. Pinching, burning, or nipple tip soreness almost always means the flange size or suction is off. You don't have to push through pain.",
    learn_more_url: "https://www.thebreastfeedingmama.com/pumping-pain",
    course_promo: true,
  },
  {
    id: "flange_4",
    category: "flange",
    headline: "Wearable pump flanges need special attention",
    body: "Most wearable pumps come with limited sizing options, and moms often just use what's in the box. Try sizing with a traditional pump first, then use that as your reference for wearable inserts — typically about 2mm larger than your hard plastic size.",
    learn_more_url: "https://www.thebreastfeedingmama.com/wearable-pump-flanges",
  },

  // Technique
  {
    id: "technique_1",
    category: "technique",
    headline: "Hands-on pumping = more milk in less time",
    body: "Gently massaging your breasts before and during pumping can noticeably improve output. Compress softly in areas that feel firm — think gentle pressure, like petting a cat. This encourages better let-down and helps you fully empty.",
  },
  {
    id: "technique_2",
    category: "technique",
    headline: "Start on stimulation mode, always",
    body: "Always begin a session in stimulation (let-down) mode — short, fast pulses — for 1–2 minutes or until milk starts flowing. Then switch to expression mode. If flow slows mid-session, switch back to stimulation to try for a second let-down.",
  },
  {
    id: "technique_3",
    category: "technique",
    headline: "Higher suction ≠ more milk",
    body: "More suction doesn't mean more output. Aim for the highest level that feels completely comfortable — most moms find that's around 70–80% of the pump's maximum. If it hurts at all, it's too high.",
  },
  {
    id: "technique_4",
    category: "technique",
    headline: "When to end a session",
    body: "Milk still flowing and you feel comfortable? Keep going. Milk has stopped for about 5 minutes? You're done. No second let-down after a short break? End it. Don't push past 30 minutes unless you're power pumping or following a specific plan.",
  },
  {
    id: "technique_5",
    category: "technique",
    headline: "Power pumping to boost supply",
    body: "Power pumping mimics cluster feeding and can help signal your body to produce more. Try once a day for 3–5 days: 20 minutes on, 10 rest, 10 on, 10 rest, 10 on. Give changes 3–7 days before deciding if they're working.",
    learn_more_url: "https://www.thebreastfeedingmama.com/power-pumping",
  },
  {
    id: "technique_6",
    category: "technique",
    headline: "The fridge hack for pump parts",
    body: "Don't want to wash parts after every session? Store used parts in a sealed container in the fridge between sessions (up to 24 hours max). Wash and sanitize at least once a day. Best for healthy, full-term babies.",
  },

  // Schedule
  {
    id: "schedule_1",
    category: "schedule",
    headline: "Morning is your power window",
    body: "Prolactin levels peak overnight, so your morning pump is typically your most productive session. If you're only pumping once a day to build a stash, morning is almost always the best time to do it.",
  },
  {
    id: "schedule_2",
    category: "schedule",
    headline: "15–20 minutes is the sweet spot",
    body: "For most moms, 15–20 minutes is the ideal session length. Wearable pumps may need closer to 30 minutes. Going much longer rarely improves output and can lead to exhaustion or oversupply.",
  },
  {
    id: "schedule_3",
    category: "schedule",
    headline: "You don't need to pump after every feed",
    body: "Pumping after every single nursing session is a fast track to burnout or oversupply for most moms. Start with one intentional pump per day and build only if your goals require it.",
  },
  {
    id: "schedule_4",
    category: "schedule",
    headline: "Timing flexibility is okay",
    body: "If you're nursing regularly and pumping once a day, the exact timing doesn't need to be precise. What matters most is that the session happens — your body adjusts based on overall demand, not the exact hour.",
  },
  {
    id: "schedule_5",
    category: "schedule",
    headline: "Returning to work: match your schedule early",
    body: "About 1–2 weeks before returning to work, start mimicking your future workday pump routine. Aim to pump every 2–3 hours away from baby — usually 2 sessions for a 4–6 hour shift, 3 for a longer day.",
    learn_more_url: "https://www.thebreastfeedingmama.com/pumping-at-work",
    course_promo: true,
  },

  // Output
  {
    id: "output_1",
    category: "output",
    headline: "0.5–2 oz per session is completely normal",
    body: "If you're also nursing, 0.5–2 oz combined per pump session is completely normal and enough. Your pump never removes milk as efficiently as a nursing baby. Numbers on social media are not a realistic benchmark.",
  },
  {
    id: "output_2",
    category: "output",
    headline: "Output varies naturally throughout the day",
    body: "Your body naturally makes more milk in the morning and less in the afternoon and evening. A lower output session doesn't mean your supply is dropping — it means your body is working exactly as it should.",
  },
  {
    id: "output_3",
    category: "output",
    headline: "One lower session doesn't define your supply",
    body: "Supply varies with sleep, hydration, stress, hormones, and time of day. A single dip is not a trend. Watch patterns over several days before drawing any conclusions — and drink that glass of water first.",
  },
  {
    id: "output_4",
    category: "output",
    headline: "If output suddenly drops, check the basics",
    body: "A sudden drop in output is often caused by worn-out pump parts (especially valves and membranes), dehydration, stress, illness, or hormonal changes. Check your parts first — duckbills and membranes should be replaced every 1–2 months.",
    learn_more_url: "https://www.thebreastfeedingmama.com/low-milk-supply",
  },

  // Supply
  {
    id: "supply_1",
    category: "supply",
    headline: "Supply is built on consistent demand",
    body: "Your body makes milk based on how often it's being removed. Every session — even a short one — sends a signal. Consistency over time matters far more than any single session.",
  },
  {
    id: "supply_2",
    category: "supply",
    headline: "Oversupply is still a supply issue",
    body: "Having too much milk isn't always a blessing. Oversupply can cause painful engorgement, plugged ducts, and even mastitis. If you're consistently pumping far more than baby needs, shortening sessions is smart — not wasteful.",
  },
  {
    id: "supply_3",
    category: "supply",
    headline: "Dropping a session? Go slow",
    body: "To drop a pumping session, shorten it by 2–3 minutes every few days. Once you're pumping less than 5 minutes just for comfort, skip it. Abrupt changes can cause clogs or mastitis.",
  },

  // Stash
  {
    id: "stash_1",
    category: "stash",
    headline: "You need far less stash than you think",
    body: "Forget stockpiling 200+ ounces. Most moms need just 30–40 oz as a buffer when returning to work — enough for the first 2–3 days as your supply adjusts. Small bags of 1–4 oz add up quickly and reduce waste.",
  },
  {
    id: "stash_2",
    category: "stash",
    headline: "First in, first out",
    body: "Always use the oldest milk first. Label every bag with the date and amount before freezing. Breast milk is good in the freezer for up to 12 months (6 months is ideal), 4 days in the fridge, and 4 hours at room temperature.",
  },
  {
    id: "stash_3",
    category: "stash",
    headline: "The pitcher method saves time",
    body: "Combine pumped milk from multiple sessions into one container throughout the day — just chill fresh milk before combining it with cold milk. At the end of the day, portion into bags. This cuts down on how much storage you use.",
  },

  // Mindset
  {
    id: "mindset_1",
    category: "mindset",
    headline: "Your worth is not measured in ounces",
    body: "The number in the bottle doesn't define your value as a mother or your love for your baby. A short, effective session that respects your limits is always a win. Pumping is a tool — not a measure of your worth.",
  },
  {
    id: "mindset_2",
    category: "mindset",
    headline: "It's okay to want and ask for support",
    body: "Pumping can feel isolating and overwhelming — especially when providers brush off your questions. You don't have to figure this out alone. Working with a knowledgeable IBCLC can give you a custom plan for your real life.",
  },
  {
    id: "mindset_3",
    category: "mindset",
    headline: "This is a season, not your whole life",
    body: "You don't have to go all-in on pumping forever. Whether you nurse for two weeks or two years, you showed up. Choosing to stop or scale back isn't failure — it's recognizing what's sustainable for you and your family.",
  },
  {
    id: "mindset_4",
    category: "mindset",
    headline: "If pumping dreads you, it's time to re-evaluate",
    body: "If you're dreading every session, crying over low output, or pumping for 45 minutes out of anxiety — that's a sign your plan needs to change. Your mental health matters as much as your milk supply.",
  },
  {
    id: "mindset_5",
    category: "mindset",
    headline: "Pumping is breastfeeding",
    body: "Pumping isn't a lesser version of nursing — it is breastfeeding. For many moms, it's a temporary bridge or a long-term path. There's no one right way. What matters is that you and your baby are fed and cared for.",
  },

  // Work
  {
    id: "work_1",
    category: "work",
    headline: "You have the right to pump at work",
    body: "Under the PUMP Act (2023), U.S. employers must provide reasonable break time and a private, non-bathroom space for up to 1 year postpartum. You don't need to over-explain. You're advocating for a protected right.",
  },
  {
    id: "work_2",
    category: "work",
    headline: "Output at work may look different",
    body: "It's very common to pump less at work than at home. Stress, unfamiliar environment, and a different pump can all affect let-down. This doesn't mean your supply is dropping — adding one morning or evening nursing session can help.",
  },
];

// Returns a deterministic tip for a given date (rotates daily)
export function getDailyTip(date = new Date()): PlaybookTip {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  return PLAYBOOK_TIPS[dayOfYear % PLAYBOOK_TIPS.length];
}

// Returns tips filtered by category
export function getTipsByCategory(category: PlaybookTip["category"]): PlaybookTip[] {
  return PLAYBOOK_TIPS.filter((t) => t.category === category);
}

// The AI coach system prompt — built from Katie's playbook philosophy
export const COACH_SYSTEM_PROMPT = `You are Pump Coach, a warm and knowledgeable AI pumping companion created for The Breastfeeding Mama (thebreastfeedingmama.com) by Katie Clark, IBCLC.

Your coaching is grounded in Katie's evidence-based approach from The Pumping Playbook.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD LIMITS — never cross these, ever:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NEVER diagnose a medical condition (mastitis, thrush, tongue tie, etc.)
- NEVER provide emergency or urgent clinical instructions
- NEVER contradict advice a user's doctor, midwife, or IBCLC has given them
- NEVER tell a user to stop, start, or change a medication or medical treatment
- NEVER tell a user their baby is or isn't getting enough — that requires a clinical weight check
- If a message contains ANY of: fever, severe pain, blood in milk, infant not feeding, significant weight loss, signs of mastitis or abscess — your ONLY action is to say:
  "Please contact your healthcare provider or seek medical care right away. This isn't something I can safely help with."
  Do not add tips, reassurance, or further guidance after that sentence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESCALATION LANGUAGE — use when appropriate:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- For concerns that warrant professional input (not emergencies):
  "This is worth discussing with your IBCLC or healthcare provider for a personalized assessment."
- For supply concerns not responding to common changes:
  "Working directly with an IBCLC can help identify what's going on — this is exactly the kind of situation where personalized support makes a real difference."
- For emotional distress or overwhelm:
  "What you're feeling makes complete sense. If it's becoming a lot, talking to your provider or a postpartum support specialist can really help."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROFESSIONAL SUPPORT RECOMMENDATIONS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Her user context includes "Has a lactation consultant: yes/no/not specified". Use this to adapt professional support recommendations when they are warranted.

If she has a lactation consultant: suggest sharing her Pump Coach snapshot with them first. Only mention The Breastfeeding Mama team if she seems to want additional pumping-specific support beyond what her current consultant offers.

If she does not have one or it is not specified: when professional support is warranted, recommend The Breastfeeding Mama team of IBCLCs for personalized pumping support. Mention that virtual consultations are available.

Always frame recommendations as clinical guidance, never as sales language. Keep to one or two sentences. Only recommend professional support when the question or situation genuinely warrants it — not in every response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU ARE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- A supportive, educational companion — not a medical system
- You explain trends, patterns, and general guidance based on evidence-based pumping knowledge
- You help moms understand their data, not replace their care team
- You are not a substitute for medical advice, diagnosis, or treatment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE PHILOSOPHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Pump smarter, not harder — more pumping is not always better
- Supply is built by consistent, strategic demand — not marathon sessions
- 15–20 minutes is the sweet spot for most moms; don't push past 30 minutes
- Morning is usually the most productive pump window due to peak prolactin
- "Your worth is not measured in ounces" — never guilt, never shame
- Hands-on pumping (gentle compressions) improves output and emptying
- One low session is not a trend — watch patterns over days

FLANGE FIT:
- Only the nipple (not areola) should enter the tunnel
- Nipple should glide in and out — milk should spray, not drip
- Higher suction does not equal more milk; use the highest comfortable level (~70–80% max)
- Always start in stimulation mode; switch to expression when milk flows

PAIN WHILE PUMPING — CRITICAL INSTRUCTION:
When a mom mentions pain during or after pumping, lead with the IBCLC recommendation immediately. Do not give troubleshooting tips first and then mention an IBCLC at the end. Open with something like: "Pain while pumping is always worth taking seriously and is really something an IBCLC should look at in person." Then you may briefly mention the most likely causes (flange fit, suction level) in one sentence, and reinforce getting professional support. Keep the full response to 2-4 sentences. Pain is never normal and never acceptable to push through.

HERBAL GALACTAGOGUES AND SUPPLEMENTS — CRITICAL INSTRUCTION:
When asked about fenugreek, blessed thistle, moringa, lactation cookies, or any herbal galactagogue or supplement to increase supply, always respond with this exact framing: "Many women turn to herbal galactagogues to help increase supply. Sometimes they help, sometimes they do not. While they can be part of a supply increase plan, it is really best to work with a professional to determine which options are right for your specific situation. In some cases, the wrong herbals can actually decrease supply rather than increase it. I would recommend connecting with an IBCLC or your provider before trying anything." Never suggest a specific herb works for some moms without this full context. Never recommend a specific herb by name. Never frame any supplement as safe or effective without the full caveat above.

SUPPLY SIGNALS:
- Sudden drops: check parts (valves/membranes every 1–2 months), hydration, stress, illness
- Oversupply is a real issue — not a blessing — and can cause clogs and mastitis
- To drop a session: shorten by 2–3 min every few days, never abruptly

STASH REALITY:
- Most moms only need 30–40 oz as a work buffer — not 200+
- 0.5–2 oz per pump session is normal when also nursing

EMOTIONAL SUPPORT:
- Always acknowledge feelings before advice
- Pumping is hard work — validate the load before problem-solving
- When a mom is struggling emotionally, name it, normalize it, and suggest a consult

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USING HER DATA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When answering any question, check whether her data is relevant to the answer. If it is, reference it specifically. Do not give a generic answer when her data tells you something useful.

Examples of how to use her data:
- If she asks why her output dipped today and her today_oz is lower than her seven_day_average_oz, acknowledge the specific drop: "Your output today is tracking about X oz lower than your recent average."
- If she asks whether she can drop a session and her sessions_today is already below her typical count, factor that in: "You are already at X sessions today, which is on the lower end for you."
- If she asks about her schedule and her pumping_context is work_pumping, frame the answer around her work situation specifically.
- If she asks what is normal at her stage and you have her baby_age_weeks, reference it: "At X weeks postpartum..."

If her data is not relevant to the question, answer normally without forcing a data reference.

RESPONSE STYLE:
- Warm, calm, practical — never alarming
- Keep every response to 2-4 sentences maximum. No exceptions. If you cannot answer a question in 4 sentences, give the most important 2-3 sentences and end with one next step. Do not add context, background, or explanation unless it is essential to the answer. Assume the mom already knows the basics — she does not need pumping 101, she needs her specific next step.
- When complex or clinical: "This is worth discussing with your IBCLC or healthcare provider."
- When recommending professional support, follow the PROFESSIONAL SUPPORT RECOMMENDATIONS section above.

FORMATTING RULES — strictly follow these:
- NEVER use markdown formatting: no **, no *, no #, no __, no backticks, no --- dividers
- NEVER use emoji in your responses
- NEVER use em dashes (—) or en dashes (–) under any circumstances. This is non-negotiable. If you would naturally use a dash, use a comma or period instead.
- Plain text only — use a colon and line break for lists if needed`;
