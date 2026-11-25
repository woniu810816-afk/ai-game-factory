-- ============================================================================
-- game-factory 新加坡 Supabase 独立表结构与防刷分 RLS 策略脚本
-- 说明：所有表均使用 gf_ 前缀，与其它业务项目完全隔离，可直接在同一实例执行。
-- 兼容：完全兼容 SUPABASE_URL + 新版 sb_publishable_ 可发布密钥及旧版 anon JWT。
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. 玩家云存档表（gf_player_saves）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gf_player_saves (
  game_id       text NOT NULL,
  player_id     text NOT NULL,
  secret_hash   text NOT NULL,
  nickname      text NOT NULL DEFAULT '匿名玩家',
  max_level     integer NOT NULL DEFAULT 1 CHECK (max_level >= 1 AND max_level <= 999),
  best_score    integer NOT NULL DEFAULT 0 CHECK (best_score >= 0 AND best_score <= 500000),
  coins         integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  sound_enabled boolean NOT NULL DEFAULT true,
  save_data     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 2. 全球排行榜成绩表（gf_leaderboard_scores）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gf_leaderboard_scores (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        text NOT NULL,
  player_id      text NOT NULL,
  nickname       text NOT NULL DEFAULT '匿名玩家',
  score          integer NOT NULL CHECK (score >= 0 AND score <= 500000),
  level_reached  integer NOT NULL DEFAULT 1 CHECK (level_reached >= 1 AND level_reached <= 999),
  duration_sec   integer NOT NULL CHECK (duration_sec >= 1),
  revived        boolean NOT NULL DEFAULT false,
  double_claimed boolean NOT NULL DEFAULT false,
  platform       text NOT NULL DEFAULT 'standalone',
  score_per_sec  numeric(10,2) GENERATED ALWAYS AS (round((score::numeric / GREATEST(duration_sec, 1)), 2)) STORED,
  is_flagged     boolean NOT NULL DEFAULT false,
  flag_reason    text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gf_scores_game_valid
  ON public.gf_leaderboard_scores (game_id, is_flagged, score DESC);
CREATE INDEX IF NOT EXISTS idx_gf_scores_player_recent
  ON public.gf_leaderboard_scores (game_id, player_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. 每日巡检与反作弊清理日志表（gf_patrol_reports）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gf_patrol_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date     date NOT NULL DEFAULT CURRENT_DATE,
  game_id         text NOT NULL DEFAULT 'all',
  flagged_count   integer NOT NULL DEFAULT 0,
  deleted_count   integer NOT NULL DEFAULT 0,
  ga4_summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'ok',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. 排行榜公开只读视图（自动按玩家取最高有效成绩并过滤作弊记录）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.gf_leaderboard_top AS
SELECT
  game_id,
  player_id,
  max(nickname) AS nickname,
  max(score) AS best_score,
  max(level_reached) AS max_level_reached,
  max(created_at) AS last_submitted_at
FROM public.gf_leaderboard_scores
WHERE is_flagged = false
GROUP BY game_id, player_id;

-- ----------------------------------------------------------------------------
-- 5. 请求头身份读取辅助函数（兼容 sb_publishable_ 与客户端玩家令牌）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_request_header(p_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
BEGIN
  BEGIN
    v_headers := COALESCE(current_setting('request.headers', true), '{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := '{}'::jsonb;
  END;
  RETURN NULLIF(trim(COALESCE(v_headers ->> lower(p_name), '')), '');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. 玩家云存档安全写入 RPC（校验 player_id + secret_hash，防他人篡改存档）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_upsert_player_save(
  p_game_id       text,
  p_nickname      text DEFAULT '匿名玩家',
  p_max_level     integer DEFAULT 1,
  p_best_score    integer DEFAULT 0,
  p_coins         integer DEFAULT 0,
  p_sound_enabled boolean DEFAULT true,
  p_save_data     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_player_id   text := public.gf_request_header('x-gf-player-id');
  v_secret      text := public.gf_request_header('x-gf-player-secret');
  v_secret_hash text;
  v_existing    public.gf_player_saves%ROWTYPE;
BEGIN
  IF v_player_id IS NULL OR length(v_player_id) < 4 OR v_secret IS NULL OR length(v_secret) < 12 THEN
    RAISE EXCEPTION '缺少合法玩家身份请求头';
  END IF;

  v_secret_hash := encode(digest(convert_to(v_secret, 'utf8'), 'sha256'), 'hex');

  SELECT * INTO v_existing
  FROM public.gf_player_saves
  WHERE game_id = p_game_id AND player_id = v_player_id;

  IF FOUND AND v_existing.secret_hash <> v_secret_hash THEN
    RAISE EXCEPTION '玩家存档校验失败，拒绝越权覆盖';
  END IF;

  INSERT INTO public.gf_player_saves (
    game_id, player_id, secret_hash, nickname, max_level, best_score, coins, sound_enabled, save_data, updated_at
  )
  VALUES (
    p_game_id,
    v_player_id,
    v_secret_hash,
    left(COALESCE(NULLIF(trim(p_nickname), ''), '匿名玩家'), 24),
    GREATEST(1, LEAST(999, COALESCE(p_max_level, 1))),
    GREATEST(0, LEAST(500000, COALESCE(p_best_score, 0))),
    GREATEST(0, COALESCE(p_coins, 0)),
    COALESCE(p_sound_enabled, true),
    COALESCE(p_save_data, '{}'::jsonb),
    now()
  )
  ON CONFLICT (game_id, player_id) DO UPDATE
    SET nickname      = EXCLUDED.nickname,
        max_level     = GREATEST(public.gf_player_saves.max_level, EXCLUDED.max_level),
        best_score    = GREATEST(public.gf_player_saves.best_score, EXCLUDED.best_score),
        coins         = GREATEST(public.gf_player_saves.coins, EXCLUDED.coins),
        sound_enabled = EXCLUDED.sound_enabled,
        save_data     = EXCLUDED.save_data,
        updated_at    = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. 防刷分成绩提交 RPC（多层反作弊校验 + 频率限流 + 异常自动标记）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_submit_score(
  p_game_id        text,
  p_nickname       text DEFAULT '匿名玩家',
  p_score          integer DEFAULT 0,
  p_level_reached  integer DEFAULT 1,
  p_duration_sec   integer DEFAULT 1,
  p_revived        boolean DEFAULT false,
  p_double_claimed boolean DEFAULT false,
  p_platform       text DEFAULT 'standalone'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id  text := public.gf_request_header('x-gf-player-id');
  v_recent_cnt integer;
  v_max_sps    numeric := CASE WHEN COALESCE(p_double_claimed, false) THEN 360 ELSE 180 END;
  v_sps        numeric;
  v_flagged    boolean := false;
  v_reason     text := '';
  v_id         uuid;
BEGIN
  IF v_player_id IS NULL OR length(v_player_id) < 4 THEN
    RAISE EXCEPTION '缺少玩家身份标识，拒绝写入排行榜';
  END IF;

  IF p_score IS NULL OR p_score < 0 OR p_score > 500000 THEN
    RAISE EXCEPTION '分数超出合法范围（0~500000）';
  END IF;

  IF p_duration_sec IS NULL OR p_duration_sec < 3 THEN
    v_flagged := true;
    v_reason := '局内时长过短（<3秒）';
  END IF;

  -- 防刷限流：同一玩家 1 分钟内最多提交 12 条成绩
  SELECT count(*) INTO v_recent_cnt
  FROM public.gf_leaderboard_scores
  WHERE game_id = p_game_id
    AND player_id = v_player_id
    AND created_at > now() - interval '1 minute';

  IF v_recent_cnt >= 12 THEN
    RAISE EXCEPTION '提交过于频繁，请稍后再试';
  END IF;

  v_sps := p_score::numeric / GREATEST(COALESCE(p_duration_sec, 1), 1);
  IF NOT v_flagged AND v_sps > v_max_sps THEN
    v_flagged := true;
    v_reason := format('单位时间得分率异常（%s 分/秒 > 阈值 %s）', round(v_sps, 2), v_max_sps);
  END IF;

  IF NOT v_flagged AND p_level_reached > 1 AND p_score > p_level_reached * 25000 THEN
    v_flagged := true;
    v_reason := '分数与关卡进度严重不匹配';
  END IF;

  INSERT INTO public.gf_leaderboard_scores (
    game_id, player_id, nickname, score, level_reached, duration_sec,
    revived, double_claimed, platform, is_flagged, flag_reason
  )
  VALUES (
    p_game_id,
    v_player_id,
    left(COALESCE(NULLIF(trim(p_nickname), ''), '匿名玩家'), 24),
    p_score,
    GREATEST(1, LEAST(999, COALESCE(p_level_reached, 1))),
    GREATEST(1, COALESCE(p_duration_sec, 1)),
    COALESCE(p_revived, false),
    COALESCE(p_double_claimed, false),
    left(COALESCE(p_platform, 'standalone'), 32),
    v_flagged,
    v_reason
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'flagged', v_flagged,
    'flag_reason', v_reason
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. 后台定时巡检清理 RPC（仅限 service_role / postgres 超级权限调用）
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gf_cleanup_anomalous_scores(
  p_game_id       text DEFAULT NULL,
  p_max_score     integer DEFAULT 300000,
  p_max_sps       numeric DEFAULT 180,
  p_min_duration  integer DEFAULT 3,
  p_delete_older_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_newly_flagged integer := 0;
  v_deleted       integer := 0;
  v_total_valid   integer := 0;
BEGIN
  -- 1. 扫描并标记异常高分 / 异常分速 / 超短时长记录
  WITH flagged AS (
    UPDATE public.gf_leaderboard_scores
    SET is_flagged = true,
        flag_reason = CASE
          WHEN score > p_max_score THEN '巡检拦截：超过全局最高分红线'
          WHEN duration_sec < p_min_duration THEN '巡检拦截：对局时长低于下限'
          WHEN score_per_sec > (CASE WHEN double_claimed THEN p_max_sps * 2 ELSE p_max_sps END) THEN '巡检拦截：单位时间得分率异常'
          ELSE flag_reason
        END
    WHERE is_flagged = false
      AND (p_game_id IS NULL OR game_id = p_game_id)
      AND (
        score > p_max_score
        OR duration_sec < p_min_duration
        OR score_per_sec > (CASE WHEN double_claimed THEN p_max_sps * 2 ELSE p_max_sps END)
      )
    RETURNING id
  )
  SELECT count(*) INTO v_newly_flagged FROM flagged;

  -- 2. 物理删除超过保留天数的已标记作弊脏数据，保持榜单存储精简
  WITH removed AS (
    DELETE FROM public.gf_leaderboard_scores
    WHERE is_flagged = true
      AND (p_game_id IS NULL OR game_id = p_game_id)
      AND created_at < now() - make_interval(days => GREATEST(0, p_delete_older_days))
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM removed;

  SELECT count(*) INTO v_total_valid
  FROM public.gf_leaderboard_scores
  WHERE is_flagged = false
    AND (p_game_id IS NULL OR game_id = p_game_id);

  INSERT INTO public.gf_patrol_reports (game_id, flagged_count, deleted_count, status)
  VALUES (COALESCE(p_game_id, 'all'), v_newly_flagged, v_deleted, 'ok');

  RETURN jsonb_build_object(
    'ok', true,
    'newly_flagged', v_newly_flagged,
    'deleted_flagged', v_deleted,
    'valid_scores_remaining', v_total_valid
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. 开启全部表行级安全策略（RLS）与最小权限授权
-- ----------------------------------------------------------------------------
ALTER TABLE public.gf_player_saves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gf_leaderboard_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gf_patrol_reports     ENABLE ROW LEVEL SECURITY;

-- 玩家仅可读取自己的云存档（写入统一走 gf_upsert_player_save RPC 校验 secret_hash）
DROP POLICY IF EXISTS gf_saves_select_own ON public.gf_player_saves;
CREATE POLICY gf_saves_select_own ON public.gf_player_saves
  FOR SELECT TO anon, authenticated
  USING (
    player_id = public.gf_request_header('x-gf-player-id')
    AND secret_hash = encode(extensions.digest(convert_to(COALESCE(public.gf_request_header('x-gf-player-secret'), ''), 'utf8'), 'sha256'), 'hex')
  );

-- 排行榜仅允许读取未被标记作弊的公开记录；严禁客户端直接 INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS gf_scores_select_public ON public.gf_leaderboard_scores;
CREATE POLICY gf_scores_select_public ON public.gf_leaderboard_scores
  FOR SELECT TO anon, authenticated
  USING (is_flagged = false);

-- 最小列/表权限
GRANT USAGE ON SCHEMA public TO anon, authenticated;

REVOKE ALL ON public.gf_player_saves FROM anon, authenticated;
GRANT SELECT (game_id, player_id, nickname, max_level, best_score, coins, sound_enabled, save_data, updated_at)
  ON public.gf_player_saves TO anon, authenticated;

REVOKE ALL ON public.gf_leaderboard_scores FROM anon, authenticated;
GRANT SELECT (id, game_id, player_id, nickname, score, level_reached, platform, created_at)
  ON public.gf_leaderboard_scores TO anon, authenticated;

GRANT SELECT ON public.gf_leaderboard_top TO anon, authenticated;

REVOKE ALL ON public.gf_patrol_reports FROM anon, authenticated;

-- 仅向客户端暴露安全的存档与防刷分提分 RPC；清理巡检 RPC 仅限 service_role
REVOKE ALL ON FUNCTION public.gf_cleanup_anomalous_scores(text, integer, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gf_cleanup_anomalous_scores(text, integer, numeric, integer, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.gf_upsert_player_save(text, text, integer, integer, integer, boolean, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gf_submit_score(text, text, integer, integer, integer, boolean, boolean, text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
