CREATE INDEX IF NOT EXISTS idx_transactions_user_created_id
  ON public.transactions (user_id, created_at DESC, id DESC);
