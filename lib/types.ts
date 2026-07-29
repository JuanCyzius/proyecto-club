export type Profile = {
  id: string;
  username: string;
  club_name: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  division: number;
  created_at: string;
  last_daily?: string | null;
  daily_streak?: number;
  season_xp?: number;
  rating?: number;
  crest_club?: string | null;
  crest_chosen?: boolean;
};
