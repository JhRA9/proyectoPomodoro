begin;

-- StudyHub conserva un snapshot JSON por usuario. Esta migración agrega las
-- colecciones v2 sin crear tablas compartidas ni relajar la RLS existente.
update public.studyhub_states
set state = state
  || jsonb_build_object(
    'schemaVersion', 2,
    'competencies', coalesce(state->'competencies', '[]'::jsonb),
    'exercises', coalesce(state->'exercises', '[]'::jsonb),
    'evidence', coalesce(state->'evidence', '[]'::jsonb),
    'evaluations', coalesce(state->'evaluations', '[]'::jsonb),
    'deliveryStages', coalesce(state->'deliveryStages', '[]'::jsonb),
    'deliverables', coalesce(state->'deliverables', '[]'::jsonb),
    'aiRequests', coalesce(state->'aiRequests', '[]'::jsonb),
    'weeklyReviews', coalesce(state->'weeklyReviews', '[]'::jsonb)
  )
where coalesce((state->>'schemaVersion')::integer, 1) < 2;

comment on table public.studyhub_states is
  'Snapshot versionado de StudyHub por usuario; incluye evaluaciones v2 y permanece protegido por RLS.';

commit;
