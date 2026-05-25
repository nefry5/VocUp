-- VocUp — Initial schema
-- Run: supabase db push

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ──────────────────────────────────────────────────────────────────
-- TABLES
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  handle          text UNIQUE NOT NULL CHECK (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name    text NOT NULL DEFAULT '',
  photo_url       text,
  showcase_lang   text CHECK (showcase_lang IN ('en','de','es','it')),
  pinned_achievements text[] DEFAULT '{}',
  active_session_id uuid,
  daily_login_streak  int NOT NULL DEFAULT 0,
  last_login_day  date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lang_state (
  user_id         uuid REFERENCES auth.users ON DELETE CASCADE,
  lang            text NOT NULL CHECK (lang IN ('en','de','es','it')),
  xp              int NOT NULL DEFAULT 0,
  coins           int NOT NULL DEFAULT 100,
  shards          int NOT NULL DEFAULT 0,
  unlock_tokens   int NOT NULL DEFAULT 0,
  rank_tier       int NOT NULL DEFAULT 0 CHECK (rank_tier BETWEEN 0 AND 19),
  active_skin_id  text,
  active_theme_id text,
  inventory_skins     text[] DEFAULT '{}',
  inventory_themes    text[] DEFAULT '{}',
  unlocked_subcats    text[] DEFAULT ARRAY['1.1','1.2','1.3','1.4'],
  max_streak          int NOT NULL DEFAULT 0,
  total_cards         int NOT NULL DEFAULT 0,
  correct_cards       int NOT NULL DEFAULT 0,
  time_spent_s        int NOT NULL DEFAULT 0,
  active_boosters     jsonb NOT NULL DEFAULT '{}',
  daily_challenge     jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, lang)
);

CREATE TABLE public.word_scores (
  user_id     uuid REFERENCES auth.users ON DELETE CASCADE,
  lang        text NOT NULL CHECK (lang IN ('en','de','es','it')),
  word_id     text NOT NULL,
  score       int NOT NULL DEFAULT 4 CHECK (score BETWEEN 0 AND 10),
  last_seen_at timestamptz,
  PRIMARY KEY (user_id, lang, word_id)
);

CREATE TABLE public.quest_state (
  user_id     uuid REFERENCES auth.users ON DELETE CASCADE,
  lang        text NOT NULL CHECK (lang IN ('en','de','es','it')),
  quest_id    text NOT NULL,
  period      text NOT NULL CHECK (period IN ('daily','weekly')),
  period_key  text NOT NULL,
  progress    int NOT NULL DEFAULT 0,
  claimed     bool NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, lang, quest_id, period_key)
);

CREATE TABLE public.achievements (
  user_id         uuid REFERENCES auth.users ON DELETE CASCADE,
  achievement_id  text NOT NULL,
  unlocked_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

-- ──────────────────────────────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_word_scores_user_lang ON public.word_scores (user_id, lang);
CREATE INDEX idx_quest_state_user_lang ON public.quest_state (user_id, lang);
CREATE INDEX idx_lang_state_xp ON public.lang_state (lang, xp DESC);

-- ──────────────────────────────────────────────────────────────────
-- LEADERBOARD VIEW
-- ──────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.leaderboard_view AS
  SELECT
    ls.user_id,
    ls.lang,
    p.handle,
    p.display_name,
    p.photo_url,
    ls.xp,
    ls.rank_tier
  FROM public.lang_state ls
  JOIN public.profiles p ON p.id = ls.user_id;

CREATE UNIQUE INDEX idx_leaderboard_user_lang ON public.leaderboard_view (user_id, lang);
CREATE INDEX idx_leaderboard_lang_xp ON public.leaderboard_view (lang, xp DESC);

-- ──────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lang_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- profiles: own full access + others can read public fields
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "profiles_public_read" ON public.profiles
  FOR SELECT USING (true);

-- lang_state: own only
CREATE POLICY "lang_state_own" ON public.lang_state
  FOR ALL USING (auth.uid() = user_id);

-- word_scores: own only
CREATE POLICY "word_scores_own" ON public.word_scores
  FOR ALL USING (auth.uid() = user_id);

-- quest_state: own only
CREATE POLICY "quest_state_own" ON public.quest_state
  FOR ALL USING (auth.uid() = user_id);

-- achievements: own full, others can read
CREATE POLICY "achievements_own" ON public.achievements
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "achievements_public_read" ON public.achievements
  FOR SELECT USING (true);

-- ──────────────────────────────────────────────────────────────────
-- RPCs
-- ──────────────────────────────────────────────────────────────────

-- award_xp: validate source, apply booster, check promotion
CREATE OR REPLACE FUNCTION public.award_xp(
  p_lang text,
  p_amount int,
  p_source text  -- 'quiz'|'quest'|'daily_challenge'|'speed_bonus'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state public.lang_state;
  v_boosted int;
  v_old_tier int;
  v_new_tier int;
  v_xp_thresholds int[] := ARRAY[
    593, 1276, 2060, 2965, 4010, 5215, 6601, 8194, 10024, 12124,
    14530, 17284, 20431, 24024, 28122, 32794, 38119, 44183, 50000
  ];
  v_promoted bool := false;
  v_tokens_granted int := 0;
BEGIN
  -- Validate source
  IF p_source NOT IN ('quiz','quest','daily_challenge','speed_bonus') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  -- Validate amount
  IF p_amount < 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT * INTO v_state FROM public.lang_state
  WHERE user_id = v_user_id AND lang = p_lang;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lang_state_not_found';
  END IF;

  -- Apply XP booster if active
  v_boosted := p_amount;
  IF v_state.active_boosters ? 'xp' THEN
    DECLARE v_until timestamptz;
    BEGIN
      v_until := (v_state.active_boosters->'xp'->>'until')::timestamptz;
      IF v_until > now() THEN
        v_boosted := v_boosted * (v_state.active_boosters->'xp'->>'mult')::int;
      END IF;
    END;
  END IF;

  v_old_tier := v_state.rank_tier;

  -- Update XP
  UPDATE public.lang_state
  SET xp = xp + v_boosted
  WHERE user_id = v_user_id AND lang = p_lang;

  -- Check promotions
  SELECT rank_tier, xp + v_boosted INTO v_new_tier, v_state.xp
  FROM public.lang_state WHERE user_id = v_user_id AND lang = p_lang;

  DECLARE v_new_xp int;
  BEGIN
    v_new_xp := v_state.xp + v_boosted;
    WHILE v_new_tier < 19 AND v_new_xp >= v_xp_thresholds[v_new_tier + 1] LOOP
      v_new_tier := v_new_tier + 1;
      v_promoted := true;
      -- Grant tokens
      IF v_new_tier = 19 THEN
        v_tokens_granted := v_tokens_granted + 5;
      ELSE
        v_tokens_granted := v_tokens_granted + 1;
      END IF;
    END LOOP;
  END;

  IF v_promoted THEN
    UPDATE public.lang_state
    SET rank_tier = v_new_tier,
        unlock_tokens = unlock_tokens + v_tokens_granted
    WHERE user_id = v_user_id AND lang = p_lang;
  END IF;

  RETURN jsonb_build_object(
    'xp_awarded', v_boosted,
    'promoted', v_promoted,
    'new_tier', v_new_tier,
    'tokens_granted', v_tokens_granted
  );
END;
$$;

-- spend_coins: validate balance and item
CREATE OR REPLACE FUNCTION public.spend_coins(
  p_lang text,
  p_amount int,
  p_item text  -- 'common_chest'|'rare_chest'|'legendary_chest'|'bonus_chest'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state public.lang_state;
  v_valid_items text[] := ARRAY['common_chest','rare_chest','legendary_chest'];
  v_prices jsonb := '{"common_chest":100,"rare_chest":500,"legendary_chest":2000}'::jsonb;
  v_expected int;
BEGIN
  IF p_item = ANY(v_valid_items) THEN
    v_expected := (v_prices->>p_item)::int;
    IF p_amount != v_expected THEN
      RAISE EXCEPTION 'invalid_amount';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_item';
  END IF;

  SELECT * INTO v_state FROM public.lang_state
  WHERE user_id = v_user_id AND lang = p_lang;

  IF NOT FOUND OR v_state.coins < p_amount THEN
    RAISE EXCEPTION 'insufficient_coins';
  END IF;

  UPDATE public.lang_state
  SET coins = coins - p_amount
  WHERE user_id = v_user_id AND lang = p_lang;

  RETURN jsonb_build_object('ok', true, 'remaining', v_state.coins - p_amount);
END;
$$;

-- open_chest: RNG + inventory + dup→shards
CREATE OR REPLACE FUNCTION public.open_chest(
  p_lang text,
  p_type text  -- 'common'|'rare'|'legendary'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state public.lang_state;
  v_roll float := random();
  v_item_type text;
  v_is_skin bool := random() < 0.5;
  v_rarity text;
  v_shard_values jsonb := '{"C":5,"R":15,"SR":40,"E":100,"L":250,"Sec":600}'::jsonb;
  v_shards_gained int := 0;
  v_is_dupe bool := false;
  v_item_id text;
  v_luck_mult int := 1;
  v_boosters jsonb;
BEGIN
  -- Get state
  SELECT * INTO v_state FROM public.lang_state
  WHERE user_id = v_user_id AND lang = p_lang;

  -- Check luck booster
  IF v_state.active_boosters ? 'luck' THEN
    DECLARE v_until timestamptz;
    BEGIN
      v_until := (v_state.active_boosters->'luck'->>'until')::timestamptz;
      IF v_until > now() THEN
        v_luck_mult := (v_state.active_boosters->'luck'->>'mult')::int;
      END IF;
    END;
  END IF;

  -- Determine rarity by chest type + roll (luck adjusts weights)
  CASE p_type
    WHEN 'common' THEN
      IF v_roll < (0.70 / v_luck_mult) THEN v_rarity := 'C';
      ELSIF v_roll < (0.70 + 0.25) / v_luck_mult THEN v_rarity := 'R';
      ELSIF v_roll < 0.95 THEN v_rarity := 'SR';
      ELSIF v_roll < 0.99 THEN v_rarity := 'E';
      ELSE v_rarity := 'L';
      END IF;
    WHEN 'rare' THEN
      IF v_roll < (0.70 / v_luck_mult) THEN v_rarity := 'R';
      ELSIF v_roll < (0.70 + 0.25) / v_luck_mult THEN v_rarity := 'SR';
      ELSIF v_roll < 0.95 THEN v_rarity := 'E';
      ELSIF v_roll < 0.99 THEN v_rarity := 'L';
      ELSE v_rarity := 'Sec';
      END IF;
    WHEN 'legendary' THEN
      IF v_roll < (0.70 / v_luck_mult) THEN v_rarity := 'SR';
      ELSIF v_roll < (0.70 + 0.25) / v_luck_mult THEN v_rarity := 'E';
      ELSIF v_roll < 0.95 THEN v_rarity := 'L';
      ELSIF v_roll < 0.99 THEN v_rarity := 'Sec';
      ELSE v_rarity := 'Sec';
      END IF;
    ELSE RAISE EXCEPTION 'invalid_chest_type';
  END CASE;

  -- Pick item type (skin or theme)
  v_item_type := CASE WHEN v_is_skin THEN 'skin' ELSE 'theme' END;
  v_item_id := v_item_type || '_' || v_rarity || '_' || floor(random() * 30 + 1)::text;

  -- Check dupe
  IF v_item_type = 'skin' THEN
    v_is_dupe := v_item_id = ANY(v_state.inventory_skins);
    IF v_is_dupe THEN
      v_shards_gained := (v_shard_values->>v_rarity)::int;
      UPDATE public.lang_state SET shards = shards + v_shards_gained
      WHERE user_id = v_user_id AND lang = p_lang;
    ELSE
      UPDATE public.lang_state
      SET inventory_skins = array_append(inventory_skins, v_item_id)
      WHERE user_id = v_user_id AND lang = p_lang;
    END IF;
  ELSE
    v_is_dupe := v_item_id = ANY(v_state.inventory_themes);
    IF v_is_dupe THEN
      v_shards_gained := (v_shard_values->>v_rarity)::int;
      UPDATE public.lang_state SET shards = shards + v_shards_gained
      WHERE user_id = v_user_id AND lang = p_lang;
    ELSE
      UPDATE public.lang_state
      SET inventory_themes = array_append(inventory_themes, v_item_id)
      WHERE user_id = v_user_id AND lang = p_lang;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'item_id', v_item_id,
    'item_type', v_item_type,
    'rarity', v_rarity,
    'is_dupe', v_is_dupe,
    'shards_gained', v_shards_gained
  );
END;
$$;

-- open_bonus_chest: shards-only, gives a booster
CREATE OR REPLACE FUNCTION public.open_bonus_chest(p_lang text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state public.lang_state;
  v_cost int := 300;
  v_roll float := random();
  v_booster_type text;
  v_mult int;
  v_mult_roll float := random();
  v_boosters jsonb;
  v_until timestamptz := now() + interval '24 hours';
BEGIN
  SELECT * INTO v_state FROM public.lang_state
  WHERE user_id = v_user_id AND lang = p_lang;

  IF NOT FOUND OR v_state.shards < v_cost THEN
    RAISE EXCEPTION 'insufficient_shards';
  END IF;

  -- Booster type (equal 25% each)
  IF v_roll < 0.25 THEN v_booster_type := 'coin';
  ELSIF v_roll < 0.50 THEN v_booster_type := 'luck';
  ELSIF v_roll < 0.75 THEN v_booster_type := 'xp';
  ELSE v_booster_type := 'streak';
  END IF;

  -- Multiplier: ×2=75%, ×3=20%, ×5=5%
  IF v_mult_roll < 0.75 THEN v_mult := 2;
  ELSIF v_mult_roll < 0.95 THEN v_mult := 3;
  ELSE v_mult := 5;
  END IF;

  -- Deduct shards, apply booster (additive stack)
  v_boosters := v_state.active_boosters;
  IF v_boosters ? v_booster_type THEN
    DECLARE v_existing_until timestamptz;
    BEGIN
      v_existing_until := (v_boosters->v_booster_type->>'until')::timestamptz;
      IF v_existing_until > now() THEN
        v_until := v_existing_until + interval '24 hours';
      END IF;
      v_mult := v_mult + (v_boosters->v_booster_type->>'mult')::int;
    END;
  END IF;

  v_boosters := jsonb_set(v_boosters, ARRAY[v_booster_type],
    jsonb_build_object('mult', v_mult, 'until', v_until));

  UPDATE public.lang_state
  SET shards = shards - v_cost, active_boosters = v_boosters
  WHERE user_id = v_user_id AND lang = p_lang;

  RETURN jsonb_build_object(
    'booster_type', v_booster_type,
    'mult', v_mult,
    'until', v_until
  );
END;
$$;

-- claim_quest: validate progress, award rewards
CREATE OR REPLACE FUNCTION public.claim_quest(
  p_lang text,
  p_quest_id text,
  p_period_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_state public.lang_state;
  v_quest public.quest_state;
  v_xp_reward int;
  v_coin_reward int;
  v_mult float;
  v_quest_rewards jsonb := '{
    "daily_cards_20":{"xp":15,"coins":50},
    "daily_cards_50":{"xp":30,"coins":100},
    "daily_streak_10":{"xp":20,"coins":80},
    "daily_earn_500":{"xp":25,"coins":0},
    "daily_master_1":{"xp":30,"coins":60},
    "weekly_cards_200":{"xp":100,"coins":400},
    "weekly_cards_500":{"xp":200,"coins":800},
    "weekly_streak_30":{"xp":150,"coins":500},
    "weekly_earn_5000":{"xp":175,"coins":0},
    "weekly_winrate_80_100":{"xp":120,"coins":300},
    "weekly_open_chest_3":{"xp":80,"coins":200},
    "weekly_master_5":{"xp":200,"coins":600},
    "weekly_complete_subcat":{"xp":300,"coins":1000}
  }'::jsonb;
BEGIN
  SELECT * INTO v_state FROM public.lang_state
  WHERE user_id = v_user_id AND lang = p_lang;

  SELECT * INTO v_quest FROM public.quest_state
  WHERE user_id = v_user_id AND lang = p_lang
    AND quest_id = p_quest_id AND period_key = p_period_key;

  IF NOT FOUND THEN RAISE EXCEPTION 'quest_not_found'; END IF;
  IF v_quest.claimed THEN RAISE EXCEPTION 'already_claimed'; END IF;
  IF v_quest.progress < 1 THEN RAISE EXCEPTION 'quest_incomplete'; END IF;

  -- Rank-scaled rewards
  v_mult := 1.0 + 0.15 * v_state.rank_tier;
  v_xp_reward := round((v_quest_rewards->p_quest_id->>'xp')::float * v_mult);
  v_coin_reward := round((v_quest_rewards->p_quest_id->>'coins')::float * v_mult);

  -- Mark claimed
  UPDATE public.quest_state SET claimed = true
  WHERE user_id = v_user_id AND lang = p_lang
    AND quest_id = p_quest_id AND period_key = p_period_key;

  -- Award rewards
  UPDATE public.lang_state
  SET coins = coins + v_coin_reward
  WHERE user_id = v_user_id AND lang = p_lang;

  PERFORM public.award_xp(p_lang, v_xp_reward, 'quest');

  RETURN jsonb_build_object('xp', v_xp_reward, 'coins', v_coin_reward);
END;
$$;

-- claim_daily_login: cyclic reward
CREATE OR REPLACE FUNCTION public.claim_daily_login()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_today date := CURRENT_DATE;
  v_day int;
  v_slot int;
  v_cycle_index int;
  v_slot_name text;
  v_mult int := 2;
  v_booster_type text;
  v_count int;
  v_boosters jsonb;
  v_until timestamptz := now() + interval '24 hours';
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_profile.last_login_day = v_today THEN RAISE EXCEPTION 'already_claimed'; END IF;

  -- Streak logic
  IF v_profile.last_login_day = v_today - 1 THEN
    v_day := v_profile.daily_login_streak + 1;
  ELSE
    v_day := 1;
  END IF;

  v_slot := (v_day - 1) % 4;
  v_cycle_index := ceil(v_day::float / 4)::int;
  v_count := v_cycle_index;

  CASE v_slot
    WHEN 0 THEN v_booster_type := 'coin';
    WHEN 1 THEN v_booster_type := 'luck';
    WHEN 2 THEN v_booster_type := 'xp';
    WHEN 3 THEN v_booster_type := 'streak';
  END CASE;

  -- Update profile
  UPDATE public.profiles
  SET daily_login_streak = v_day, last_login_day = v_today
  WHERE id = v_user_id;

  -- Apply booster to all langs for this user
  FOR v_lang IN SELECT unnest(ARRAY['en','de','es','it']) LOOP
    SELECT active_boosters INTO v_boosters FROM public.lang_state
    WHERE user_id = v_user_id AND lang = v_lang;

    IF FOUND THEN
      v_boosters := COALESCE(v_boosters, '{}');
      IF v_boosters ? v_booster_type THEN
        DECLARE v_existing_until timestamptz;
        BEGIN
          v_existing_until := (v_boosters->v_booster_type->>'until')::timestamptz;
          IF v_existing_until > now() THEN
            v_until := v_existing_until + (interval '24 hours' * v_count);
            v_mult := v_mult * v_count + (v_boosters->v_booster_type->>'mult')::int;
          END IF;
        END;
      ELSE
        v_until := now() + (interval '24 hours' * v_count);
        v_mult := 2 * v_count;
      END IF;

      v_boosters := jsonb_set(v_boosters, ARRAY[v_booster_type],
        jsonb_build_object('mult', v_mult, 'until', v_until));

      UPDATE public.lang_state
      SET active_boosters = v_boosters
      WHERE user_id = v_user_id AND lang = v_lang;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'day', v_day,
    'booster_type', v_booster_type,
    'count', v_count,
    'mult', 2
  );
END;
$$;

-- set_active_session: single-session lock
CREATE OR REPLACE FUNCTION public.set_active_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing uuid;
BEGIN
  SELECT active_session_id INTO v_existing FROM public.profiles WHERE id = v_user_id;

  UPDATE public.profiles SET active_session_id = p_session_id WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'previous_session', v_existing
  );
END;
$$;

-- Refresh leaderboard (called on-demand and by cron)
CREATE OR REPLACE FUNCTION public.refresh_leaderboard()
RETURNS void
LANGUAGE sql SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_view;
$$;

-- ──────────────────────────────────────────────────────────────────
-- CRON JOBS (pg_cron)
-- ──────────────────────────────────────────────────────────────────

-- Daily mastery decay check (00:05 UTC)
SELECT cron.schedule('vocup-decay', '5 0 * * *', $$
  UPDATE public.word_scores
  SET score = GREATEST(5, score - 1)
  WHERE score > 5
    AND last_seen_at < now() - interval '21 days';
$$);

-- Leaderboard refresh (every hour)
SELECT cron.schedule('vocup-leaderboard', '0 * * * *', $$
  SELECT public.refresh_leaderboard();
$$);
