# VocUp — Master Spec & Dashboard

> Single source of truth. UI=French. Code/IDs=English. Caveman-terse prose, code/data unchanged.

---

## 0 · PITCH
Gamified vocab web app. 4 langs (EN/DE/ES/IT). FR UI. **440 words/lang**. 10min sessions. Flashcards + quiz + ranks + coins + chests + cosmetics. Mobile-first, PWA, dark-only.

---

## 1 · STACK (locked)
| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Lang | TypeScript strict |
| Style | Tailwind + CSS vars |
| Anim | Framer Motion + GSAP (chest only) |
| State | Zustand + persist (IndexedDB) |
| Backend | Supabase (Postgres + Auth + Realtime + Storage + RLS) |
| Auth | Supabase: Google OAuth + email/pwd (verified required) |
| Sound | Howler.js |
| TTS | Web Speech API only (no MP3s) |
| Forms | react-hook-form + zod |
| Icons | Lucide + custom SVG (ranks/coins/chests) |
| Font | Inter |
| PWA | next-pwa |
| Test | Vitest + Playwright |
| Pkg | pnpm |
| Host | Vercel (subdomain) |
| Repo | GitHub public, trunk `main` + feature branches |

---

## 2 · STRUCTURE
```
vocup_site/
├── app/
│   ├── (auth)/{login,signup}
│   ├── (app)/
│   │   ├── home/                # 4 lang tiles
│   │   ├── [lang]/{lesson,quiz,quests,shop}
│   │   ├── profile/
│   │   └── leaderboard/
│   ├── api/                     # route handlers
│   └── layout.tsx
├── components/{ui,game,flashcard,chest,theme}
├── lib/
│   ├── supabase/                # client, server, types
│   ├── stores/                  # zustand per lang
│   ├── game/                    # rank, score, prob, quest, decay, daily
│   ├── data/                    # words.ts, ranks.ts, chests.ts, skins.ts
│   └── sync/                    # local↔remote merge
├── public/assets/{ranks,coins,chests,skins,themes,flames,categories,badges}
├── public/sounds/
└── supabase/migrations/
```

---

## 3 · DATA MODEL (Supabase)

```sql
-- auth.users (managed)

profiles (
  id uuid PK fk auth.users,
  handle text UNIQUE,            -- immutable, regex ^[a-z0-9_]{3,20}$
  display_name text,             -- editable
  photo_url text,                -- Storage; default null → random gradient
  showcase_lang text,            -- which lang rank to display on profile
  pinned_achievements text[],    -- up to 3
  active_session_id uuid,        -- single-session lock
  daily_login_streak int default 0,
  last_login_day date,
  created_at timestamptz
)

lang_state (                     -- one row per (user, lang)
  user_id uuid, lang text,
  xp int default 0,
  coins int default 100,         -- logged users get 100; guests get 0
  shards int default 0,          -- éclats from dupes
  unlock_tokens int default 0,
  rank_tier int default 0,       -- 0=unranked, 1=wood1 … 19=solar
  active_skin_id text,
  active_theme_id text,
  inventory_skins text[],
  inventory_themes text[],
  unlocked_subcats text[],       -- start: 4 BASIQUE subcat ids
  max_streak int default 0,
  total_cards int default 0,
  correct_cards int default 0,
  time_spent_s int default 0,
  active_boosters jsonb,         -- {coin:{mult,until},xp:{},luck:{},streak:{}}
  daily_challenge jsonb,         -- {date, word_key, claimed}
  PRIMARY KEY(user_id, lang)
)

word_scores (
  user_id uuid, lang text, word_id text,
  score int default 4,           -- 0..10
  last_seen_at timestamptz,      -- for fragile-mastery decay
  PRIMARY KEY(user_id, lang, word_id)
)

quest_state (
  user_id uuid, lang text, quest_id text,
  period text,                   -- daily|weekly
  period_key text,               -- '2026-05-24' or '2026-W21'
  progress int, claimed bool,
  PRIMARY KEY(user_id, lang, quest_id, period_key)
)

achievements (
  user_id uuid, achievement_id text,
  unlocked_at timestamptz,
  PRIMARY KEY(user_id, achievement_id)
)

leaderboard_view (materialized, on-read refresh)
  user_id, lang, handle, display_name, photo_url, xp, rank_tier
```

### RLS
- `profiles`: read own + public fields of others (handle, display_name, photo_url, showcase_lang, pinned_achievements) for leaderboard.
- `lang_state`/`word_scores`/`quest_state`/`achievements`: read+write own only.
- XP/coins/shards mutations: server-side RPC only.

### Local cache (guest + offline)
- IndexedDB via `idb-keyval`. Mirror schema. Key `vocup:{lang}:{table}`.
- On login: merge local → remote, last-write-wins per field.

---

## 4 · GAME RULES

### 4.1 Ranks (per lang, no demotion)
19 tiers ordered: `unranked → wood 1/2/3 → bronze 1/2/3 → silver 1/2/3 → gold 1/2/3 → diamond 1/2/3 → platinum 1/2/3 → solar`. Solar = no subrank.

XP curve (cumulative, exponential, ~15h to solar):
```
threshold(n) = round(593 * (1.15^n - 1) / 0.15)   for n in 1..19
```
Solar ≈ 45000 XP cumulative. Curve fn in `lib/game/rank.ts`. Tune-able.

Promotion → +1 unlock token, immediate full-screen popup + confetti.

### 4.2 XP sources
- Quiz correct: `XP = score(word_at_show) + floor(streak/2)`. Streak starts 0 (first correct = bonus 0). Score read **before** the +1 update.
- Quest claim: scaled by rank (smooth multiplier `1 + 0.15 × rank_tier`).
- Speed bonus: `+1 XP` if correct within 3s of flip (all words).
- Daily challenge correct: `5× base XP`.
- Lessons: 0 XP.

### 4.3 Word mastery score (per user, per lang, per word)
- Start: 4/10.
- Quiz correct: +1 (cap 10). Wrong: −2 (floor 0).
- **Mastered** = score ≥ 8. Stays mastered visually even at 7.
- Colors: 0–4 red, 5–6 yellow, 7–9 green, 10 blue.
- **Fragile-mastery decay**: every 21d unseen, `score -= 1` until floor 5. Score ≤5 no decay. Cron checks daily.

### 4.4 Quiz
- Pool = all unlocked words.
- Weighted random: `weight(w) = (11 - score(w))^2`. Mastered words still appear (low weight). Empty pool edge: still test mastered with very low prob (never empty).
- Direction: 60% FR→target, 40% target→FR (random per card).
- Articles: nouns with both `a/the` forms → randomly pick definite|indefinite; FR article matches.
- Speaker btn: TTS plays **non-French** side via `speechSynthesis`, lang code matches target. No FR TTS.
- Self-report: tap ✅/❌ after flip. **Pure trust, no XP cap, no anti-cheat.**
- Infinite quiz; exit via nav. Exit resets streak + session counter (XP/score/rank/coins persist).
- Milestone popups @ cards 10/25/50/100: celebratory anim only, no extra reward.
- Speed bonus +1 XP if <3s flip→answer (all words).

### 4.5 Streak (visual stages, flame asset)
Thresholds: `5, 10, 20, 30, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 10000`. 16 stages. Stage 16 max visual; number grows past.
Reset on: wrong answer OR quiz tab leave.

### 4.6 Session counter & coins
- Each card answered (right or wrong) increments session N.
- Coin payout per card = `N` (cumulative session card #).
- Total after N cards = `N*(N+1)/2`.
- Reset N=0 on quiz tab leave.

### 4.7 Categories & unlock tokens
9 categories, 27 subcats. Start: 4 BASIQUE subcats free.
- Each rank promotion grants 1 unlock token.
- Tokens **savable** (hoard allowed).
- All subcats cost **1 token** (uniform).
- 23 locked subcats vs 19 promotions → final 4 promotions (platinum3, solar) grant extra tokens to cover gap: **solar promotion = 5 tokens** (1+4). Tune-able.
- Locked subcat row shows word count + 🔒 padlock.

### 4.8 Quests (per lang, instant update)
- **3 daily** + **5 weekly** active.
- Daily reset 00:00 UTC. Weekly reset Monday 00:00 UTC.
- Types: `answer_N_cards`, `streak_N`, `earn_N_coins`, `master_N_words` (score≥8), `complete_subcat`, `open_chest`, `win_rate_X_over_Y_cards`.
- Rewards: coins + XP, smooth scale `× (1 + 0.15 × rank_tier)`.
- No reroll.

### 4.9 Daily challenge card
- 1 card per lang per day. Picked from user's 5 lowest-score words.
- Correct = 5× base XP. Wrong = nothing extra. Resets 00:00 UTC.

### 4.10 Daily login reward (cross-lang, global)
Cyclic 4-step pattern, expanded per cycle.

```
cycle_index = ceil(day / 4)
slot = ((day - 1) % 4)   // 0=coin, 1=luck, 2=XP, 3=streak
reward = cycle_index copies of "×2 {slot}" booster (24h timer)
```
Examples:
- Day 1 → 1× ×2 coin booster
- Day 2 → 1× ×2 luck booster
- Day 3 → 1× ×2 XP booster
- Day 4 → 1× ×2 streak booster
- Day 5 → 2× ×2 coin boosters
- Day 13 → 4× ×2 coin boosters

Booster meanings (24h each, stack additively per type):
- **×2 coin**: doubles coin payouts (session, quest).
- **×2 luck**: doubles drop weight for higher rarities in chests.
- **×2 XP**: doubles XP gain (quiz + quest + speed).
- **×2 streak**: doubles streak XP bonus (`floor(streak/2)` becomes `streak`).

Pop-up on first launch of the day showing day# + reward + **Claim** btn. Missing one day = streak reset to Day 1.

### 4.11 Shop & chests (per lang)
3 chest types, fixed prices, drop tables (sum 100%):

| Chest | Price | C | R | SR | E | L | Sec |
|---|---|---|---|---|---|---|---|
| Common | 100 | 70 | 25 | 4 | 1 | 0 | 0 |
| Rare | 500 | 0 | 70 | 25 | 4 | 1 | 0 |
| Legendary | 2000 | 0 | 0 | 70 | 25 | 4 | 1 |

Item catalog (global, **30 items per type** = 30 skins + 30 themes total):
- C=8, R=7, SR=6, E=5, L=3, Sec=1 per type.

**Inventory is per-lang.** Same catalog list, separate ownership per lang.

Roulette anim (GSAP, ~4s): fast → slow → land. SFX sync. Reveal screen.

Duplicate item → **Shards (éclats)**:
- C=5, R=15, SR=40, E=100, L=250, Sec=600 shards.

### 4.12 Bonus chest (Shards-only)
- 1 type, classic.
- Cost: TBD shards (default proposal: **300 shards**).
- Equal odds 25% each across 4 booster types (coin/luck/XP/streak).
- Multiplier roll: ×2 = 75%, ×3 = 20%, ×5 = 5%.
- Booster duration 24h.

### 4.13 Skin vs Theme
- **Skin** = flashcard visuals (border, bg, accent, flip-anim variants, particle FX on rare+).
- **Theme** = global app ambiance (bg layer, accent colors, font weight, ambient particles, motion intensity).
- Rarity scales transformative power (epic+ = animated auras, custom SFX).
- Equip: 1 skin + 1 theme active per lang.
- Owned: dim card + "(possédé)" badge. **No preview** before equip (collection through loot).

### 4.14 Achievements (permanent, cross-lang where logical)
Examples:
- First quiz answered
- First 10/25/50/100/500/1000 streak
- First mastered word; 50/200/440 mastered per lang
- First chest of each type opened
- Own 5/10/20/30 skins or themes (per lang)
- Reach each rank promotion (per lang)
- Complete a full subcat; complete all subcats of a category
- 7/30/100-day login streak
- Open 10/50/100 bonus chests

Unlock = small pop-up notification. User pins up to **3 favorites** to profile.

### 4.15 Leaderboard
- Global, per-lang, sorted by `xp` desc.
- Top 100 + sliding window (3 above / 3 below user) if outside top 100.
- User row marked `(moi)`.
- Refresh on every view-mount (no cache).
- Auth required to view + appear (guests excluded).

### 4.16 Prestige badge (profile)
- User manually picks **showcase_lang** to display.
- Shows that lang's rank crest + small lang flag underneath.
- No global rank computed.

### 4.17 Focus mode
- Distraction-free quiz: hides nav, max card size, ambient bg matches theme, breathing border anim. Toggle via icon in quiz top bar. Honors `prefers-reduced-motion`.

### 4.18 Onboarding (mandatory, first launch only)
- 3-card guided quiz with **dummy placeholders**: `"mot en français"` / `"traduction en (langue)"`.
- Explicit "tap here" tooltips: flip card, ✅, ❌.
- After 3rd card: enter real app.
- Persisted flag `tutorial_done` in profile + local.

### 4.19 Daily review mini-mode
- Lesson tab btn: "Révision du jour".
- Shows 10 lowest-score words sequentially, audio (TTS) auto-plays each.
- **No XP, no coins, no streak**, no quest progress. Pure listening tool.

### 4.20 Coin counter visibility
- Coins shown only **inside lang sub-interface** (header).
- Hidden on home page. Lang tiles show only rank + words-mastered bar.

---

## 5 · VOCAB DATASET

Embedded at build time → `lib/data/words.ts` (parsed from XML below). Stable `id` = w001..w440 (sequential).

Slash format in any lang field = `indefinite/definite` variants when both apply (used by quiz article-randomization for nouns). Field kept verbatim; parser splits on `/`.

POS codes: `v`=verb, `n`=noun, `a`=adj, `x`=other (conn/pron/adv/quantifier).

```xml
<vocab total="440">

<cat id="1" name="BASIQUE" free="true">
<sub id="1.1" name="Verbes de base">
<w id="w001" p="v" fr="être" en="to be" de="sein" es="ser" it="essere"/>
<w id="w002" p="v" fr="faire" en="to do" de="machen" es="hacer" it="fare"/>
<w id="w003" p="v" fr="avoir" en="to have" de="haben" es="tener" it="avere"/>
<w id="w004" p="v" fr="dire" en="to say" de="sagen" es="decir" it="dire"/>
<w id="w005" p="v" fr="voir" en="to see" de="sehen" es="ver" it="vedere"/>
<w id="w006" p="v" fr="envoyer" en="to send" de="senden" es="enviar" it="inviare"/>
<w id="w007" p="v" fr="pouvoir" en="to may" de="dürfen/können" es="poder" it="potere"/>
<w id="w008" p="v" fr="vouloir/futur" en="will" de="werden/wollen" es="querer/futuro" it="volere/futuro"/>
<w id="w009" p="v" fr="venir" en="to come" de="kommen" es="venir" it="venire"/>
<w id="w010" p="v" fr="obtenir" en="to get" de="bekommen" es="obtener" it="ottenere"/>
<w id="w011" p="v" fr="donner" en="to give" de="geben" es="dar" it="dare"/>
<w id="w012" p="v" fr="aller" en="to go" de="gehen" es="ir" it="andare"/>
<w id="w013" p="v" fr="garder" en="to keep" de="behalten" es="guardar" it="tenere"/>
<w id="w014" p="v" fr="laisser" en="to let" de="lassen" es="dejar" it="lasciare"/>
<w id="w015" p="v" fr="fabriquer" en="to make" de="machen" es="hacer" it="fare"/>
<w id="w016" p="v" fr="mettre" en="to put" de="legen/stellen" es="poner" it="mettere"/>
<w id="w017" p="v" fr="sembler" en="to seem" de="scheinen" es="parecer" it="sembrare"/>
<w id="w018" p="v" fr="prendre" en="to take" de="nehmen" es="tomar" it="prendere"/>
</sub>
<sub id="1.2" name="Connecteurs et Logique">
<w id="w019" p="x" fr="et" en="and" de="und" es="y" it="e"/>
<w id="w020" p="x" fr="parce que" en="because" de="weil" es="porque" it="perché"/>
<w id="w021" p="x" fr="mais" en="but" de="aber" es="pero" it="ma"/>
<w id="w022" p="x" fr="ou" en="or" de="oder" es="o" it="o"/>
<w id="w023" p="x" fr="si" en="if" de="wenn/falls" es="si" it="se"/>
<w id="w024" p="x" fr="bien que" en="though" de="obwohl" es="aunque" it="sebbene"/>
<w id="w025" p="x" fr="pendant que" en="while" de="während" es="mientras" it="mentre"/>
<w id="w026" p="x" fr="comment" en="how" de="wie" es="cómo" it="come"/>
<w id="w027" p="x" fr="quand" en="when" de="wann" es="cuando" it="quando"/>
<w id="w028" p="x" fr="pourquoi" en="why" de="warum" es="por qué" it="perché"/>
<w id="w029" p="x" fr="comme" en="as" de="wie/als" es="como" it="come"/>
<w id="w030" p="x" fr="pour" en="for" de="für" es="para" it="per"/>
<w id="w031" p="x" fr="de" en="of" de="von" es="de" it="di"/>
<w id="w032" p="x" fr="jusqu'à" en="till" de="bis" es="hasta" it="fino a"/>
<w id="w033" p="x" fr="que" en="than" de="als" es="que" it="di"/>
<w id="w034" p="x" fr="pas" en="not" de="nicht" es="no" it="non"/>
<w id="w035" p="x" fr="s'il vous plaît" en="please" de="bitte" es="por favor" it="per favore"/>
<w id="w036" p="x" fr="oui" en="yes" de="ja" es="sí" it="sì"/>
<w id="w037" p="x" fr="n'importe quel" en="any" de="irgendein" es="cualquier" it="qualunque"/>
<w id="w038" p="x" fr="chaque" en="every" de="jeder" es="cada" it="ogni"/>
<w id="w039" p="x" fr="aucun" en="no" de="kein" es="ningún" it="nessun"/>
<w id="w040" p="x" fr="autre" en="other" de="andere" es="otro" it="altro"/>
<w id="w041" p="x" fr="certains" en="some" de="einige" es="algunos" it="alcuni"/>
<w id="w042" p="x" fr="tel" en="such" de="solch" es="tal" it="tale"/>
<w id="w043" p="x" fr="cela" en="that" de="das" es="eso" it="quello"/>
<w id="w044" p="x" fr="ceci" en="this" de="dies" es="esto" it="questo"/>
</sub>
<sub id="1.3" name="Pronoms et Quantité">
<w id="w045" p="x" fr="je" en="I" de="ich" es="yo" it="io"/>
<w id="w046" p="x" fr="il" en="he" de="er" es="él" it="lui"/>
<w id="w047" p="x" fr="vous/tu" en="you" de="du/sie" es="tú/usted" it="tu/voi"/>
<w id="w048" p="x" fr="qui" en="who" de="wer" es="quien" it="chi"/>
<w id="w049" p="x" fr="tout" en="all" de="alle" es="todo" it="tutto"/>
<w id="w050" p="x" fr="peu" en="little" de="wenig" es="poco" it="poco"/>
<w id="w051" p="x" fr="beaucoup" en="much" de="viel" es="mucho" it="molto"/>
<w id="w052" p="x" fr="un/le" en="a/the" de="ein/der" es="un/el" it="un/il"/>
</sub>
<sub id="1.4" name="Adverbes de base">
<w id="w053" p="x" fr="presque" en="almost" de="fast" es="casi" it="quasi"/>
<w id="w054" p="x" fr="assez" en="enough" de="genug" es="suficiente" it="abbastanza"/>
<w id="w055" p="x" fr="même" en="even" de="sogar" es="incluso" it="persino"/>
<w id="w056" p="x" fr="seulement" en="only" de="nur" es="solo" it="solo"/>
<w id="w057" p="x" fr="tout à fait" en="quite" de="gänzlich" es="bastante" it="abbastanza"/>
<w id="w058" p="x" fr="si/tellement" en="so" de="so" es="tan" it="così"/>
<w id="w059" p="x" fr="très" en="very" de="sehr" es="muy" it="molto"/>
<w id="w060" p="x" fr="encore" en="still" de="noch" es="todavía" it="ancora"/>
<w id="w061" p="x" fr="ensemble" en="together" de="zusammen" es="juntos" it="insieme"/>
<w id="w062" p="x" fr="bien" en="well" de="gut" es="bien" it="bene"/>
</sub>
</cat>

<cat id="2" name="ESPACE & TEMPS">
<sub id="2.1" name="Espace">
<w id="w063" p="n" fr="un espace" en="a/the space" de="ein/der Raum" es="un/el espacio" it="uno/lo spazio"/>
<w id="w064" p="n" fr="une/la direction" en="a/the direction" de="eine/die Richtung" es="una/la dirección" it="una/la direzione"/>
<w id="w065" p="n" fr="le nord" en="the north" de="der Norden" es="el norte" it="il nord"/>
<w id="w066" p="n" fr="le sud" en="the south" de="der Süden" es="el sud" it="il sud"/>
<w id="w067" p="n" fr="l'est" en="the east" de="der Osten" es="el este" it="l'est"/>
<w id="w068" p="n" fr="l'ouest" en="the west" de="der Westen" es="el oeste" it="l'ovest"/>
<w id="w069" p="x" fr="ici" en="here" de="hier" es="aquí" it="qui"/>
<w id="w070" p="x" fr="là" en="there" de="dort" es="allí" it="lì"/>
<w id="w071" p="x" fr="partout" en="everywhere" de="überall" es="en todas partes" it="ovunque"/>
<w id="w072" p="x" fr="loin" en="far" de="weit" es="lejos" it="lontano"/>
<w id="w073" p="x" fr="près" en="near" de="nah" es="cerca" it="vicino"/>
<w id="w074" p="x" fr="avant" en="before" de="vor" es="antes" it="prima"/>
<w id="w075" p="x" fr="après" en="after" de="nach" es="después" it="dopo"/>
<w id="w076" p="x" fr="entre" en="between" de="zwischen" es="entre" it="tra"/>
<w id="w077" p="x" fr="contre" en="against" de="gegen" es="contra" it="contro"/>
<w id="w078" p="x" fr="à travers" en="across" de="quer durch" es="a través de" it="attraverso"/>
<w id="w079" p="x" fr="vers" en="to" de="zu" es="hacia" it="verso"/>
<w id="w080" p="x" fr="en haut" en="up" de="oben" es="arriba" it="su"/>
<w id="w081" p="x" fr="en bas" en="down" de="unten" es="abajo" it="giù"/>
<w id="w082" p="x" fr="au-dessus" en="over" de="über" es="encima" it="sopra"/>
<w id="w083" p="x" fr="sous" en="under" de="unter" es="debajo" it="sotto"/>
<w id="w084" p="x" fr="dedans" en="in" de="in" es="en" it="dentro"/>
<w id="w085" p="x" fr="dehors" en="out" de="aus" es="fuera" it="fuori"/>
<w id="w086" p="x" fr="au loin" en="off" de="weg" es="lejos" it="via"/>
<w id="w087" p="x" fr="sur" en="on" de="auf" es="en" it="su"/>
<w id="w088" p="x" fr="à travers" en="through" de="durch" es="a través" it="attraverso"/>
<w id="w089" p="x" fr="vers l'avant" en="forward" de="vorwärts" es="adelante" it="avanti"/>
</sub>
<sub id="2.2" name="Le Temps">
<w id="w090" p="n" fr="un temps" en="a/the time" de="eine/die Zeit" es="un/el tiempo" it="un/il tempo"/>
<w id="w091" p="n" fr="une/la année" en="a/the year" de="ein/das Jahr" es="un/el año" it="un/l'anno"/>
<w id="w092" p="n" fr="un/le mois" en="a/the month" de="ein/der Monat" es="un/el mes" it="un/il mese"/>
<w id="w093" p="n" fr="une/la semaine" en="a/the week" de="eine/die Woche" es="una/la semana" it="una/la settimana"/>
<w id="w094" p="n" fr="un/le jour" en="a/the day" de="ein/der Tag" es="un/el día" it="un/il giorno"/>
<w id="w095" p="n" fr="une/la heure" en="a/the hour" de="eine/die Stunde" es="una/la hora" it="un'ora"/>
<w id="w096" p="n" fr="une/la minute" en="a/the minute" de="eine/die Minute" es="un/el minuto" it="un/il minuto"/>
<w id="w097" p="n" fr="une/la seconde" en="a/the second" de="eine/die Sekunde" es="un/el segundo" it="un/il secondo"/>
<w id="w098" p="n" fr="le matin" en="the morning" de="der Morgen" es="la mañana" it="la mattina"/>
<w id="w099" p="n" fr="la nuit" en="the night" de="die Nacht" es="la noche" it="la notte"/>
<w id="w100" p="x" fr="aujourd'hui" en="today" de="heute" es="hoy" it="oggi"/>
<w id="w101" p="x" fr="demain" en="tomorrow" de="morgen" es="mañana" it="domani"/>
<w id="w102" p="x" fr="hier" en="yesterday" de="gestern" es="ayer" it="ieri"/>
<w id="w103" p="x" fr="maintenant" en="now" de="jetzt" es="ahora" it="ora"/>
<w id="w104" p="x" fr="tôt" en="early" de="früh" es="temprano" it="presto"/>
<w id="w105" p="x" fr="tard" en="late" de="spät" es="tarde" it="tardi"/>
<w id="w106" p="n" fr="un/le été" en="a/the summer" de="ein/der Sommer" es="un/el verano" it="un'estate"/>
<w id="w107" p="n" fr="un/le hiver" en="a/the winter" de="ein/der Winter" es="un/el invierno" it="un inverno"/>
<w id="w108" p="n" fr="une/la saison" en="a/the season" de="eine/die Jahreszeit" es="una/la estación" it="una/la stagione"/>
</sub>
<sub id="2.3" name="Mouvement">
<w id="w109" p="v" fr="courir" en="to run" de="laufen" es="correr" it="correre"/>
<w id="w110" p="v" fr="marcher" en="to walk" de="gehen" es="caminar" it="camminare"/>
<w id="w111" p="v" fr="nager" en="to swim" de="schwimmen" es="nadar" it="nuotare"/>
<w id="w112" p="v" fr="voler" en="to fly" de="fliegen" es="volar" it="volare"/>
<w id="w113" p="v" fr="sauter" en="to jump" de="springen" es="saltar" it="saltare"/>
<w id="w114" p="v" fr="monter" en="to step/climb" de="steigen" es="subir" it="salire"/>
<w id="w115" p="v" fr="tomber" en="to fall" de="fallen" es="caer" it="cadere"/>
<w id="w116" p="v" fr="tourner" en="to turn" de="drehen" es="girar" it="girare"/>
<w id="w117" p="v" fr="glisser" en="to slip" de="rutschen" es="resbalar" it="scivolare"/>
<w id="w118" p="v" fr="s'étirer" en="to stretch" de="strecken" es="estirarse" it="stendersi"/>
<w id="w119" p="v" fr="bouger" en="to move" de="bewegen" es="mover" it="muovere"/>
<w id="w120" p="v" fr="tirer" en="to pull" de="ziehen" es="tirar" it="tirare"/>
<w id="w121" p="v" fr="pousser" en="to push" de="drücken" es="empujar" it="spingere"/>
<w id="w122" p="v" fr="secouer" en="to shake" de="schütteln" es="sacudir" it="scuotere"/>
<w id="w123" p="v" fr="briser" en="to smash" de="zerschmettern" es="romper" it="frantumare"/>
<w id="w124" p="v" fr="rouler" en="to roll" de="rollen" es="rodar" it="rotolare"/>
</sub>
</cat>

<cat id="3" name="HUMAIN">
<sub id="3.1" name="Le Corps">
<w id="w125" p="n" fr="un corps" en="a/the body" de="ein/der Körper" es="un/el cuerpo" it="un/il corpo"/>
<w id="w126" p="n" fr="un/le bras" en="a/the arm" de="ein/der Arm" es="un/el brazo" it="un/il braccio"/>
<w id="w127" p="n" fr="un/le sang" en="the blood" de="das Blut" es="la sangre" it="il sangue"/>
<w id="w128" p="n" fr="un/le os" en="a/the bone" de="ein/der Knochen" es="un/el hueso" it="un/lo osso"/>
<w id="w129" p="n" fr="un/le cerveau" en="a/the brain" de="ein/das Gehirn" es="un/el cerebro" it="un/il cervello"/>
<w id="w130" p="n" fr="une/la poitrine" en="a/the chest" de="eine/die Brust" es="un/el pecho" it="un/il petto"/>
<w id="w131" p="n" fr="un/le menton" en="a/the chin" de="ein/das Kinn" es="una/la barbilla" it="un/il mento"/>
<w id="w132" p="n" fr="une/la oreille" en="a/the ear" de="ein/das Ohr" es="una/la oreja" it="un/l'orecchio"/>
<w id="w133" p="n" fr="un/le œil" en="a/the eye" de="ein/das Auge" es="un/el ojo" it="un/l'occhio"/>
<w id="w134" p="n" fr="un/le visage" en="a/the face" de="ein/das Gesicht" es="una/la cara" it="un/il viso"/>
<w id="w135" p="n" fr="un/le doigt" en="a/the finger" de="ein/der Finger" es="un/el dedo" it="un/il dito"/>
<w id="w136" p="n" fr="un/le pied" en="a/the foot" de="ein/der Fuß" es="un/el pie" it="un/il piede"/>
<w id="w137" p="n" fr="un/le cheveu" en="a/the hair" de="ein/das Haar" es="un/el pelo" it="un/il capello"/>
<w id="w138" p="n" fr="une/la main" en="a/the hand" de="eine/die Hand" es="una/la mano" it="una/la mano"/>
<w id="w139" p="n" fr="une/la tête" en="a/the head" de="ein/der Kopf" es="una/la cabeza" it="una/la testa"/>
<w id="w140" p="n" fr="un/le cœur" en="a/the heart" de="ein/das Herz" es="un/el corazón" it="un/il cuore"/>
<w id="w141" p="n" fr="un/le genou" en="a/the knee" de="ein/das Knie" es="una/la rodilla" it="un/il ginocchio"/>
<w id="w142" p="n" fr="une/la jambe" en="a/the leg" de="ein/das Bein" es="una/la pierna" it="una/la gamba"/>
<w id="w143" p="n" fr="une/la lèvre" en="a/the lip" de="eine/die Lippe" es="un/el labio" it="un/il labbro"/>
<w id="w144" p="n" fr="une/la bouche" en="a/the mouth" de="ein/der Mund" es="una/la boca" it="una/la bocca"/>
<w id="w145" p="n" fr="un/le muscle" en="a/the muscle" de="ein/der Muskel" es="un/el músculo" it="un/il muscolo"/>
<w id="w146" p="n" fr="un/le ongle" en="a/the nail" de="ein/der Nagel" es="una/la uña" it="un'unghia"/>
<w id="w147" p="n" fr="un/le cou" en="a/the neck" de="ein/der Hals" es="un/el cuello" it="un/il collo"/>
<w id="w148" p="n" fr="un/le nerf" en="a/the nerve" de="ein/der Nerv" es="un/el nervio" it="un/il nervo"/>
<w id="w149" p="n" fr="un/le nez" en="a/the nose" de="eine/die Nase" es="una/la nariz" it="un/il naso"/>
<w id="w150" p="n" fr="une/la peau" en="a/the skin" de="eine/die Haut" es="una/la piel" it="una/la pelle"/>
<w id="w151" p="n" fr="un/le estomac" en="a/the stomach" de="ein/der Magen" es="un/el estómago" it="un/lo stomaco"/>
<w id="w152" p="n" fr="une/la gorge" en="a/the throat" de="eine/die Kehle" es="una/la garganta" it="una/la gola"/>
<w id="w153" p="n" fr="un/le pouce" en="a/the thumb" de="ein/der Daumen" es="un/el pulgar" it="un/il pollice"/>
<w id="w154" p="n" fr="un/le orteil" en="a/the toe" de="ein/der Zeh" es="un/el dedo del pie" it="un/il dito del piede"/>
<w id="w155" p="n" fr="une/la langue" en="a/the tongue" de="eine/die Zunge" es="una/la lengua" it="una/la lingua"/>
<w id="w156" p="n" fr="une/la dent" en="a/the tooth" de="ein/der Zahn" es="un/el diente" it="un/il dente"/>
</sub>
<sub id="3.2" name="Famille et Société">
<w id="w157" p="n" fr="un père" en="a/the father" de="ein/der Vater" es="un/el padre" it="un/il padre"/>
<w id="w158" p="n" fr="une/la mère" en="a/the mother" de="eine/die Mutter" es="una/la madre" it="una/la madre"/>
<w id="w159" p="n" fr="un/le frère" en="a/the brother" de="ein/der Bruder" es="un/el hermano" it="un/il fratello"/>
<w id="w160" p="n" fr="une/la sœur" en="a/the sister" de="eine/die Schwester" es="una/la hermana" it="una/la sorella"/>
<w id="w161" p="n" fr="un/le fils" en="a/the son" de="ein/der Sohn" es="un/el hijo" it="un/il figlio"/>
<w id="w162" p="n" fr="une/la fille (enfant)" en="a/the daughter" de="eine/die Tochter" es="una/la hija" it="una/la figlia"/>
<w id="w163" p="n" fr="un/le bébé" en="a/the baby" de="ein/das Baby" es="un/el bebé" it="un/il bambino"/>
<w id="w164" p="n" fr="un/le homme" en="a/the man" de="ein/der Mann" es="un/el hombre" it="un/l'uomo"/>
<w id="w165" p="n" fr="une/la femme" en="a/the woman" de="eine/die Frau" es="una/la mujer" it="una/la donna"/>
<w id="w166" p="n" fr="un/le garçon" en="a/the boy" de="ein/der Junge" es="un/el niño" it="un/il ragazzo"/>
<w id="w167" p="n" fr="une/la fille" en="a/the girl" de="ein/das Mädchen" es="una/la niña" it="una/la ragazza"/>
<w id="w168" p="n" fr="un/le ami" en="a/the friend" de="ein/der Freund" es="un/el amigo" it="un/l'amico"/>
<w id="w169" p="n" fr="une/la personne" en="a/the person" de="eine/die Person" es="una/la persona" it="una/la persona"/>
<w id="w170" p="x" fr="soi-même" en="self" de="selbst" es="mismo" it="stesso"/>
</sub>
<sub id="3.3" name="Santé et Sensations">
<w id="w171" p="n" fr="une douleur" en="a/the pain" de="ein/der Schmerz" es="un/el dolor" it="un/il dolore"/>
<w id="w172" p="n" fr="une/la maladie" en="a/the disease" de="eine/die Krankheit" es="una/la enfermedad" it="una/la malattia"/>
<w id="w173" p="n" fr="une/la toux" en="a/the cough" de="ein/der Husten" es="una/la tos" it="una/la tosse"/>
<w id="w174" p="n" fr="un/le éternuement" en="a/the sneeze" de="ein/das Niesen" es="un/el estornudo" it="uno/lo starnuto"/>
<w id="w175" p="n" fr="un/le sommeil" en="a/the sleep" de="ein/der Schlaf" es="un/el sueño" it="un/il sonno"/>
<w id="w176" p="n" fr="une/la respiration" en="a/the breath" de="ein/der Atem" es="un/el aliento" it="un/il respiro"/>
<w id="w177" p="n" fr="un/le sanglot" en="a/the cry" de="ein/der Schrei" es="un/el grito" it="un/il grido"/>
<w id="w178" p="n" fr="un/le rire" en="a/the laugh" de="ein/das Lachen" es="una/la risa" it="una/la risata"/>
<w id="w179" p="n" fr="un/le baiser" en="a/the kiss" de="ein/der Kuss" es="un/el beso" it="un/il bacio"/>
<w id="w180" p="n" fr="un/le dégoût" en="a/the disgust" de="ein/der Ekel" es="un/el asco" it="un/il disgusto"/>
<w id="w181" p="n" fr="un/le choc" en="a/the shock" de="ein/der Schock" es="un/el choque" it="uno/lo shock"/>
<w id="w182" p="n" fr="une/la blessure" en="a/the wound" de="eine/die Wunde" es="una/la herida" it="una/la ferita"/>
<w id="w183" p="n" fr="une/la sensation" en="a/the feeling" de="ein/das Gefühl" es="una/la sensación" it="una/la sensazione"/>
<w id="w184" p="n" fr="une/la digestion" en="a/the digestion" de="eine/die Verdauung" es="una/la digestión" it="una/la digestione"/>
<w id="w185" p="n" fr="une/la ouïe" en="a/the hearing" de="ein/das Gehör" es="un/el oído" it="l'udito"/>
<w id="w186" p="n" fr="un/le goût" en="a/the taste" de="ein/der Geschmack" es="un/el gusto" it="un/il gusto"/>
<w id="w187" p="n" fr="une/la odeur" en="a/the smell" de="ein/der Geruch" es="un/el olor" it="un/l'odore"/>
<w id="w188" p="n" fr="une/la vue" en="a/the view" de="eine/die Aussicht" es="una/la vista" it="una/la vista"/>
</sub>
</cat>

<cat id="4" name="MAISON, VIE QUOTIDIENNE & NOURRITURE">
<sub id="4.1" name="Nourriture et Boisson">
<w id="w189" p="v" fr="manger" en="to eat" de="essen" es="comer" it="mangiare"/>
<w id="w190" p="v" fr="boire" en="to drink" de="trinken" es="beber" it="bere"/>
<w id="w191" p="n" fr="une/la eau" en="the water" de="das Wasser" es="el agua" it="l'acqua"/>
<w id="w192" p="n" fr="un/le pain" en="the bread" de="das Brot" es="el pan" it="il pane"/>
<w id="w193" p="n" fr="un/le lait" en="the milk" de="die Milch" es="la leche" it="il latte"/>
<w id="w194" p="n" fr="un/le œuf" en="an/the egg" de="ein/das Ei" es="un/el huevo" it="un/l'uovo"/>
<w id="w195" p="n" fr="une/la pomme" en="an/the apple" de="ein/der Apfel" es="una/la manzana" it="una/la mela"/>
<w id="w196" p="n" fr="un/le beurre" en="the butter" de="die Butter" es="la mantequilla" it="il burro"/>
<w id="w197" p="n" fr="un/le fromage" en="the cheese" de="der Käse" es="el queso" it="il formaggio"/>
<w id="w198" p="n" fr="une/la viande" en="the meat" de="das Fleisch" es="la carne" it="la carne"/>
<w id="w199" p="n" fr="un/le riz" en="the rice" de="der Reis" es="el arroz" it="il riso"/>
<w id="w200" p="n" fr="un/le sel" en="the salt" de="das Salz" es="la sal" it="il sale"/>
<w id="w201" p="n" fr="un/le sucre" en="the sugar" de="der Zucker" es="el azúcar" it="lo zucchero"/>
<w id="w202" p="n" fr="une/la soupe" en="a/the soup" de="eine/die Suppe" es="una/la sopa" it="una/la zuppa"/>
<w id="w203" p="n" fr="un/le fruit" en="a/the fruit" de="eine/die Frucht" es="una/la fruta" it="un/il frutto"/>
<w id="w204" p="n" fr="un/le vin" en="a/the wine" de="ein/der Wein" es="un/el vino" it="un/il vino"/>
<w id="w205" p="n" fr="une/la baie" en="a/the berry" de="eine/die Beere" es="una/la baya" it="una/la bacca"/>
<w id="w206" p="n" fr="un/le gâteau" en="a/the cake" de="ein/der Kuchen" es="un/el pastel" it="una/la torta"/>
<w id="w207" p="n" fr="une/la gelée" en="a/the jelly" de="ein/das Gelee" es="una/la jalea" it="una/la gelatina"/>
<w id="w208" p="n" fr="une/la pomme de terre" en="a/the potato" de="eine/die Kartoffel" es="una/la patata" it="una/la patata"/>
<w id="w209" p="n" fr="une/la orange" en="an/the orange" de="eine/die Orange" es="una/la naranja" it="un'arancia"/>
<w id="w210" p="n" fr="une/la noix" en="a/the nut" de="eine/die Nuss" es="una/la nuez" it="una/la noce"/>
</sub>
<sub id="4.2" name="L'Habitat">
<w id="w211" p="n" fr="une maison" en="a/the house" de="ein/das Haus" es="una/la casa" it="una/la casa"/>
<w id="w212" p="n" fr="un/le bâtiment" en="a/the building" de="ein/das Gebäude" es="un/el edificio" it="un/l'edificio"/>
<w id="w213" p="n" fr="une/la porte" en="a/the door" de="eine/die Tür" es="una/la puerta" it="una/la porta"/>
<w id="w214" p="n" fr="une/la fenêtre" en="a/the window" de="ein/das Fenster" es="una/la ventana" it="una/la finestra"/>
<w id="w215" p="n" fr="un/le mur" en="a/the wall" de="eine/die Wand" es="una/la pared" it="un/il muro"/>
<w id="w216" p="n" fr="un/le toit" en="a/the roof" de="ein/das Dach" es="un/el techo" it="un/il tetto"/>
<w id="w217" p="n" fr="une/la chambre" en="a/the room" de="ein/das Zimmer" es="una/la habitación" it="una/la stanza"/>
<w id="w218" p="n" fr="un/le sol" en="a/the floor" de="ein/der Boden" es="un/el suelo" it="un/il pavimento"/>
<w id="w219" p="n" fr="un/le jardin" en="a/the garden" de="ein/der Garten" es="un/el jardín" it="un/il giardino"/>
<w id="w220" p="n" fr="une/la cuisine" en="a/the kitchen/cook" de="eine/die Küche" es="una/la cocina" it="una/la cucina"/>
<w id="w221" p="n" fr="une/la étagère" en="a/the shelf" de="ein/das Regal" es="un/estante" it="uno/lo scaffale"/>
<w id="w222" p="n" fr="un/le tiroir" en="a/the drawer" de="eine/die Schublade" es="un/el cajón" it="un/il cassetto"/>
<w id="w223" p="n" fr="un/le rideau" en="a/the curtain" de="ein/der Vorhang" es="una/la cortina" it="una/la tenda"/>
<w id="w224" p="n" fr="un/le coussin" en="a/the cushion" de="ein/das Kissen" es="un/el cojín" it="un/il cuscino"/>
<w id="w225" p="n" fr="un/le lit" en="a/the bed" de="ein/das Bett" es="una/la cama" it="un/il letto"/>
<w id="w226" p="n" fr="une/la table" en="a/the table" de="ein/der Tisch" es="una/la mesa" it="un/il tavolo"/>
<w id="w227" p="n" fr="un/le siège" en="a/the seat" de="ein/der Sitz" es="un/el asiento" it="un/il sedile"/>
</sub>
<sub id="4.3" name="Vêtements">
<w id="w228" p="n" fr="un vêtement" en="a/the cloth" de="ein/das Tuch" es="una/la tela" it="un/il panno"/>
<w id="w229" p="n" fr="un/le manteau" en="a/the coat" de="ein/der Mantel" es="un/el abrigo" it="un/il cappotto"/>
<w id="w230" p="n" fr="une/la robe" en="a/the dress" de="ein/das Kleid" es="un/el vestido" it="un/il vestito"/>
<w id="w231" p="n" fr="un/le chapeau" en="a/the hat" de="ein/der Hut" es="un/el sombrero" it="un/il cappello"/>
<w id="w232" p="n" fr="une/la chaussure" en="a/the shoe" de="ein/der Schuh" es="un/el zapato" it="una/la scarpa"/>
<w id="w233" p="n" fr="une/la botte" en="a/the boot" de="ein/der Stiefel" es="una/la bota" it="uno/lo stivale"/>
<w id="w234" p="n" fr="un/le gant" en="a/the glove" de="ein/der Handschuh" es="un/el guante" it="un/il guanto"/>
<w id="w235" p="n" fr="une/la chemise" en="a/the shirt" de="ein/das Hemd" es="una/la camisa" it="una/la camicia"/>
<w id="w236" p="n" fr="une/la jupe" en="a/the skirt" de="ein/der Rock" es="una/la falda" it="una/la gonna"/>
<w id="w237" p="n" fr="un/le bas" en="a/the stocking" de="ein/der Strumpf" es="una/la media" it="una/la calza"/>
<w id="w238" p="n" fr="une/la chaussette" en="a/the sock" de="eine/die Socke" es="un/el calcetín" it="un/il calzino"/>
<w id="w239" p="n" fr="un/le pantalon" en="the trousers" de="die Hose" es="el pantalón" it="i/il pantaloni"/>
<w id="w240" p="n" fr="une/la poche" en="a/the pocket" de="eine/die Tasche" es="un/el bolsillo" it="una/la tasca"/>
<w id="w241" p="n" fr="un/le col" en="a/the collar" de="ein/der Kragen" es="un/el cuello" it="un/il colletto"/>
</sub>
</cat>

<cat id="5" name="NATURE & ANIMAUX">
<sub id="5.1" name="Animaux">
<w id="w242" p="n" fr="un animal" en="an/the animal" de="ein/das Tier" es="un/el animal" it="un/l'animale"/>
<w id="w243" p="n" fr="un/le chien" en="a/the dog" de="ein/der Hund" es="un/el perro" it="un/il cane"/>
<w id="w244" p="n" fr="un/le chat" en="a/the cat" de="eine/die Katze" es="un/el gato" it="un/il gatto"/>
<w id="w245" p="n" fr="un/le cheval" en="a/the horse" de="ein/das Pferd" es="un/el caballo" it="un/il cavallo"/>
<w id="w246" p="n" fr="un/le oiseau" en="a/the bird" de="ein/der Vogel" es="un/el pájaro" it="un/l'uccello"/>
<w id="w247" p="n" fr="un/le poisson" en="a/the fish" de="ein/der Fisch" es="un/el pez" it="un/il pesce"/>
<w id="w248" p="n" fr="un/le serpent" en="a/the snake" de="eine/die Schlange" es="una/la serpiente" it="un/il serpente"/>
<w id="w249" p="n" fr="une/la vache" en="a/the cow" de="eine/die Kuh" es="una/la vaca" it="una/la mucca"/>
<w id="w250" p="n" fr="un/le mouton" en="a/the sheep" de="ein/das Schaf" es="una/la oveja" it="una/la pecora"/>
<w id="w251" p="n" fr="un/le cochon" en="a/the pig" de="ein/das Schwein" es="un/el cerdo" it="un/il maiale"/>
<w id="w252" p="n" fr="une/la chèvre" en="a/the goat" de="eine/die Ziege" es="una/la cabra" it="una/la capra"/>
<w id="w253" p="n" fr="un/le singe" en="a/the monkey" de="ein/der Affe" es="un/el mono" it="una/la scimmia"/>
<w id="w254" p="n" fr="un/le rat" en="a/the rat" de="eine/die Ratte" es="una/la rata" it="un/il ratto"/>
<w id="w255" p="n" fr="un/le ver" en="a/the worm" de="ein/der Wurm" es="un/el gusano" it="un/il verme"/>
<w id="w256" p="n" fr="une/la fourmi" en="an/the ant" de="eine/die Ameise" es="una/la hormiga" it="una/la formica"/>
<w id="w257" p="n" fr="une/la abeille" en="a/the bee" de="eine/die Biene" es="una/la abeja" it="un'ape"/>
<w id="w258" p="n" fr="une/la mouche" en="a/the fly" de="eine/die Fliege" es="una/la mosca" it="una/la mosca"/>
<w id="w259" p="n" fr="un/le insecte" en="an/the insect" de="ein/das Insekt" es="un/el insecto" it="un/l'insetto"/>
<w id="w260" p="n" fr="une/la volaille" en="a/the fowl" de="ein/das Geflügel" es="un/el ave" it="un/il pollame"/>
</sub>
<sub id="5.2" name="Environnement">
<w id="w261" p="n" fr="une fleur" en="a/the flower" de="eine/die Blume" es="una/la flor" it="un/il fiore"/>
<w id="w262" p="n" fr="un/le arbre" en="a/the tree" de="ein/der Baum" es="un/el árbol" it="un/l'albero"/>
<w id="w263" p="n" fr="une/la herbe" en="the grass" de="das Gras" es="la hierba" it="l'erba"/>
<w id="w264" p="n" fr="une/la feuille" en="a/the leaf" de="ein/das Blatt" es="una/la hoja" it="una/la foglia"/>
<w id="w265" p="n" fr="une/la racine" en="a/the root" de="eine/die Wurzel" es="una/la raíz" it="una/la radice"/>
<w id="w266" p="n" fr="une/la graine" en="a/the seed" de="ein/der Samen" es="una/la semilla" it="un/il seme"/>
<w id="w267" p="n" fr="une/la branche" en="a/the branch" de="ein/der Ast" es="una/la rama" it="un/il ramo"/>
<w id="w268" p="n" fr="une/la tige" en="a/the stem" de="ein/der Stiel" es="un/el tallo" it="uno/lo stelo"/>
<w id="w269" p="n" fr="le ciel" en="the sky" de="der Himmel" es="el cielo" it="il cielo"/>
<w id="w270" p="n" fr="le soleil" en="the sun" de="die Sonne" es="el sol" it="il sole"/>
<w id="w271" p="n" fr="la lune" en="the moon" de="der Mond" es="la luna" it="la luna"/>
<w id="w272" p="n" fr="une/la étoile" en="a/the star" de="ein/der Stern" es="una/la estrella" it="una/la stella"/>
<w id="w273" p="n" fr="un/le nuage" en="a/the cloud" de="eine/die Wolke" es="una/la nube" it="una/la nuvola"/>
<w id="w274" p="n" fr="une/la pluie" en="the rain" de="der Regen" es="la lluvia" it="la pioggia"/>
<w id="w275" p="n" fr="une/la neige" en="the snow" de="der Schnee" es="la nieve" it="la neve"/>
<w id="w276" p="n" fr="un/le vent" en="the wind" de="der Wind" es="el viento" it="il vento"/>
<w id="w277" p="n" fr="un/le tonnerre" en="the thunder" de="der Donner" es="el trueno" it="il tuono"/>
<w id="w278" p="n" fr="un/le feu" en="a/the fire" de="ein/das Feuer" es="un/el fuego" it="un/il fuoco"/>
<w id="w279" p="n" fr="une/la flamme" en="a/the flame" de="eine/die Flamme" es="una/la llama" it="una/la fiamma"/>
<w id="w280" p="n" fr="une/la terre" en="the earth" de="die Erde" es="la tierra" it="la terra"/>
<w id="w281" p="n" fr="une/la montagne" en="a/the mountain" de="ein/der Berg" es="una/la montaña" it="una/la montagna"/>
<w id="w282" p="n" fr="une/la rivière" en="a/the river" de="ein/der Fluss" es="un/el río" it="un/il fiume"/>
<w id="w283" p="n" fr="une/la mer" en="the sea" de="das Meer" es="el mar" it="il mare"/>
<w id="w284" p="n" fr="une/la île" en="an/the island" de="eine/die Insel" es="una/la isla" it="un'isola"/>
<w id="w285" p="n" fr="un/le sable" en="the sand" de="der Sand" es="la arena" it="la sabbia"/>
<w id="w286" p="n" fr="une/la pierre" en="a/the stone" de="ein/der Stein" es="una/la piedra" it="una/la pietra"/>
<w id="w287" p="n" fr="une/la poussière" en="the dust" de="der Staub" es="el polvo" it="la polvere"/>
</sub>
</cat>

<cat id="6" name="SOCIÉTÉ, TRAVAIL & ÉCONOMIE">
<sub id="6.1" name="Économie">
<w id="w288" p="n" fr="un argent" en="the money" de="das Geld" es="el dinero" it="i soldi"/>
<w id="w289" p="n" fr="un/le prix" en="a/the price" de="ein/der Preis" es="un/el precio" it="un/il prezzo"/>
<w id="w290" p="n" fr="un/le paiement" en="a/the payment" de="eine/die Zahlung" es="un/el pago" it="un/il pagamento"/>
<w id="w291" p="n" fr="un/le compte" en="an/the account" de="ein/das Konto" es="una/la cuenta" it="un/il conto"/>
<w id="w292" p="n" fr="une/la dette" en="a/the debt" de="eine/die Schuld" es="una/la deuda" it="un/il debito"/>
<w id="w293" p="n" fr="un/le profit" en="a/the profit" de="ein/der Gewinn" es="un/el beneficio" it="un/il profitto"/>
<w id="w294" p="n" fr="un/le impôt" en="a/the tax" de="eine/die Steuer" es="un/el impuesto" it="una/la tassa"/>
<w id="w295" p="n" fr="un/le marché" en="a/the market" de="ein/der Markt" es="un/el mercado" it="un/il mercato"/>
<w id="w296" p="n" fr="une/la affaire" en="a/the business" de="ein/das Geschäft" es="un/el negocio" it="un/affare"/>
<w id="w297" p="n" fr="un/le commerce" en="a/the trade" de="ein/der Handel" es="un/el comercio" it="un/il commercio"/>
<w id="w298" p="n" fr="une/la propriété" en="a/the property" de="ein/das Eigentum" es="una/la propiedad" it="una/la proprietà"/>
<w id="w299" p="n" fr="une/la valeur" en="a/the value" de="ein/der Wert" es="un/el valor" it="un/il valore"/>
<w id="w300" p="n" fr="une/la assurance" en="an/the insurance" de="eine/die Versicherung" es="un/el seguro" it="un'assicurazione"/>
<w id="w301" p="n" fr="un/le crédit" en="a/the credit" de="ein/der Kredit" es="un/el crédito" it="un/il credito"/>
</sub>
<sub id="6.2" name="Politique">
<w id="w302" p="n" fr="un gouvernement" en="a/the government" de="eine/die Regierung" es="un/el gobierno" it="un/il governo"/>
<w id="w303" p="n" fr="une/la nation" en="a/the nation" de="eine/die Nation" es="una/la nación" it="una/la nazione"/>
<w id="w304" p="n" fr="un/le pays" en="a/the country" de="ein/das Land" es="un/el país" it="un/il paese"/>
<w id="w305" p="n" fr="une/la ville" en="a/the town" de="eine/die Stadt" es="una/la ciudad" it="una/la città"/>
<w id="w306" p="n" fr="une/la loi" en="a/the law" de="ein/das Gesetz" es="una/la ley" it="una/la legge"/>
<w id="w307" p="n" fr="un/le juge" en="a/the judge" de="ein/der Richter" es="un/el juez" it="un/il giudice"/>
<w id="w308" p="n" fr="une/la prison" en="a/the prison" de="ein/das Gefängnis" es="una/la cárcel" it="una/la prigione"/>
<w id="w309" p="n" fr="un/le crime" en="a/the crime" de="ein/das Verbrechen" es="un/el crimen" it="un/il crimine"/>
<w id="w310" p="n" fr="une/la guerre" en="a/the war" de="ein/der Krieg" es="una/la guerra" it="una/la guerra"/>
<w id="w311" p="n" fr="une/la paix" en="the peace" de="der Frieden" es="la paz" it="la pace"/>
<w id="w312" p="n" fr="une/la autorité" en="an/the authority" de="eine/die Behörde" es="una/la autoridad" it="un'autorità"/>
<w id="w313" p="n" fr="un/le représentant" en="a/the representative" de="ein/der Vertreter" es="un/el representante" it="un/il rappresentante"/>
<w id="w314" p="n" fr="un/le comité" en="a/the committee" de="ein/der Ausschuss" es="un/el comité" it="un/il comitato"/>
</sub>
<sub id="6.3" name="Travail et Industrie">
<w id="w315" p="n" fr="un travail" en="a/the work" de="eine/die Arbeit" es="un/el trabajo" it="un/il lavoro"/>
<w id="w316" p="n" fr="une/la industrie" en="an/the industry" de="eine/die Industrie" es="una/la industria" it="un'industria"/>
<w id="w317" p="n" fr="un/le directeur" en="a/the manager" de="ein/der Manager" es="un/el gerente" it="un/il direttore"/>
<w id="w318" p="n" fr="un/le secrétaire" en="a/the secretary" de="ein/der Sekretär" es="un/el secretario" it="un/il segretario"/>
<w id="w319" p="n" fr="un/le serviteur" en="a/the servant" de="ein/der Diener" es="un/el servidor" it="un/il servitore"/>
<w id="w320" p="n" fr="un/le porteur" en="a/the porter" de="ein/der Pförtner" es="un/el portero" it="un/il portiere"/>
<w id="w321" p="n" fr="une/la organisation" en="an/the organization" de="eine/die Organisation" es="una/la organización" it="un'organizzazione"/>
</sub>
</cat>

<cat id="7" name="COMMUNICATION, INFORMATION & ARTS">
<sub id="7.1" name="Langage et Échange">
<w id="w322" p="v" fr="parler" en="to talk/speak" de="sprechen" es="hablar" it="parlare"/>
<w id="w323" p="n" fr="un/le mot" en="a/the word" de="ein/das Wort" es="una/la palabra" it="una/la parola"/>
<w id="w324" p="n" fr="une/la langue" en="a/the language" de="eine/die Sprache" es="un/el idioma" it="una/la lingua"/>
<w id="w325" p="n" fr="une/la nouvelle" en="the news" de="die Nachricht" es="la noticia" it="la notizia"/>
<w id="w326" p="n" fr="une/la note" en="a/the note" de="eine/die Notiz" es="una/la nota" it="una/la nota"/>
<w id="w327" p="n" fr="une/la réponse" en="an/the answer" de="eine/die Antwort" es="una/la respuesta" it="una/la risposta"/>
<w id="w328" p="n" fr="une/la question" en="a/the question" de="eine/die Frage" es="una/la pregunta" it="una/la domanda"/>
<w id="w329" p="n" fr="un/le argument" en="an/the argument" de="ein/das Argument" es="un/el argumento" it="un/l'argomento"/>
<w id="w330" p="n" fr="une/la discussion" en="a/the discussion" de="eine/die Diskussion" es="una/la discusión" it="una/la discussione"/>
<w id="w331" p="n" fr="un/le cri" en="a/the cry" de="ein/der Schrei" es="un/el grito" it="un/il grido"/>
<w id="w332" p="n" fr="une/la voix" en="a/the voice" de="eine/die Stimme" es="una/la voz" it="una/la voce"/>
<w id="w333" p="n" fr="un/le nom" en="a/the name" de="ein/der Name" es="un/el nombre" it="un/il nome"/>
</sub>
<sub id="7.2" name="Médias et Supports">
<w id="w334" p="n" fr="un livre" en="a/the book" de="ein/das Buch" es="un/el libro" it="un/il libro"/>
<w id="w335" p="n" fr="une/la lettre" en="a/the letter" de="ein/der Brief" es="una/la carta" it="una/la lettera"/>
<w id="w336" p="n" fr="un/le papier" en="a/the paper" de="ein/das Papier" es="un/el papel" it="una/la carta"/>
<w id="w337" p="n" fr="une/la page" en="a/the page" de="eine/die Seite" es="una/la página" it="una/la pagina"/>
<w id="w338" p="n" fr="un/le stylo" en="a/the pen" de="ein/der Stift" es="una/la pluma" it="una/la penna"/>
<w id="w339" p="n" fr="un/le crayon" en="a/the pencil" de="ein/der Bleistift" es="un/el lápiz" it="una/la matita"/>
<w id="w340" p="n" fr="une/la encre" en="the ink" de="die Tinte" es="la tinta" it="l'inchiostro"/>
<w id="w341" p="n" fr="une/la impression" en="a/the print" de="ein/der Druck" es="una/la impresión" it="una/la stampa"/>
<w id="w342" p="n" fr="une/la image" en="a/the picture" de="ein/das Bild" es="una/la imagen" it="un'immagine"/>
<w id="w343" p="n" fr="une/la carte" en="a/the map/card" de="eine/die Karte" es="una/la tarjeta" it="una/la carta"/>
</sub>
<sub id="7.3" name="Arts et Divertissement">
<w id="w344" p="n" fr="un art" en="the art" de="die Kunst" es="el arte" it="l'arte"/>
<w id="w345" p="n" fr="une/la musique" en="the music" de="die Musik" es="la música" it="la musica"/>
<w id="w346" p="n" fr="une/la chanson" en="a/the song" de="ein/das Lied" es="una/la canción" it="una/la canzone"/>
<w id="w347" p="n" fr="un/le rythme" en="a/the rhythm" de="ein/der Rhythmus" es="un/el ritmo" it="un/il ritmo"/>
<w id="w348" p="n" fr="un/le vers" en="a/the verse" de="ein/der Vers" es="un/el verso" it="un/il verso"/>
<w id="w349" p="n" fr="une/la prose" en="the prose" de="die Prosa" es="la prosa" it="la prosa"/>
<w id="w350" p="n" fr="une/la histoire" en="a/the story" de="eine/die Geschichte" es="una/la historia" it="una/la storia"/>
<w id="w351" p="n" fr="un/le amusement" en="an/the amusement" de="ein/das Vergnügen" es="una/la diversión" it="un/il divertimento"/>
<w id="w352" p="n" fr="un/le jeu" en="a/the play" de="ein/das Spiel" es="un/el juego" it="un/il gioco"/>
<w id="w353" p="n" fr="un/le instrument" en="an/the instrument" de="ein/das Instrument" es="un/el instrumento" it="un/lo strumento"/>
</sub>
</cat>

<cat id="8" name="SCIENCES, MATHÉMATIQUES & MATIÈRES">
<sub id="8.1" name="Mathématiques et Logique">
<w id="w354" p="n" fr="un nombre" en="a/the number" de="eine/die Zahl" es="un/el número" it="un/il numero"/>
<w id="w355" p="n" fr="une/la unité" en="a/the unit" de="eine/die Einheit" es="una/la unidad" it="un'unità"/>
<w id="w356" p="n" fr="une/la addition" en="an/the addition" de="eine/die Addition" es="una/la suma" it="un'addizione"/>
<w id="w357" p="n" fr="une/la division" en="a/the division" de="eine/die Division" es="una/la división" it="una/la divisione"/>
<w id="w358" p="n" fr="une/la mesure" en="a/the measure" de="ein/das Maß" es="una/la medida" it="una/la misura"/>
<w id="w359" p="n" fr="un/le poids" en="a/the weight" de="ein/das Gewicht" es="un/el peso" it="un/il peso"/>
<w id="w360" p="n" fr="une/la échelle" en="a/the scale" de="eine/die Skala" es="una/la escala" it="una/la scala"/>
<w id="w361" p="n" fr="un/le degré" en="a/the degree" de="ein/der Grad" es="un/el grado" it="un/il grado"/>
<w id="w362" p="n" fr="une/la ligne" en="a/the line" de="eine/die Linie" es="una/la línea" it="una/la linea"/>
<w id="w363" p="n" fr="un/le cercle" en="a/the circle" de="ein/der Kreis" es="un/el círculo" it="un/il cerchio"/>
<w id="w364" p="n" fr="un/le carré" en="a/the square" de="ein/das Quadrat" es="un/el cuadrado" it="un/il quadrato"/>
<w id="w365" p="n" fr="un/le angle" en="an/the angle" de="ein/der Winkel" es="un/el ángulo" it="un/l'angolo"/>
</sub>
<sub id="8.2" name="Matières">
<w id="w366" p="n" fr="un métal" en="a/the metal" de="ein/das Metall" es="un/el metal" it="un/il metallo"/>
<w id="w367" p="n" fr="un/le fer" en="the iron" de="das Eisen" es="el hierro" it="il ferro"/>
<w id="w368" p="n" fr="un/le or" en="the gold" de="das Gold" es="el oro" it="l'oro"/>
<w id="w369" p="n" fr="un/le argent (métal)" en="the silver" de="das Silber" es="la plata" it="l'argento"/>
<w id="w370" p="n" fr="un/le cuivre" en="the copper" de="das Kupfer" es="el cobre" it="il rame"/>
<w id="w371" p="n" fr="un/le acier" en="the steel" de="der Stahl" es="el acero" it="l'acciaio"/>
<w id="w372" p="n" fr="un/le étain" en="the tin" de="das Zinn" es="el estaño" it="lo stagno"/>
<w id="w373" p="n" fr="un/le verre" en="the glass" de="das Glas" es="el vidrio" it="il vetro"/>
<w id="w374" p="n" fr="un/le bois" en="the wood" de="das Holz" es="la madera" it="il legno"/>
<w id="w375" p="n" fr="un/le coton" en="the cotton" de="die Baumwolle" es="el algodón" it="il cotone"/>
<w id="w376" p="n" fr="une/la laine" en="the wool" de="die Wolle" es="la lana" it="la lana"/>
<w id="w377" p="n" fr="une/la soie" en="the silk" de="die Seide" es="la seda" it="la seta"/>
<w id="w378" p="n" fr="un/le cuir" en="the leather" de="das Leder" es="el cuero" it="il cuoio"/>
<w id="w379" p="n" fr="un/le charbon" en="the coal" de="die Kohle" es="el carbón" it="il carbone"/>
<w id="w380" p="n" fr="une/la huile" en="the oil" de="das Öl" es="el aceite" it="l'olio"/>
<w id="w381" p="n" fr="un/le liquide" en="a/the liquid" de="eine/die Flüssigkeit" es="un/el líquido" it="un/il liquido"/>
<w id="w382" p="n" fr="un/le gaz" en="a/the gas" de="ein/das Gas" es="un/el gas" it="un/il gas"/>
<w id="w383" p="n" fr="une/la poudre" en="the powder" de="der Puder" es="el polvo" it="la polvere"/>
</sub>
<sub id="8.3" name="Technique et Physique">
<w id="w384" p="n" fr="un appareil" en="an/the apparatus" de="ein/der Apparat" es="un/el aparato" it="un/l'apparecchio"/>
<w id="w385" p="n" fr="une/la machine" en="a/the machine" de="eine/die Maschine" es="una/la máquina" it="una/la macchina"/>
<w id="w386" p="n" fr="un/le moteur" en="an/the engine" de="ein/der Motor" es="un/el motor" it="un/il motore"/>
<w id="w387" p="n" fr="un/le frein" en="a/the brake" de="eine/die Bremse" es="un/el freno" it="un/il freno"/>
<w id="w388" p="n" fr="une/la roue" en="a/the wheel" de="ein/das Rad" es="una/la rueda" it="una/la ruota"/>
<w id="w389" p="n" fr="une/la pompe" en="a/the pump" de="eine/die Pumpe" es="una/la bomba" it="una/la pompa"/>
<w id="w390" p="n" fr="un/le avion" en="a/the plane" de="ein/das Flugzeug" es="un/el avión" it="un/l'aereo"/>
<w id="w391" p="n" fr="un/le bateau" en="a/the boat/ship" de="ein/das Boot" es="un/el barco" it="una/la barca"/>
<w id="w392" p="n" fr="un/le train" en="a/the train" de="ein/der Zug" es="un/el tren" it="un/il treno"/>
<w id="w393" p="n" fr="une/la électricité" en="the electric" de="der elektrische Strom" es="la electricidad" it="l'elettricità"/>
<w id="w394" p="n" fr="une/la force" en="a/the force" de="eine/die Kraft" es="una/la fuerza" it="una/la forza"/>
</sub>
</cat>

<cat id="9" name="PENSÉE, LOGIQUE & QUALITÉS">
<sub id="9.1" name="Concepts">
<w id="w395" p="n" fr="une idée" en="an/the idea" de="eine/die Idee" es="una/la idea" it="un'idea"/>
<w id="w396" p="n" fr="une/la pensée" en="a/the thought" de="ein/der Gedanke" es="un/el pensamiento" it="un/il pensiero"/>
<w id="w397" p="n" fr="une/la croyance" en="a/the belief" de="ein/der Glaube" es="una/la creencia" it="una/la credenza"/>
<w id="w398" p="n" fr="une/la connaissance" en="the knowledge" de="das Wissen" es="el conocimiento" it="la conoscenza"/>
<w id="w399" p="n" fr="une/la raison" en="a/the reason" de="ein/der Grund" es="una/la razón" it="una/la ragione"/>
<w id="w400" p="n" fr="un/le fait" en="a/the fact" de="eine/die Tatsache" es="un/el hecho" it="un/il fatto"/>
<w id="w401" p="n" fr="une/la cause" en="a/the cause" de="eine/die Ursache" es="una/la causa" it="una/la causa"/>
<w id="w402" p="n" fr="un/le but" en="a/the purpose" de="ein/der Zweck" es="un/el propósito" it="un/lo scopo"/>
<w id="w403" p="n" fr="un/le exemple" en="an/the example" de="ein/das Beispiel" es="un/el ejemplo" it="un/esempio"/>
<w id="w404" p="n" fr="une/la erreur" en="an/the error" de="ein/der Fehler" es="un/el error" it="un/errore"/>
<w id="w405" p="n" fr="une/la vérité" en="the true" de="die Wahrheit" es="la verdad" it="la verità"/>
<w id="w406" p="n" fr="un/le système" en="a/the system" de="ein/das System" es="un/el sistema" it="un/il sistema"/>
</sub>
<sub id="9.2" name="Qualités">
<w id="w407" p="a" fr="bon" en="good" de="gut" es="bueno" it="buono"/>
<w id="w408" p="a" fr="mauvais" en="bad" de="schlecht" es="malo" it="cattivo"/>
<w id="w409" p="a" fr="grand" en="great/tall" de="groß" es="grande" it="grande"/>
<w id="w410" p="a" fr="petit" en="small" de="klein" es="pequeño" it="piccolo"/>
<w id="w411" p="a" fr="nouveau" en="new" de="neu" es="nuevo" it="nuovo"/>
<w id="w412" p="a" fr="vieux" en="old" de="alt" es="viejo" it="vecchio"/>
<w id="w413" p="a" fr="beau" en="beautiful" de="schön" es="hermoso" it="bello"/>
<w id="w414" p="a" fr="laid (contraire)" en="ugly" de="hässlich" es="feo" it="brutto"/>
<w id="w415" p="a" fr="fort" en="strong" de="stark" es="fuerte" it="forte"/>
<w id="w416" p="a" fr="faible" en="feeble" de="schwach" es="débil" it="debole"/>
<w id="w417" p="a" fr="dur" en="hard" de="hart" es="duro" it="duro"/>
<w id="w418" p="a" fr="doux" en="soft" de="weich" es="suave" it="morbido"/>
<w id="w419" p="a" fr="rapide" en="quick" de="schnell" es="rápido" it="veloce"/>
<w id="w420" p="a" fr="lent" en="slow" de="langsam" es="lento" it="lento"/>
<w id="w421" p="a" fr="chaud" en="warm/hot" de="warm" es="caliente" it="caldo"/>
<w id="w422" p="a" fr="froid" en="cold" de="kalt" es="frío" it="freddo"/>
<w id="w423" p="a" fr="sec" en="dry" de="trocken" es="seco" it="secco"/>
<w id="w424" p="a" fr="mouillé" en="wet" de="nass" es="mojado" it="bagnato"/>
<w id="w425" p="a" fr="plein" en="full" de="voll" es="lleno" it="pieno"/>
<w id="w426" p="a" fr="vide (contraire)" en="empty" de="leer" es="vacío" it="vuoto"/>
<w id="w427" p="a" fr="propre" en="clean" de="sauber" es="limpio" it="pulito"/>
<w id="w428" p="a" fr="sale" en="dirty" de="schmutzig" es="sucio" it="sporco"/>
<w id="w429" p="a" fr="facile" en="simple" de="einfach" es="fácil" it="facile"/>
<w id="w430" p="a" fr="difficile" en="hard" de="schwer" es="difícil" it="difficile"/>
<w id="w431" p="a" fr="juste" en="right" de="richtig" es="correcto" it="giusto"/>
<w id="w432" p="a" fr="faux" en="false" de="falsch" es="falso" it="falso"/>
</sub>
<sub id="9.3" name="Couleurs">
<w id="w433" p="a" fr="noir" en="black" de="schwarz" es="negro" it="nero"/>
<w id="w434" p="a" fr="blanc" en="white" de="weiß" es="blanco" it="bianco"/>
<w id="w435" p="a" fr="rouge" en="red" de="rot" es="rojo" it="rosso"/>
<w id="w436" p="a" fr="bleu" en="blue" de="blau" es="azul" it="blu"/>
<w id="w437" p="a" fr="vert" en="green" de="grün" es="verde" it="verde"/>
<w id="w438" p="a" fr="jaune" en="yellow" de="gelb" es="amarillo" it="giallo"/>
<w id="w439" p="a" fr="brun" en="brown" de="braun" es="marrón" it="marrone"/>
<w id="w440" p="a" fr="gris" en="gray" de="grau" es="gris" it="grigio"/>
</sub>
</cat>

</vocab>
```

Counts: BASIQUE=62, ESPACE&TEMPS=62, HUMAIN=64, MAISON=53, NATURE=46, SOCIÉTÉ=34, COMMUNICATION=32, SCIENCES=41, PENSÉE=46. Total = **440**. Unit test in `lib/data/words.spec.ts` must assert.

---

## 6 · DESIGN SYSTEM

```css
--bg: #0e0920;          /* Midnight Violet */
--surface: #1c1e2a;     /* Shadow Grey */
--text: #f2effb;        /* Lavender Mist */
--action: #34d399;      /* Emerald */
--reward: #ef5778;      /* Bubblegum Pink */
--score-red: #ef4444;
--score-yellow: #facc15;
--score-green: #34d399;
--score-blue: #38bdf8;
```

- Font: **Inter** 400/500/600/700/800. Tabular nums on counters.
- Icons: Lucide (UI) + custom SVG (ranks ×19, coins ×4 lang tints, chests ×3, flames ×16, cat icons ×9, badges).
- Motion: spring `damping:20 stiffness:300`. Card flip 600ms. Chest roulette GSAP ~4s. Rank-up full-screen takeover + Bubblegum Pink confetti.
- A11y: WCAG AA. `prefers-reduced-motion` kills confetti, simplifies flame, instant flip. Keyboard: Space=flip, ←=wrong, →=right.

---

## 7 · AUTH & SYNC

### Flow
1. `/login`: Google + email/pwd + "Continuer en invité".
2. Signup: `handle` (unique, immutable, regex `^[a-z0-9_]{3,20}$`) + `display_name` (editable). Photo upload optional (no forced crop, compress server-side to max 512×512).
3. Email path requires verification before play.
4. Guest: local-only, 0 starter coins, no leaderboard, chests via local RNG.
5. Guest→Signup: merge local→cloud on first auth (kept local data).

### Realtime
- Supabase Realtime channels per `(user_id, lang)`.
- **Single-session lock**: write `active_session_id` on login. Conflict → second device shows modal "Session déjà ouverte ailleurs" + blocks input.

### Offline
- Service worker caches shell.
- Mutations queued in IndexedDB outbox → flush on reconnect (last-write-wins).

---

## 8 · SECURITY
- All XP/coin/shard/inventory mutations via Supabase RPCs:
  - `award_xp(lang, amount, source)` validates source bounds.
  - `spend_coins(lang, amount, item)` checks balance + item validity.
  - `open_chest(lang, type)` server rolls RNG, applies booster luck mult, writes inventory + dup→shards. Returns item.
  - `open_bonus_chest(lang)` shards-only RPC.
  - `claim_quest(lang, quest_id)` validates progress.
  - `claim_daily_login()` computes cycle + reward server-side.
  - `set_active_session(session_id)` single-session lock.
- RLS on every table.
- Rate limit (Edge Function gate): 60 req/min/user on RPCs.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only).

---

## 9 · SCREENS

| Route | Content |
|---|---|
| `/login` | Email+pwd, Google, guest btn. Signup: handle picker + display_name. |
| `/home` | 4 lang tiles 2×2: flag, name (Anglais/Allemand/Espagnol/Italien), rank crest, words-mastered bar (mastered/440). **No coin shown.** Top-right: profile btn + leaderboard btn (logged in only). |
| `/[lang]` layout | Fixed header: rank crest + cumulative-XP-to-next-tier bar + lang coin counter. Tabs: Leçon/Quiz/Quêtes/Boutique. |
| `/[lang]/lesson` | Accordion cat→subcat→word. Locked subcats: dimmed + word count + 🔒. Each word row: FR | target | speaker btn | score chip. Btn "Révision du jour" → mini-mode. |
| `/[lang]/quiz` | Card center. TL: flame + streak#. TR: session card# + cumulative session coins. Bottom: stats btn (winrate graph modal, per-session, resets on exit). Focus-mode toggle icon. After flip: ✅/❌. Milestone anim @10/25/50/100. |
| `/[lang]/quests` | 3 daily + 5 weekly cards. Progress bars, reward chips, claim btn. Reset countdown. |
| `/[lang]/shop` | Sub-tabs Skins/Thèmes. Top: 3 chest cards (Common/Rare/Legendary) + drop tables expandable. Bonus chest tile (shards). Inventory grid below, equipped highlighted, "(possédé)" dimmed. |
| `/profile` | Photo (upload, default random gradient), handle (read-only), display_name (editable), showcase_lang picker → displays rank crest + flag. 3 pinned achievements + full grid. Per-lang stats: cards seen, accuracy %, time spent, max streak, words mastered, rank. |
| `/leaderboard` | Lang switcher. Top 100 + user-window (±3). Row: rank #, photo, display_name, handle, rank crest, XP. `(moi)` on user row. |

Daily login pop-up: shows on first app launch each day, displays day# + cycle reward + Claim btn.

---

## 10 · DEPLOYMENT
- GitHub repo → Vercel auto-deploy on `main`. Preview deploys on PRs.
- Supabase free tier. Migrations via Supabase CLI: `supabase db push`.
- Env vars synced via Vercel dashboard.

---

## 11 · STATUS DASHBOARD

Legend: 🟦 todo · 🟧 in-progress · 🟩 done · 🟥 blocked · 💡 post-MVP idea

### Phase 1 — Foundation
- 🟩 Init Next.js + TS + Tailwind + pnpm (manual scaffold; `create next-app` rejected due to pre-existing CLAUDE.md)
- 🟩 Repo + Vercel + Supabase provisioned (see §14)
- 🟩 Design tokens (palette, fonts, spacing) → `app/globals.css`
- 🟩 UI primitives (Button, Modal, Card, ProgressBar, Toast, Tabs, Input) → `components/ui/`
- 🟩 Supabase schema + RLS + RPCs → `supabase/migrations/0001_init.sql` (migration applied to remote, all 5 tables RLS-enabled)
- 🟩 Auth screens (login/signup/guest) → `app/(auth)/{login,signup}/page.tsx` + `app/auth/callback/route.ts`
- 🟩 Profile creation (handle + display_name) — photo upload via Supabase Storage (bucket `avatars` needs manual creation, see §15)
- 🟩 Layout shell + nav → `app/(app)/layout.tsx`, `app/(app)/[lang]/layout.tsx`
- 🟩 Home page 4 lang tiles → `app/(app)/home/page.tsx`
- 🟩 Zustand stores + IndexedDB persist → `lib/stores/{authStore,langStore}.ts` (Map serialization fix in `partialize`/`onRehydrateStorage`)
- 🟧 Local↔remote sync — pull on mount works via Supabase RLS; **outbox / realtime / last-write-wins NOT yet implemented**
- 🟧 PWA manifest done (`public/manifest.json`); **service worker / next-pwa config NOT yet wired** (was scoped out of bootstrap)

### Phase 2 — Core Gameplay
- 🟩 Vocab dataset (`lib/data/words.ts`, 440 words × 4 langs; tests pass: 8/8 in `words.spec.ts`)
- 🟩 Lesson tab (accordion, TTS, score chips, locked rows with padlock) → `app/(app)/[lang]/lesson/page.tsx`
- 🟩 Quiz tab (flip, weighted picker, 60/40 direction, self-report) → `app/(app)/[lang]/quiz/page.tsx`
- 🟩 Score engine (4 start, ±1/−2, color tiers) → `lib/game/score.ts`
- 🟩 Streak module (16 stages, flame) → `lib/game/prob.ts::getStreakStage`
- 🟩 Session coin counter (cumulative N) — handled in quiz page state
- 🟩 XP + rank engine (19 tiers, exp curve, promotion popup) → `lib/game/rank.ts` + `components/game/RankUpModal.tsx`
- 🟩 Lang coin counter header → `app/(app)/[lang]/layout.tsx`
- 🟩 Rank-XP progress bar (same file)
- 🟩 Stats modal (Recharts winrate, per-session) → `components/game/StatsModal.tsx`
- 🟧 Unlock token system — backend in `lang_state.unlock_tokens`; **picker UI / spend RPC NOT yet built** (locked-row UI ✅)
- 🟩 Focus mode (toggle in quiz page)
- 🟩 Speed bonus +1 XP <3s (in `lib/game/prob.ts::computeXP`)
- 🟩 Onboarding (3 dummy cards mandatory) → `components/game/OnboardingFlow.tsx`; persisted in `langStore.tutorialDone`

### Phase 3 — Economy & Retention
- 🟧 Quests engine — defs in `lib/game/quests.ts` (9 quest types); **event hooks / progress increment NOT yet wired**
- 🟦 Quest reset cron (Edge Function) — pg_cron job declared in migration, **needs Edge Function for resetting `quest_state` rows**
- 🟩 Shop UI (Skins/Thèmes sub-tabs) → `app/(app)/[lang]/shop/page.tsx`
- 🟩 3 chest types (RPC RNG, drop tables, roulette anim, reveal) — RPC `open_chest` + `ChestOpenModal.tsx`
- 🟩 Inventory + equip — RPC writes to `lang_state.inventory_*`
- 🟩 Duplicate → shards — handled inside `open_chest` RPC
- 🟩 Bonus chest (shards-only) — RPC `open_bonus_chest`
- 🟦 30 skins + 30 themes — catalog descriptors NOT yet created (`lib/data/{skins,themes}.ts` missing)
- 🟧 Daily login reward — RPC `claim_daily_login` ✅, `DailyLoginModal.tsx` ✅; **needs first-launch-of-day detection on client**
- 🟦 Daily challenge card (5 weakest, 5× XP) — NOT yet implemented
- 🟩 Daily review mini-mode → `components/game/DailyReviewModal.tsx`
- 🟩 Fragile-mastery decay — pg_cron job in migration (00:05 UTC daily)
- 🟧 Booster system — types defined in `lib/supabase/types.ts::Booster`, `BoosterMap`; **runtime application in XP/coin calcs NOT yet wired client-side**

### Phase 4 — Social & Profile
- 🟩 Leaderboard → `app/(app)/leaderboard/page.tsx` + RPC `refresh_leaderboard` + materialized view
- 🟩 Profile (photo upload, stats, showcase_lang picker) → `app/(app)/profile/page.tsx`; **pinned achievements UI present but achievement-unlock engine NOT yet built**
- 🟦 Achievements engine + hooks + pop-up notifications — NOT yet implemented (table exists, no logic)
- 🟦 Single-session lock — column `profiles.active_session_id` exists + RPC `set_active_session` ✅; **client realtime listener / conflict modal NOT yet built**

### Phase 5 — Polish & Assets
- 🟦 19 rank crest SVGs (currently colored text badges via `RANK_COLORS`)
- 🟦 4 coin variants (per lang tint) — currently emoji 🪙
- 🟦 3 chest assets + open VFX — currently emoji 🎁
- 🟦 9 category icons — currently emoji from spec
- 🟦 16 flame stage assets — currently emoji 🔥
- 🟦 Achievement badges
- 🟦 SFX library (flip, right, wrong, coin, chest roulette, rank-up, quest claim, daily reward) — Howler installed, no sound files
- 🟩 Confetti + rank-up popup → `RankUpModal.tsx` (30 div-based confetti)
- 🟧 Milestone anims (10/25/50/100) — milestone detect ✅ in quiz page; **dedicated anim component NOT yet built**
- 🟦 Reduced-motion + a11y pass
- 🟦 Mobile QA (iOS Safari, Android Chrome)
- 🟦 Lighthouse > 90 all categories

### Post-MVP 💡
- 💡 Phonetic IPA toggle
- 💡 Example sentences per word
- 💡 Typing-mode quiz
- 💡 Friends + friend leaderboards
- 💡 Avatar customizer
- 💡 SM-2 spaced repetition layer
- 💡 More langs (PT, NL, JP)
- 💡 Server-side anti-cheat heuristics

---

## 12 · ACTION PLAN (follow in order)

> Each step = ≥1 commit. Mark 🟧 start, 🟩 merge. Update §11 every step.

### S1 — Bootstrap 🟩 (commit `10d2aec`)
Manual scaffold (create-next-app refused due to pre-existing `CLAUDE.md`). All deps installed via `pnpm` (binary lives at `~/.npm-global/node_modules/.bin/pnpm`). Supabase project provisioned. `.env.local` filled. Repo pushed to `https://github.com/nefry5/VocUp` and Vercel project linked. See §14 for full IDs.

Additional commits since bootstrap:
- `90950e3` — fix(db): declare v_lang + use FOREACH in `claim_daily_login` (Postgres syntax fix)
- `389727e` — Next.js 15.1.8 → 15.1.11 (CVE-2025-66478 patch, auto-merged from Vercel security bot branch `vercel/react-server-components-cve-vu-fs5644`)

### S2 — Tokens + UI primitives 🟩 (in `10d2aec`)
Done. `app/globals.css` CSS vars + flip utilities. `components/ui/{Button,Card,Modal,ProgressBar,Toast,Tabs,Input}.tsx`.

### S3 — Supabase schema 🟩 (in `10d2aec`, fixed in `90950e3`)
Done. `supabase/migrations/0001_init.sql` applied to remote. 5 tables + materialized view, RLS on all, 8 RPCs (`award_xp`, `spend_coins`, `open_chest`, `open_bonus_chest`, `claim_quest`, `claim_daily_login`, `set_active_session`, `refresh_leaderboard`). pg_cron jobs for decay + leaderboard refresh.

### S4 — Auth 🟩 (in `10d2aec`)
Done for email/password + guest. Google OAuth provider NOT yet enabled in Supabase dashboard (skip until needed).

### S5 — Stores + sync 🟧
Stores ✅ (`lib/stores/{authStore,langStore}.ts` with IndexedDB persist via Zustand). **Sync layer missing**: no `lib/sync/` directory, no outbox, no realtime subscribe, no last-write-wins. Writes currently go directly to Supabase from page handlers. Build this next when you wire mutations through a sync queue.

### S6 — Vocab data 🟩 (in `10d2aec`)
Done. `lib/data/words.ts` (440 entries). Tests `lib/data/words.spec.ts` (8/8 passing).

### S7 — Home 🟩 (in `10d2aec`)

### S8 — Lang layout + header 🟩 (in `10d2aec`)

### S9 — Lesson 🟩 (in `10d2aec`)

### S10 — Quiz core 🟩 (in `10d2aec`)

### S11 — Rank engine 🟩 (in `10d2aec`)

### S12 — Subcat unlock 🟦 — NEXT
Token counter UI + picker modal NOT yet built. Spend RPC also missing (need to add `spend_unlock_token(p_lang, p_subcat_id)` to migration 0002). UI to be added inside lesson page (locked subcat row → "Débloquer (1 token)" button).

### S13 — Stats + focus 🟩 (in `10d2aec`)

### S14 — Onboarding 🟩 (in `10d2aec`)

### S15 — Quests 🟧
Definitions ✅ (`lib/game/quests.ts`). RPC `claim_quest` ✅. **Missing**: event hooks (call after each card answered to increment `quest_state.progress`), quest tab integration with claim button, Edge Function cron for resets (declared in pg_cron but resets are no-ops without periodic row writes).

### S16 — Shop + chests 🟩 (in `10d2aec`)
RPC + UI + modal all in place. GSAP roulette is currently simple Framer rotation — upgrade to real GSAP timeline if desired.

### S17 — Cosmetics catalog 🟦
Missing files: `lib/data/skins.ts` + `lib/data/themes.ts` with 30 items each. Currently `inventory_skins[]` references item_ids that don't resolve to visuals. Define catalog → wire CSS var swap in `[lang]/layout.tsx`.

### S18 — Daily systems 🟧
Login popup `DailyLoginModal.tsx` ✅. RPC `claim_daily_login` ✅. **Missing**: first-launch-of-day client detection (currently never fires), daily challenge card (no UI/logic), client-side booster runtime application in `lib/game/prob.ts::computeXP` (params are accepted but never set).

### S19 — Profile + achievements 🟧
Profile page ✅ (incl. photo upload to Supabase Storage — note: bucket `avatars` must be manually created with public read policy; see §15). **Missing**: achievements engine — no event hooks, no `unlock_achievement` RPC, no pop-up notifications. Pinned-achievements grid renders but always empty.

### S20 — Leaderboard 🟩 (in `10d2aec`)

### S21 — Single-session lock 🟦
RPC ✅, column ✅. **Missing**: client subscription to `profiles.active_session_id` via Supabase Realtime + conflict modal.

### S22 — Assets pass 🟦
All visual assets currently emoji or text. No SFX sound files.

### S23 — PWA + polish 🟦
`public/manifest.json` ✅. `next-pwa` installed but not configured in `next.config.ts`. Service worker not generated.

### S24 — QA + ship 🟦

---

## 13 · CONVENTIONS
- TS strict, no `any` w/o comment.
- React Server Components default. `'use client'` only when state/effects needed.
- Server actions for mutations where possible; RPC for game logic.
- Component file = one default export + co-located types.
- Tailwind utility-first; extract to component on 3+ reuses.
- File names: `kebab-case.tsx`. Components: `PascalCase`.
- Commit: `<type>(<scope>): <subject>` (feat/fix/chore/refactor/test/docs).
- No `console.log` in committed code (lint rule).

---

## 14 · INFRASTRUCTURE STATE (live as of 2026-05-25)

### 14.1 GitHub
- **Repo:** `https://github.com/nefry5/VocUp` (public)
- **Owner:** `nefry5` (account email `vin100rom1@gmail.com`)
- **Default branch:** `main`
- **Push auth:** `gh` CLI installed and authenticated via web OAuth. `git push` works without typing tokens. (Old PAT `ghp_KvTsBb...` was rotated/deleted from GitHub settings after being leaked in chat.)
- **Active branches at HEAD:**
  - `main` → `be758ef` (production; see §14.7 for full log)
  - `vercel/react-server-components-cve-vu-fs5644` → already merged into `main` via fast-forward, branch can be deleted

### 14.2 Supabase
- **Project ID / Ref:** `vjgllnqmjauxanfrwfzj`
- **Organization ID:** `tvvnlniwcxnasdzrkazz`
- **URL:** `https://vjgllnqmjauxanfrwfzj.supabase.co`
- **Region:** `eu-west-3` (Paris)
- **Postgres:** 17.6.1.121
- **Status:** `ACTIVE_HEALTHY`
- **Created:** 2026-05-24
- **Migrations applied:**
  - `0001_init` — schema + RLS + 8 RPCs + pg_cron jobs
  - `0002_avatars_storage_bucket` — avatars bucket + per-user write policies
- **Tables (all RLS-enabled, 0 rows currently):** `profiles`, `lang_state`, `word_scores`, `quest_state`, `achievements`
- **Materialized view:** `leaderboard_view`
- **RPCs:** `award_xp`, `spend_coins`, `open_chest`, `open_bonus_chest`, `claim_quest`, `claim_daily_login`, `set_active_session`, `refresh_leaderboard`
- **Auth providers enabled:** Email/password (with email confirmation). Google OAuth NOT yet configured.
- **Storage buckets:** `avatars` ✅ (public read, 2MB cap, image MIME only, per-user folder isolation on writes via `(storage.foldername(name))[1] = auth.uid()::text`).
- **Local link:** `supabase/.temp/project-ref` (CLI-linked via `supabase link --project-ref vjgllnqmjauxanfrwfzj`). DB password stored in macOS keychain. To push schema changes: `supabase db push`.

### 14.3 Vercel
- **Team:** `nefrychonchs-projects` (slug)
- **Team ID:** `team_XsI6YDbrRp6IYYIPGtfQTdmy`
- **Project name:** `vocup`
- **Project ID:** `prj_lBk0xoEmDnd61CwYcYpiuTkpU0Oh`
- **Production URL:** `https://vocup-app.vercel.app`
- **Branch alias:** `vocup-git-main-nefrychonchs-projects.vercel.app`
- **Latest production deploy:** `dpl_7xqAY7m3UCZw4QZN3hQnrUQaRx3G` (state READY, commit `389727e`)
- **Framework:** Next.js (auto-detected), Node lambda runtime
- **Auto-deploy:** On push to `main` ✅
- **Inspector URL:** `https://vercel.com/nefrychonchs-projects/vocup`

### 14.4 Environment variables

**Set in BOTH `.env.local` (local dev) AND Vercel dashboard (production):**

| Name | Source | Sensitive |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vjgllnqmjauxanfrwfzj.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings → API → "anon public" | No (RLS protects) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API → "service_role" (Reveal button) | **YES — never paste in chat, never commit** |

`.env.local` is gitignored. Service role key currently lives only in: (a) Supabase dashboard, (b) Vercel project env vars, (c) local `.env.local`. If exposed anywhere else, rotate immediately via Supabase Settings → API → "Reset service_role".

### 14.5 Supabase Auth → URL Configuration ✅ DONE
Already set in Supabase Dashboard → Authentication → URL Configuration:
- **Site URL:** `https://vocup-app.vercel.app`
- **Redirect URLs (allow-list):**
  - `https://vocup-app.vercel.app/auth/callback`
  - `https://vocup-app.vercel.app/**`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/**`

### 14.6 Local dev
```bash
# inside vocup_site/
~/.npm-global/node_modules/.bin/pnpm dev    # http://localhost:3000
~/.npm-global/node_modules/.bin/pnpm exec next build   # production build sanity check
~/.npm-global/node_modules/.bin/pnpm exec vitest run   # 8/8 vocab tests
```

User's pnpm is not on PATH — always use the full path above. Or symlink it once: `ln -s ~/.npm-global/node_modules/.bin/pnpm /usr/local/bin/pnpm`.

### 14.7 Commit log (newest first)
- `be758ef` — feat(storage): avatars bucket with per-user write isolation
- `daba09d` — docs(claude): update status, action plan, add infra/known-issues/resume sections
- `389727e` — Fix React Server Components CVE vulnerabilities (Next 15.1.8 → 15.1.11, auto-merged from Vercel security bot)
- `90950e3` — fix(db): declare v_lang and use FOREACH in claim_daily_login
- `10d2aec` — chore: bootstrap VocUp v1 (initial 57-file scaffold)

---

## 15 · KNOWN ISSUES (address before public launch)

### 15.1 Supabase advisors (from `get_advisors` security lint, 2026-05-25)

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | WARN | `function_search_path_mutable` on all 8 RPCs | Add `SET search_path = ''` to each `CREATE FUNCTION` body and prefix all table references with `public.` (most already prefixed). Bundle into migration `0002_harden_rpcs.sql`. |
| 2 | WARN | `materialized_view_in_api` on `leaderboard_view` | Either move view to a private schema and create a wrapper SECURITY DEFINER function, OR revoke `SELECT` from `anon`/`authenticated` and only access via `refresh_leaderboard` RPC. |
| 3 | WARN | `anon_security_definer_function_executable` + `authenticated_security_definer_function_executable` on all 8 RPCs | **Expected by design** — game RPCs must be SECURITY DEFINER to bypass RLS for controlled mutations. Each RPC starts with `IF auth.uid() IS NULL THEN RAISE EXCEPTION` so anon cannot actually mutate. Safe to ignore; document acceptance in `0002_harden_rpcs.sql` comments. |
| 4 | WARN | `auth_leaked_password_protection` disabled | Supabase Dashboard → Authentication → Policies → toggle "Leaked Password Protection" ON (uses HaveIBeenPwned). |

### 15.2 Missing infra prerequisites
- ~~**Avatar bucket**~~ ✅ done (migration `0002_avatars_storage_bucket`).
- **Google OAuth:** if you want the "Continue with Google" button on login to work, configure provider in Supabase Dashboard → Authentication → Providers → Google (need Google Cloud OAuth client ID + secret). Until then, login page's Google button errors silently.
- **`favicon.ico`:** none in `public/`. Requests for `/favicon.ico` get caught by `[lang]` dynamic route and redirect to `/favicon.ico/lesson`. Cosmetic only. Drop a `favicon.ico` into `public/` to fix.

### 15.3 Code-level TODOs
- `lib/supabase/types.ts` uses `Database = any` to dodge Supabase generic complexity. Fine for now, but lose type safety on `.from()` calls. Regenerate types with `supabase gen types typescript --linked > lib/supabase/db.types.ts` when convenient.
- `react-hooks/exhaustive-deps` warnings in `app/(app)/[lang]/quiz/page.tsx:59` and `components/game/DailyReviewModal.tsx:37` — non-blocking; revisit when polishing.
- No `console.log` rule is set to **error** in `.eslintrc.json` — debugging requires using `console.warn`/`console.error` or temporarily disabling per-line.
- `pnpm install` shows `next-pwa` peer dep mismatch (next-pwa expects Next 13/14, we run 15). Not blocking but PWA wiring (S23) will likely need a workaround or an updated alternative (e.g., `@serwist/next`).

### 15.4 Open security tasks
- Rate-limit RPCs (60 req/min/user per spec §8) — NOT yet implemented. Need Supabase Edge Function gate OR Postgres `pg_rate_limit`.
- Single-session lock client-side — see S21.
- Email verification — Supabase setting ON by default; verify in dashboard before launch.

---

## 16 · RESUMING IN A NEW CHAT (for the next AI)

### 16.1 What you have
- **MCP tools connected:** Vercel (`mcp__046bf9d6...`) + Supabase (`mcp__61af4e80...`). You can list projects, deploy, apply migrations, run SQL, fetch logs without asking the user to copy/paste from dashboards.
- **Skills enabled.** Use freely.
- **Git auth:** macOS keychain holds GitHub credentials. `git push` should "just work" from the project directory. If it fails with 401, the cached token has been rotated — ask the user for a new one or get them to install `gh` CLI.
- **Supabase CLI linked** to project `vjgllnqmjauxanfrwfzj`. `supabase db push` applies new migrations.
- **User is non-technical.** Walk through any required dashboard clicks in numbered steps. Never assume they know CLI conventions. Always specify the full pnpm path.

### 16.2 First things to verify on a fresh session
```bash
# from vocup_site/
git status                                                       # working tree clean?
git log --oneline -5                                             # what's the HEAD commit?
~/.npm-global/node_modules/.bin/pnpm exec next build             # does it still build?
~/.npm-global/node_modules/.bin/pnpm exec vitest run             # do tests pass?
```
Then via MCP:
- `mcp__61af4e80...__list_migrations` — confirm 0001_init applied
- `mcp__61af4e80...__get_advisors` (type: security) — fresh warning list
- `mcp__046bf9d6...__list_deployments` (project `prj_lBk0xoEmDnd61CwYcYpiuTkpU0Oh`, team `team_XsI6YDbrRp6IYYIPGtfQTdmy`) — last deploy state

### 16.3 Recommended next sequence
1. **Harden DB advisors (§15.1)** → migration `0003_harden_rpcs.sql` adding `SET search_path = ''` to all 8 RPCs + lock down `leaderboard_view`. Apply via MCP `apply_migration`. Re-run `get_advisors` to confirm clean.
2. **Sync layer (S5 finish)** — outbox + last-write-wins. Required before any feature mutates `lang_state` outside existing RPCs.
3. **Subcat unlock (S12)** — UI + new RPC `spend_unlock_token` (migration 0004).
4. **Quests event hooks (S15 finish)** — wire `quest_state.progress` increments to quiz/chest/coin events.
5. **Achievements engine (S19 finish)** — table exists, need event hooks + `unlock_achievement` RPC + toast notifications.
6. **Daily challenge card (S18 finish)** + first-launch-of-day detection for `DailyLoginModal`.
7. **PWA wiring (S23)** — switch from `next-pwa` (Next 13/14 only) to `@serwist/next`.
8. **Asset pass (S22)** — replace all emoji with proper SVG/SFX. Source from licence-free packs (Lucide, Heroicons, OpenGameArt).
9. **Google OAuth provider** + login button activation.
10. **Single-session lock (S21)** — client realtime listener + conflict modal.

### 16.4 Conventions (also see §13)
- Caveman mode is the user's preference for chat ("stop caveman" / "normal mode" toggles). Code, commits, security messages: write normal English.
- Always commit with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
- Never push to `main` with `--force`. Never bypass hooks with `--no-verify` unless user explicitly asks.
- Vercel auto-deploys `main`. Vercel security bot may open PRs on branches like `vercel/*-cve-*` — diff-check before merging.

---

*End. Update STATUS DASHBOARD (§11), ACTION PLAN (§12), and INFRASTRUCTURE STATE (§14) on every meaningful change. Spec sections §1–§10, §13 frozen unless explicit change request.*
