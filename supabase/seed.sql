-- Demo experience for local development and visual QA.
-- All participant user_id values are null on purpose; local auth can attach real anonymous users later.

insert into public.experiences (
  id, slug, title, description, place, join_code, start_date, end_date,
  supported_languages, state, current_phase, selection_enabled, story_count, mosaic_visible
)
values (
  '00000000-0000-4000-8000-000000000001',
  'hervas-october',
  'See What Others Don’t See',
  'A private collective photography experience in Hervás.',
  'Hervás, Cáceres',
  'HERVAS',
  '2026-10-01',
  '2026-10-05',
  array['es', 'it', 'en']::text[],
  'active',
  'exploration',
  true,
  3,
  false
)
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  description = excluded.description,
  place = excluded.place,
  join_code = excluded.join_code,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  supported_languages = excluded.supported_languages,
  current_phase = excluded.current_phase,
  state = excluded.state;

insert into public.teams (id, experience_id, name, symbol, accent, display_order)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Tajo', '◌', 'wood', 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Alagón', '≈', 'river', 2),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Ambroz', '✳', 'moss', 3)
on conflict (id) do update set name = excluded.name, symbol = excluded.symbol, accent = excluded.accent;

insert into public.participants (id, experience_id, first_name, country_code, preferred_locale)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Lucía', 'ES', 'es'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Nerea', 'ES', 'es'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', 'Irene', 'ES', 'es'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', 'Mateo', 'ES', 'es'),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000001', 'Álvaro', 'ES', 'es'),
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000001', 'Matteo', 'IT', 'it'),
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000001', 'Giulia', 'IT', 'it'),
  ('00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000001', 'Luca', 'IT', 'it'),
  ('00000000-0000-4000-8000-000000001009', '00000000-0000-4000-8000-000000000001', 'Sofia', 'IT', 'it'),
  ('00000000-0000-4000-8000-000000001010', '00000000-0000-4000-8000-000000000001', 'Davide', 'IT', 'it'),
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000001', 'Emma', 'IT', 'it')
on conflict (id) do update set first_name = excluded.first_name, country_code = excluded.country_code, preferred_locale = excluded.preferred_locale;

insert into public.team_members (team_id, participant_id)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001006'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001003'),
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001009'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000001007'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000001004'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000001010'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000001005'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000001008'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000001011')
on conflict do nothing;

insert into public.challenges (id, experience_id, slug, category, difficulty, required, secret, max_photos, unlock_phase, is_active, display_order)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000001', 'first-signs-of-autumn', 'autumn', 'gentle', false, false, 1, 'exploration', true, 1),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000000001', 'autumn-light', 'light', 'gentle', false, false, 1, 'exploration', true, 2),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000000001', 'town-meets-nature', 'place', 'curious', false, false, 1, 'exploration', true, 3),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000000001', 'water-and-reflection', 'water', 'curious', false, false, 1, 'exploration', true, 4),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000000001', 'detail-to-remember', 'memory', 'gentle', false, false, 1, 'exploration', true, 5)
on conflict (id) do update set
  slug = excluded.slug,
  category = excluded.category,
  difficulty = excluded.difficulty,
  required = excluded.required,
  secret = excluded.secret,
  max_photos = excluded.max_photos,
  unlock_phase = excluded.unlock_phase,
  is_active = excluded.is_active,
  display_order = excluded.display_order;

update public.challenges
set is_active = false
where experience_id = '00000000-0000-4000-8000-000000000001'
  and id not in (
    '00000000-0000-4000-8000-000000002001',
    '00000000-0000-4000-8000-000000002002',
    '00000000-0000-4000-8000-000000002003',
    '00000000-0000-4000-8000-000000002004',
    '00000000-0000-4000-8000-000000002005'
  );

insert into public.challenge_translations (challenge_id, locale, title, description, hint)
select c.id, v.locale, v.title, v.description, v.hint
from (values
  ('00000000-0000-4000-8000-000000002001'::uuid, 'en', 'First signs of autumn', 'Photograph one small change in a leaf, tree, garden, or street.', 'Look at the edges and the ground.'),
  ('00000000-0000-4000-8000-000000002001'::uuid, 'es', 'Primeras señales de otoño', 'Fotografía un pequeño cambio en una hoja, un árbol, un jardín o una calle.', 'Mira los bordes y el suelo.'),
  ('00000000-0000-4000-8000-000000002001'::uuid, 'it', 'Primi segni d''autunno', 'Fotografa un piccolo cambiamento in una foglia, un albero, un giardino o una strada.', 'Guarda i bordi e il terreno.'),
  ('00000000-0000-4000-8000-000000002002'::uuid, 'en', 'Autumn light', 'Find warm light or a long shadow on a wall, door, or street.', 'Try early or late in the day.'),
  ('00000000-0000-4000-8000-000000002002'::uuid, 'es', 'Luz de otoño', 'Busca una luz cálida o una sombra alargada en una pared, una puerta o una calle.', 'Prueba a primera o última hora.'),
  ('00000000-0000-4000-8000-000000002002'::uuid, 'it', 'Luce d''autunno', 'Cerca una luce calda o un''ombra lunga su un muro, una porta o una strada.', 'Prova al mattino presto o nel tardo pomeriggio.'),
  ('00000000-0000-4000-8000-000000002003'::uuid, 'en', 'Where town meets nature', 'Frame leaves, moss, or ivy beside a wall, door, or window.', 'Keep both in the same frame.'),
  ('00000000-0000-4000-8000-000000002003'::uuid, 'es', 'Donde el pueblo se encuentra con la naturaleza', 'Encuadra hojas, musgo o hiedra junto a una pared, una puerta o una ventana.', 'Incluye ambos en el mismo encuadre.'),
  ('00000000-0000-4000-8000-000000002003'::uuid, 'it', 'Dove il paese incontra la natura', 'Inquadra foglie, muschio o edera accanto a un muro, una porta o una finestra.', 'Tienili insieme nella stessa inquadratura.'),
  ('00000000-0000-4000-8000-000000002004'::uuid, 'en', 'Water and reflection', 'Find water in Hervás: a reflection, ripple, or wet surface.', 'Get close before you take the photo.'),
  ('00000000-0000-4000-8000-000000002004'::uuid, 'es', 'Agua y reflejo', 'Encuentra agua en Hervás: un reflejo, una onda o una superficie mojada.', 'Acércate antes de hacer la foto.'),
  ('00000000-0000-4000-8000-000000002004'::uuid, 'it', 'Acqua e riflesso', 'Trova l''acqua a Hervás: un riflesso, un''increspatura o una superficie bagnata.', 'Avvicinati prima di scattare.'),
  ('00000000-0000-4000-8000-000000002005'::uuid, 'en', 'One detail to remember', 'Photograph one autumn detail that feels like Hervás to you.', 'Choose what you would show someone at home.'),
  ('00000000-0000-4000-8000-000000002005'::uuid, 'es', 'Un detalle para recordar', 'Fotografía un detalle de otoño que para ti represente Hervás.', 'Elige lo que enseñarías a alguien al volver a casa.'),
  ('00000000-0000-4000-8000-000000002005'::uuid, 'it', 'Un dettaglio da ricordare', 'Fotografa un dettaglio autunnale che per te rappresenta Hervás.', 'Scegli ciò che mostreresti a qualcuno una volta a casa.')
) as v(challenge_id, locale, title, description, hint)
join public.challenges c on c.id = v.challenge_id
on conflict (challenge_id, locale) do update set title = excluded.title, description = excluded.description, hint = excluded.hint;
