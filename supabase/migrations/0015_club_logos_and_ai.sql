-- ============================================================
-- CLUBES REALES: escudos + rivales IA
--
-- Los rivales de la IA pasan a ser CLUBES REALES, formados por sus
-- jugadores reales del catálogo. El Real Madrid juega con los suyos;
-- Huracán, con los suyos. La dificultad sale de la calidad real de
-- cada plantilla, no de un número inventado.
--
-- Solo se incluyen clubes con escudo disponible.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Escudo por club
-- ------------------------------------------------------------
create table if not exists public.club_assets (
  club_name text primary key,
  logo_path text not null,
  strength  numeric not null,     -- media de sus 11 mejores
  created_at timestamptz not null default now()
);
alter table public.club_assets enable row level security;
drop policy if exists "club_assets_read" on public.club_assets;
create policy "club_assets_read" on public.club_assets for select using (true);

truncate public.club_assets;
insert into public.club_assets (club_name, logo_path, strength) values
  ('1. FC Köln', '/logos/clubs/1-fc-koln.png', 74.5),
  ('1. FC Union Berlin', '/logos/clubs/1-fc-union-berlin.png', 75.4),
  ('1. FSV Mainz 05', '/logos/clubs/1-fsv-mainz-05.png', 74.5),
  ('AC Ajaccio', '/logos/clubs/ac-ajaccio.png', 68.5),
  ('AC Milan', '/logos/clubs/ac-milan.png', 82),
  ('AC Sparta Praha', '/logos/clubs/ac-sparta-praha.png', 74.5),
  ('APOEL Nicosia FC', '/logos/clubs/apoel-nicosia-fc.png', 70.3),
  ('AS Monaco', '/logos/clubs/as-monaco.png', 79),
  ('AS Saint-Étienne', '/logos/clubs/as-saint-etienne.png', 74.5),
  ('Ajax', '/logos/clubs/ajax.png', 80.3),
  ('América de Cali', '/logos/clubs/america-de-cali.gif', 67.8),
  ('Argentinos Juniors', '/logos/clubs/argentinos-juniors.png', 72.4),
  ('Arsenal', '/logos/clubs/arsenal.png', 81),
  ('Arsenal de Sarandí', '/logos/clubs/arsenal-de-sarandi.png', 69.5),
  ('Aston Villa', '/logos/clubs/aston-villa.png', 79.2),
  ('Atalanta', '/logos/clubs/atalanta.png', 81.5),
  ('Athletic Club de Bilbao', '/logos/clubs/athletic-club-de-bilbao.png', 80.7),
  ('Atlético Nacional', '/logos/clubs/atletico-nacional.gif', 69.9),
  ('Atlético de Madrid', '/logos/clubs/atletico-de-madrid.png', 85.3),
  ('BSC Young Boys', '/logos/clubs/bsc-young-boys.png', 74.1),
  ('Bahia', '/logos/clubs/bahia.jpg', 72.7),
  ('Barcelona Sporting Club', '/logos/clubs/barcelona-sporting-club.png', 71.8),
  ('Bayer 04 Leverkusen', '/logos/clubs/bayer-04-leverkusen.png', 79.5),
  ('Boca Juniors', '/logos/clubs/boca-juniors.png', 76.8),
  ('Bohemian FC', '/logos/clubs/bohemian-fc.png', 61.7),
  ('Bologna', '/logos/clubs/bologna.png', 76.2),
  ('Borussia Dortmund', '/logos/clubs/borussia-dortmund.png', 82.8),
  ('Borussia Dortmund II', '/logos/clubs/borussia-dortmund-ii.png', 63.6),
  ('Borussia Mönchengladbach', '/logos/clubs/borussia-monchengladbach.png', 80.7),
  ('CA Osasuna', '/logos/clubs/ca-osasuna.png', 77.7),
  ('CF Monterrey', '/logos/clubs/cf-monterrey.gif', 76.2),
  ('CFR Cluj', '/logos/clubs/cfr-cluj.png', 69.6),
  ('CS Emelec', '/logos/clubs/cs-emelec.png', 68.7),
  ('Cagliari', '/logos/clubs/cagliari.png', 76.7),
  ('Cardiff City', '/logos/clubs/cardiff-city.png', 71.5),
  ('Ceará Sporting Club', '/logos/clubs/ceara-sporting-club.png', 73.8),
  ('Celtic', '/logos/clubs/celtic.png', 73.7),
  ('Charlton Athletic', '/logos/clubs/charlton-athletic.png', 67),
  ('Chelsea', '/logos/clubs/chelsea.png', 84.7),
  ('Chicago Fire Football Club', '/logos/clubs/chicago-fire-football-club.gif', 69.8),
  ('Chongqing Liangjiang Athletic', '/logos/clubs/chongqing-liangjiang-athletic.png', 61.9),
  ('Club América', '/logos/clubs/club-america.gif', 75.4),
  ('Club Athletico Paranaense', '/logos/clubs/club-athletico-paranaense.png', 74.3),
  ('Club Atlas', '/logos/clubs/club-atlas.gif', 71.4),
  ('Club Atlético Colón', '/logos/clubs/club-atletico-colon.png', 73.3),
  ('Club Atlético Independiente', '/logos/clubs/club-atletico-independiente.png', 74.1),
  ('Club Atlético Lanús', '/logos/clubs/club-atletico-lanus.gif', 72.5),
  ('Club Atlético Nacional Potosí', '/logos/clubs/club-atletico-nacional-potosi.gif', 65.4),
  ('Club Atlético Peñarol', '/logos/clubs/club-atletico-penarol.gif', 70.5),
  ('Club Atlético de San Luis', '/logos/clubs/club-atletico-de-san-luis.gif', 71.1),
  ('Club Bolívar', '/logos/clubs/club-bolivar.gif', 68.8),
  ('Club Brugge KV', '/logos/clubs/club-brugge-kv.png', 77.2),
  ('Club Cerro Porteño', '/logos/clubs/club-cerro-porteno.png', 69.6),
  ('Club Independiente Santa Fe', '/logos/clubs/club-independiente-santa-fe.png', 66.9),
  ('Club León', '/logos/clubs/club-leon.gif', 75),
  ('Club Libertad', '/logos/clubs/club-libertad.png', 74.1),
  ('Club Nacional', '/logos/clubs/club-nacional.gif', 66.8),
  ('Club Nacional de Football', '/logos/clubs/club-nacional-de-football.gif', 71.8),
  ('Club Necaxa', '/logos/clubs/club-necaxa.gif', 70.9),
  ('Club Olimpia', '/logos/clubs/club-olimpia.png', 72.5),
  ('Club River Plate Asunción', '/logos/clubs/club-river-plate-asuncion.png', 65.9),
  ('Club Sporting Cristal', '/logos/clubs/club-sporting-cristal.png', 68.9),
  ('Club Tijuana', '/logos/clubs/club-tijuana.gif', 72.5),
  ('Club Universidad Nacional', '/logos/clubs/club-universidad-nacional.gif', 71.3),
  ('Club de Foot Montréal', '/logos/clubs/club-de-foot-montreal.gif', 69.8),
  ('Clube Sport Marítimo', '/logos/clubs/clube-sport-maritimo.png', 71.4),
  ('Colorado Rapids', '/logos/clubs/colorado-rapids.gif', 70.5),
  ('Columbus Crew', '/logos/clubs/columbus-crew.gif', 72.5),
  ('Cruz Azul', '/logos/clubs/cruz-azul.gif', 75.3),
  ('Crystal Palace', '/logos/clubs/crystal-palace.png', 76.9),
  ('D.C. United', '/logos/clubs/d-c-united.png', 71.9),
  ('DSC Arminia Bielefeld', '/logos/clubs/dsc-arminia-bielefeld.png', 73.4),
  ('Deportivo Toluca', '/logos/clubs/deportivo-toluca.gif', 72.4),
  ('Deportivo Táchira FC', '/logos/clubs/deportivo-tachira-fc.png', 64.3),
  ('Dinamo Zagreb', '/logos/clubs/dinamo-zagreb.png', 74.6),
  ('Eintracht Braunschweig', '/logos/clubs/eintracht-braunschweig.png', 66.9),
  ('Eintracht Frankfurt', '/logos/clubs/eintracht-frankfurt.png', 78.6),
  ('Elche CF', '/logos/clubs/elche-cf.png', 75.9),
  ('En Avant de Guingamp', '/logos/clubs/en-avant-de-guingamp.png', 68.7),
  ('Estoril Praia', '/logos/clubs/estoril-praia.png', 70.3),
  ('Estudiantes de La Plata', '/logos/clubs/estudiantes-de-la-plata.png', 71.5),
  ('Everton', '/logos/clubs/everton.png', 80.8),
  ('FC Augsburg', '/logos/clubs/fc-augsburg.png', 75.6),
  ('FC Barcelona', '/logos/clubs/fc-barcelona.png', 84.9),
  ('FC Basel 1893', '/logos/clubs/fc-basel-1893.png', 73),
  ('FC Bayern München', '/logos/clubs/fc-bayern-munchen.png', 86.3),
  ('FC Botoşani', '/logos/clubs/fc-botosani.png', 65.9),
  ('FC Dallas', '/logos/clubs/fc-dallas.gif', 70.7),
  ('FC Flyeralarm Admira', '/logos/clubs/fc-flyeralarm-admira.png', 65.7),
  ('FC Girondins de Bordeaux', '/logos/clubs/fc-girondins-de-bordeaux.png', 75.6),
  ('FC Ingolstadt 04', '/logos/clubs/fc-ingolstadt-04.png', 67.9),
  ('FC Lausanne-Sport', '/logos/clubs/fc-lausanne-sport.png', 67.4),
  ('FC Lokomotiv Moscow', '/logos/clubs/fc-lokomotiv-moscow.png', 75.6),
  ('FC Lorient', '/logos/clubs/fc-lorient.png', 72.5),
  ('FC Luzern', '/logos/clubs/fc-luzern.png', 71.1),
  ('FC Nantes', '/logos/clubs/fc-nantes.png', 74.5),
  ('FC Paços de Ferreira', '/logos/clubs/fc-pacos-de-ferreira.png', 72.5),
  ('FC Porto', '/logos/clubs/fc-porto.png', 79.7),
  ('FC Red Bull Salzburg', '/logos/clubs/fc-red-bull-salzburg.png', 73.1),
  ('FC Schalke 04', '/logos/clubs/fc-schalke-04.png', 72.8),
  ('FC Sion', '/logos/clubs/fc-sion.png', 69.3),
  ('FC Sochaux-Montbéliard', '/logos/clubs/fc-sochaux-montbeliard.png', 68.1),
  ('FC Utrecht', '/logos/clubs/fc-utrecht.png', 72),
  ('FCSB (Steaua)', '/logos/clubs/fcsb-steaua.png', 70.7),
  ('FK Austria Wien', '/logos/clubs/fk-austria-wien.png', 68),
  ('Fenerbahçe SK', '/logos/clubs/fenerbahce-sk.png', 75.9),
  ('Feyenoord', '/logos/clubs/feyenoord.png', 75.5),
  ('Fiorentina', '/logos/clubs/fiorentina.png', 77.6),
  ('Flamengo', '/logos/clubs/flamengo.gif', 77.5),
  ('Fluminense', '/logos/clubs/fluminense.gif', 74.5),
  ('Fulham', '/logos/clubs/fulham.png', 74.6),
  ('Galatasaray SK', '/logos/clubs/galatasaray-sk.png', 75),
  ('Gallos Blancos de Querétaro', '/logos/clubs/gallos-blancos-de-queretaro.gif', 69.5),
  ('Gaz Metan Mediaş', '/logos/clubs/gaz-metan-medias.png', 65.1),
  ('Genoa', '/logos/clubs/genoa.png', 75.7),
  ('Getafe CF', '/logos/clubs/getafe-cf.png', 77.8),
  ('Gimnasia y Esgrima La Plata', '/logos/clubs/gimnasia-y-esgrima-la-plata.png', 71.3),
  ('Godoy Cruz', '/logos/clubs/godoy-cruz.png', 70.3),
  ('Granada CF', '/logos/clubs/granada-cf.png', 78.4),
  ('Grasshopper Club Zürich', '/logos/clubs/grasshopper-club-zurich.png', 67.9),
  ('Grêmio', '/logos/clubs/gremio.jpg', 75.3),
  ('Hamburger SV', '/logos/clubs/hamburger-sv.png', 71.7),
  ('Hannover 96', '/logos/clubs/hannover-96.png', 70.9),
  ('Hellas Verona', '/logos/clubs/hellas-verona.png', 75.8),
  ('Hertha BSC', '/logos/clubs/hertha-bsc.png', 76.4),
  ('Hibernian', '/logos/clubs/hibernian.png', 68),
  ('Houston Dynamo', '/logos/clubs/houston-dynamo.gif', 69),
  ('Hull City', '/logos/clubs/hull-city.png', 68.2),
  ('Independiente del Valle', '/logos/clubs/independiente-del-valle.png', 70.3),
  ('Inter', '/logos/clubs/inter.png', 83.6),
  ('Internacional', '/logos/clubs/internacional.gif', 76),
  ('Junior FC', '/logos/clubs/junior-fc.png', 71.3),
  ('Juventus', '/logos/clubs/juventus.png', 84.3),
  ('KAA Gent', '/logos/clubs/kaa-gent.png', 72.9),
  ('KRC Genk', '/logos/clubs/krc-genk.png', 74.6),
  ('KSV Cercle Brugge', '/logos/clubs/ksv-cercle-brugge.png', 69),
  ('KV Kortrijk', '/logos/clubs/kv-kortrijk.png', 69.5),
  ('KV Mechelen', '/logos/clubs/kv-mechelen.png', 69.8),
  ('KV Oostende', '/logos/clubs/kv-oostende.png', 69.3),
  ('Karlsruher SC', '/logos/clubs/karlsruher-sc.png', 69.8),
  ('LA Galaxy', '/logos/clubs/la-galaxy.gif', 71.5),
  ('LDU Quito', '/logos/clubs/ldu-quito.png', 70.2),
  ('LOSC Lille', '/logos/clubs/losc-lille.png', 79.5),
  ('Lazio', '/logos/clubs/lazio.png', 81.3),
  ('Legia Warszawa', '/logos/clubs/legia-warszawa.png', 70.7),
  ('Levante Unión Deportiva', '/logos/clubs/levante-union-deportiva.png', 78.5),
  ('Liverpool', '/logos/clubs/liverpool.png', 86.7),
  ('Manchester City', '/logos/clubs/manchester-city.png', 86.8),
  ('Manchester United', '/logos/clubs/manchester-united.png', 85.8),
  ('Metropolitanos de Caracas FC', '/logos/clubs/metropolitanos-de-caracas-fc.png', 66.6),
  ('Montpellier Hérault SC', '/logos/clubs/montpellier-herault-sc.png', 75.9),
  ('Motherwell', '/logos/clubs/motherwell.png', 65.4),
  ('Málaga CF', '/logos/clubs/malaga-cf.png', 71.6),
  ('Napoli', '/logos/clubs/napoli.png', 82.2),
  ('New England Revolution', '/logos/clubs/new-england-revolution.gif', 70.9),
  ('New York City FC', '/logos/clubs/new-york-city-fc.gif', 71.7),
  ('New York Red Bulls', '/logos/clubs/new-york-red-bulls.gif', 69.8),
  ('Newcastle Jets', '/logos/clubs/newcastle-jets.png', 63.5),
  ('Newcastle United', '/logos/clubs/newcastle-united.png', 76.9),
  ('Norwich City', '/logos/clubs/norwich-city.png', 75.6),
  ('OGC Nice', '/logos/clubs/ogc-nice.png', 77.5),
  ('Oldham Athletic', '/logos/clubs/oldham-athletic.png', 63),
  ('Olympiacos CFP', '/logos/clubs/olympiacos-cfp.png', 77.7),
  ('Olympique Lyonnais', '/logos/clubs/olympique-lyonnais.png', 79.7),
  ('Olympique de Marseille', '/logos/clubs/olympique-de-marseille.png', 79.1),
  ('Oud-Heverlee Leuven', '/logos/clubs/oud-heverlee-leuven.png', 70.6),
  ('PAOK', '/logos/clubs/paok.png', 74.2),
  ('PSV', '/logos/clubs/psv.png', 77.8),
  ('Pachuca', '/logos/clubs/pachuca.gif', 72.6),
  ('Palmeiras', '/logos/clubs/palmeiras.gif', 76.1),
  ('Panathinaikos FC', '/logos/clubs/panathinaikos-fc.png', 73),
  ('Paris FC', '/logos/clubs/paris-fc.png', 68.7),
  ('Paris Saint-Germain', '/logos/clubs/paris-saint-germain.png', 88.2),
  ('Parma', '/logos/clubs/parma.png', 73),
  ('Philadelphia Union', '/logos/clubs/philadelphia-union.gif', 71.6),
  ('Piast Gliwice', '/logos/clubs/piast-gliwice.png', 67.5),
  ('Portland Timbers', '/logos/clubs/portland-timbers.gif', 73.2),
  ('Puebla FC', '/logos/clubs/puebla-fc.gif', 70.2),
  ('RC Celta de Vigo', '/logos/clubs/rc-celta-de-vigo.png', 77.4),
  ('RCD Espanyol de Barcelona', '/logos/clubs/rcd-espanyol-de-barcelona.png', 77.6),
  ('RSC Anderlecht', '/logos/clubs/rsc-anderlecht.png', 73.6),
  ('Racing Club', '/logos/clubs/racing-club.png', 75),
  ('Racing Club de Lens', '/logos/clubs/racing-club-de-lens.png', 75.3),
  ('Randers FC', '/logos/clubs/randers-fc.png', 68.1),
  ('Rangers FC', '/logos/clubs/rangers-fc.png', 75.6),
  ('Rapid București', '/logos/clubs/rapid-bucure-ti.png', 66),
  ('Rayo Vallecano', '/logos/clubs/rayo-vallecano.png', 75),
  ('Real Betis Balompié', '/logos/clubs/real-betis-balompie.png', 80),
  ('Real Madrid CF', '/logos/clubs/real-madrid-cf.png', 85.9),
  ('Real Salt Lake', '/logos/clubs/real-salt-lake.gif', 69.5),
  ('Real Sociedad', '/logos/clubs/real-sociedad.png', 81.5),
  ('Real Sociedad B', '/logos/clubs/real-sociedad-b.png', 67.5),
  ('Real Sporting de Gijón', '/logos/clubs/real-sporting-de-gijon.png', 72.2),
  ('Real Valladolid CF', '/logos/clubs/real-valladolid-cf.png', 75.6),
  ('River Plate', '/logos/clubs/river-plate.png', 77),
  ('Roma', '/logos/clubs/roma.png', 80.2),
  ('Rosario Central', '/logos/clubs/rosario-central.png', 72.5),
  ('Royal Charleroi S.C.', '/logos/clubs/royal-charleroi-s-c.png', 71.7),
  ('Royale Union Saint-Gilloise', '/logos/clubs/royale-union-saint-gilloise.png', 69.4),
  ('SC Bastia', '/logos/clubs/sc-bastia.png', 65.2),
  ('SC Braga', '/logos/clubs/sc-braga.png', 76.5),
  ('SC Freiburg II', '/logos/clubs/sc-freiburg-ii.png', 61.7),
  ('SC Paderborn 07', '/logos/clubs/sc-paderborn-07.png', 69.9),
  ('SC Rheindorf Altach', '/logos/clubs/sc-rheindorf-altach.jpg', 65.7),
  ('SG Dynamo Dresden', '/logos/clubs/sg-dynamo-dresden.png', 68.1),
  ('SK Austria Klagenfurt', '/logos/clubs/sk-austria-klagenfurt.png', 65),
  ('SK Rapid Wien', '/logos/clubs/sk-rapid-wien.png', 71.1),
  ('SK Slavia Praha', '/logos/clubs/sk-slavia-praha.png', 76.5),
  ('SK Sturm Graz', '/logos/clubs/sk-sturm-graz.png', 70.3),
  ('SL Benfica', '/logos/clubs/sl-benfica.png', 80.4),
  ('SV Ried', '/logos/clubs/sv-ried.png', 65.7),
  ('SV Sandhausen', '/logos/clubs/sv-sandhausen.png', 69.6),
  ('SV Werder Bremen', '/logos/clubs/sv-werder-bremen.png', 73.8),
  ('SV Zulte Waregem', '/logos/clubs/sv-zulte-waregem.png', 69.9),
  ('San Jose Earthquakes', '/logos/clubs/san-jose-earthquakes.gif', 70),
  ('San Lorenzo de Almagro', '/logos/clubs/san-lorenzo-de-almagro.png', 71.5),
  ('Santos', '/logos/clubs/santos.gif', 74.5),
  ('Santos Laguna', '/logos/clubs/santos-laguna.gif', 73.1),
  ('Seattle Sounders FC', '/logos/clubs/seattle-sounders-fc.gif', 73.8),
  ('Sevilla FC', '/logos/clubs/sevilla-fc.png', 83),
  ('Southampton', '/logos/clubs/southampton.png', 76.9),
  ('Spartak Moskva', '/logos/clubs/spartak-moskva.png', 76.4),
  ('Sport Club Corinthians Paulista', '/logos/clubs/sport-club-corinthians-paulista.jpg', 74.1),
  ('Sport-Club Freiburg', '/logos/clubs/sport-club-freiburg.png', 75.6),
  ('Sporting CP', '/logos/clubs/sporting-cp.png', 80),
  ('Sporting Kansas City', '/logos/clubs/sporting-kansas-city.png', 71.4),
  ('St. Johnstone FC', '/logos/clubs/st-johnstone-fc.png', 66),
  ('St. Patrick''s Athletic', '/logos/clubs/st-patrick-s-athletic.png', 62.4),
  ('Stade Rennais FC', '/logos/clubs/stade-rennais-fc.png', 77.3),
  ('Stade de Reims', '/logos/clubs/stade-de-reims.png', 74.5),
  ('Standard de Liège', '/logos/clubs/standard-de-liege.png', 72.4),
  ('Stoke City', '/logos/clubs/stoke-city.png', 71.4),
  ('Sunderland', '/logos/clubs/sunderland.png', 67),
  ('Swansea City', '/logos/clubs/swansea-city.png', 71.3),
  ('São Paulo', '/logos/clubs/sao-paulo.jpg', 74.8),
  ('TSG Hoffenheim', '/logos/clubs/tsg-hoffenheim.png', 77.7),
  ('TSV Egger Glas Hartberg', '/logos/clubs/tsv-egger-glas-hartberg.png', 66.1),
  ('Tigres U.A.N.L.', '/logos/clubs/tigres-u-a-n-l.gif', 76.7),
  ('Torino F.C.', '/logos/clubs/torino-f-c.png', 76.9),
  ('Toronto FC', '/logos/clubs/toronto-fc.gif', 71.7),
  ('Tottenham Hotspur', '/logos/clubs/tottenham-hotspur.png', 83.5),
  ('Toulouse Football Club', '/logos/clubs/toulouse-football-club.png', 69.5),
  ('Trabzonspor', '/logos/clubs/trabzonspor.png', 76),
  ('U.C. Sampdoria', '/logos/clubs/u-c-sampdoria.png', 76.5),
  ('U.S. Sassuolo Calcio', '/logos/clubs/u-s-sassuolo-calcio.png', 76.5),
  ('Udinese Calcio', '/logos/clubs/udinese-calcio.png', 75.5),
  ('Unión Deportiva Almería', '/logos/clubs/union-deportiva-almeria.png', 74),
  ('Unión Deportiva Las Palmas', '/logos/clubs/union-deportiva-las-palmas.png', 71.4),
  ('Unión La Calera', '/logos/clubs/union-la-calera.png', 68.9),
  ('Unión de Santa Fe', '/logos/clubs/union-de-santa-fe.png', 70.4),
  ('Valencia CF', '/logos/clubs/valencia-cf.png', 79.5),
  ('Valenciennes FC', '/logos/clubs/valenciennes-fc.png', 69.1),
  ('Vancouver Whitecaps FC', '/logos/clubs/vancouver-whitecaps-fc.gif', 70.4),
  ('VfB Stuttgart', '/logos/clubs/vfb-stuttgart.png', 75.5),
  ('VfL Bochum 1848', '/logos/clubs/vfl-bochum-1848.png', 72.6),
  ('VfL Wolfsburg', '/logos/clubs/vfl-wolfsburg.png', 79.8),
  ('Villarreal CF', '/logos/clubs/villarreal-cf.png', 81.6),
  ('Vitesse', '/logos/clubs/vitesse.png', 72.4),
  ('Vitória de Guimarães', '/logos/clubs/vitoria-de-guimaraes.jpg', 73.7),
  ('Vélez Sarsfield', '/logos/clubs/velez-sarsfield.gif', 74),
  ('West Bromwich Albion', '/logos/clubs/west-bromwich-albion.png', 73.2),
  ('West Ham United', '/logos/clubs/west-ham-united.png', 80.5),
  ('Wigan Athletic', '/logos/clubs/wigan-athletic.png', 67.6)
on conflict (club_name) do update
  set logo_path = excluded.logo_path,
      strength  = excluded.strength;

-- Vincular el escudo a las identidades de jugador
alter table public.player_identities
  add column if not exists club_logo text;

update public.player_identities i
  set club_logo = a.logo_path
  from public.club_assets a
  where i.club_name = a.club_name;

-- ------------------------------------------------------------
-- 2) Rivales IA = clubes reales
-- ------------------------------------------------------------
alter table public.ai_opponents
  add column if not exists real_club text,
  add column if not exists logo_path text;

-- Los rivales ficticios anteriores (Cantera FC, etc.) NO se borran:
-- tus partidos ya jugados los referencian y perderías el historial.
-- En vez de eso se marcan como inactivos y dejan de ofrecerse.
alter table public.ai_opponents
  add column if not exists active boolean not null default true;

update public.ai_opponents set active = false where real_club is null;

-- Si el club real ya existía como rival (reejecución), se limpia para
-- no duplicarlo. Solo se borran los que nadie jugó todavía.
delete from public.ai_opponents ao
where ao.real_club is not null
  and not exists (select 1 from public.matches m where m.ai_opponent = ao.id);

-- Los que sí tienen partidos jugados se actualizan en el sitio.
update public.ai_opponents ao
set logo_path = a.logo_path,
    rating    = round(a.strength)::int,
    active    = true
from public.club_assets a
where ao.real_club = a.club_name;

-- Estilo táctico derivado del perfil real de la plantilla:
-- mucho ataque -> ofensivo; mucha defensa -> defensivo; etc.
insert into public.ai_opponents (name, style, tier, rating, formation, sort, real_club, logo_path)
select
  a.club_name,
  case
    when a.strength >= 84 then 'possession'
    when a.strength >= 78 then 'high_press'
    when a.strength >= 72 then 'offensive'
    when a.strength >= 66 then 'counter'
    else 'defensive'
  end,
  case
    when a.strength >= 84 then 'legendary'
    when a.strength >= 79 then 'elite'
    when a.strength >= 74 then 'strong'
    when a.strength >= 68 then 'medium'
    else 'weak'
  end,
  round(a.strength)::int,
  case
    when a.strength >= 84 then '4-3-3'
    when a.strength >= 76 then '4-2-3-1'
    when a.strength >= 70 then '4-3-3'
    else '4-4-2'
  end,
  round((100 - a.strength) * 10)::int,
  a.club_name,
  a.logo_path
from public.club_assets a
where exists (
  -- solo clubes con plantilla suficiente en el catálogo
  select 1 from public.player_identities i
  where i.club_name = a.club_name
  group by i.club_name having count(*) >= 14
)
-- evitar duplicados si la migración se ejecuta más de una vez
and not exists (
  select 1 from public.ai_opponents ao where ao.real_club = a.club_name
);

-- ------------------------------------------------------------
-- 3) Plantilla real de un club (la usa el simulador)
-- ------------------------------------------------------------
-- Nota: `position` es palabra reservada en PostgreSQL, así que las
-- columnas de salida van entre comillas dobles.
create or replace function public.club_squad(p_club text, p_limit int default 20)
returns TABLE(
  "name" text,
  "position" text,
  "overall" int,
  "attributes" jsonb,
  "gk_attributes" jsonb,
  "club_name" text,
  "league_name" text,
  "nationality" text
)
language sql stable security definer set search_path = public as $$
  select i.name, t.position, t.overall, t.attributes, t.gk_attributes,
         i.club_name, i.league_name, i.nationality
  from public.player_templates t
  join public.player_identities i on i.id = t.identity_id
  where i.club_name = p_club
  order by t.overall desc
  limit p_limit;
$$;
grant execute on function public.club_squad(text, int) to anon, authenticated;

-- ------------------------------------------------------------
-- Comprobación
-- ------------------------------------------------------------
select
  (select count(*) from public.club_assets)                        as clubes_con_escudo,
  (select count(*) from public.ai_opponents where active)          as rivales_ia,
  (select count(*) from public.player_identities where club_logo is not null) as jugadores_con_escudo,
  (select round(max(strength)) from public.club_assets)            as mejor_club,
  (select round(min(strength)) from public.club_assets)            as peor_club;
