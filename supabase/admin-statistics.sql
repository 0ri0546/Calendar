-- Extension des statistiques administrateur avec le taux moyen de remplissage.
-- Le remplissage est calculé pour les activités approuvées disposant d'une capacité maximale.

DROP FUNCTION IF EXISTS public.get_admin_statistics(text);

CREATE OR REPLACE FUNCTION public.get_admin_statistics(p_period text)
RETURNS TABLE (
    bucket_start date,
    activity_count bigint,
    participation_count bigint,
    fill_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_period text := lower(trim(p_period));
    v_start timestamptz;
    v_local_now timestamp;
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        RAISE EXCEPTION 'You must be logged in';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'You must be an administrator';
    END IF;

    IF v_period NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION 'Invalid statistics period';
    END IF;

    v_local_now := now() AT TIME ZONE 'Europe/Paris';
    v_start := CASE v_period
        WHEN 'day' THEN (date_trunc('day', v_local_now) - interval '13 days') AT TIME ZONE 'Europe/Paris'
        WHEN 'week' THEN (date_trunc('week', v_local_now) - interval '11 weeks') AT TIME ZONE 'Europe/Paris'
        ELSE (date_trunc('month', v_local_now) - interval '11 months') AT TIME ZONE 'Europe/Paris'
    END;

    RETURN QUERY
    WITH periods AS (
        SELECT generate_series(
            date_trunc(v_period, v_local_now),
            date_trunc(v_period, v_local_now) - CASE v_period
                WHEN 'day' THEN interval '13 days'
                WHEN 'week' THEN interval '11 weeks'
                ELSE interval '11 months'
            END,
            CASE v_period
                WHEN 'day' THEN interval '-1 day'
                WHEN 'week' THEN interval '-1 week'
                ELSE interval '-1 month'
            END
        )::date AS bucket_start
    ),
    counts AS (
        SELECT
            date_trunc(v_period, occurred_at AT TIME ZONE 'Europe/Paris')::date AS bucket_start,
            count(*) FILTER (WHERE event_type = 'activity_approved') AS activity_count,
            count(*) FILTER (WHERE event_type = 'activity_joined') AS participation_count
        FROM public.admin_statistics_events
        WHERE occurred_at >= v_start
        GROUP BY 1
    ),
    activity_fill AS (
        SELECT
            date_trunc(v_period, a.date::timestamp)::date AS bucket_start,
            avg(
                LEAST(
                    100::numeric,
                    (COALESCE(p.participant_count, 0)::numeric * 100)
                    / NULLIF(a.max_players, 0)
                )
            ) AS fill_rate
        FROM public.activities a
        LEFT JOIN (
            SELECT activity_id, count(*) AS participant_count
            FROM public.participations
            GROUP BY activity_id
        ) p ON p.activity_id = a.id
        WHERE a.status = 'approved'
          AND a.max_players IS NOT NULL
          AND a.max_players > 0
          AND a.date >= v_start::date
        GROUP BY 1
    )
    SELECT
        periods.bucket_start,
        COALESCE(counts.activity_count, 0)::bigint,
        COALESCE(counts.participation_count, 0)::bigint,
        COALESCE(activity_fill.fill_rate, 0)::numeric
    FROM periods
    LEFT JOIN counts USING (bucket_start)
    LEFT JOIN activity_fill USING (bucket_start)
    ORDER BY periods.bucket_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_statistics(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_statistics(text) TO authenticated;
