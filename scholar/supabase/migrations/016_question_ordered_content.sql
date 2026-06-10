-- 016_question_ordered_content.sql
-- Ordered render content for a question (text + images interleaved).
-- Preserves the author's intended order so phrases like "figure above" / "figure below"
-- in the question text are respected when rendered in practice/homework/assessment.
--
-- Shape:
--   [
--     { "type": "text",  "value": "..."                              },
--     { "type": "image", "url": "https://...", "caption": "?", "alt": "?" }
--   ]
--
-- Null means "fall back to legacy flat text + candidate_image_refs rendering."

alter table public.questions
  add column if not exists question_content jsonb;

comment on column public.questions.question_content is
  'Ordered renderable content items for the question. Array of {type:"text"|"image", ...}. When null, readers fall back to question_text + candidate_image_refs.';
