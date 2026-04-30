CREATE TABLE IF NOT EXISTS benchmark_history (
  id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  game_id TEXT NOT NULL,
  game_label TEXT NOT NULL,
  game_short_label TEXT NOT NULL,
  options_json TEXT NOT NULL,
  models_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_benchmark_history_game_generated
  ON benchmark_history (game_id, generated_at DESC);
