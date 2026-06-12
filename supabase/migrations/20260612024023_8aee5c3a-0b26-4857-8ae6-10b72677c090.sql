
-- 1. Role enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. has_role security definer helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. RLS for user_roles
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Transactions table
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  shares numeric NOT NULL CHECK (shares > 0),
  price numeric NOT NULL CHECK (price >= 0),
  total numeric NOT NULL CHECK (total >= 0),
  balance_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_created ON public.transactions (user_id, created_at DESC);

GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 5. Atomic trade function
CREATE OR REPLACE FUNCTION public.execute_trade(
  _user_id uuid,
  _slug text,
  _side text,
  _shares numeric
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_char_id uuid;
  v_price numeric;
  v_balance numeric;
  v_cost numeric;
  v_held_shares numeric := 0;
  v_held_avg numeric := 0;
  v_new_shares numeric;
  v_new_avg numeric;
  v_new_balance numeric;
  v_tx public.transactions;
BEGIN
  IF _shares <= 0 THEN RAISE EXCEPTION 'Shares must be positive'; END IF;
  IF _side NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid side'; END IF;

  -- Lock character row to snapshot price
  SELECT id, current_price INTO v_char_id, v_price
  FROM public.characters WHERE slug = _slug FOR SHARE;
  IF v_char_id IS NULL THEN RAISE EXCEPTION 'Character not found'; END IF;

  -- Lock wallet row (serializes concurrent trades by same user)
  SELECT berries INTO v_balance
  FROM public.user_wallets WHERE user_id = _user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  -- Lock holding row if exists
  SELECT shares, avg_cost INTO v_held_shares, v_held_avg
  FROM public.user_holdings
  WHERE user_id = _user_id AND character_id = v_char_id
  FOR UPDATE;
  v_held_shares := COALESCE(v_held_shares, 0);
  v_held_avg := COALESCE(v_held_avg, 0);

  v_cost := v_price * _shares;

  IF _side = 'buy' THEN
    IF v_balance < v_cost THEN RAISE EXCEPTION 'Insufficient Berries'; END IF;
    v_new_balance := v_balance - v_cost;
    v_new_shares := v_held_shares + _shares;
    v_new_avg := CASE WHEN v_new_shares = 0 THEN 0
                      ELSE (v_held_avg * v_held_shares + v_cost) / v_new_shares END;
  ELSE
    IF v_held_shares < _shares THEN RAISE EXCEPTION 'Insufficient shares'; END IF;
    v_new_balance := v_balance + v_cost;
    v_new_shares := v_held_shares - _shares;
    v_new_avg := v_held_avg; -- avg cost preserved on partial sells
  END IF;

  UPDATE public.user_wallets
    SET berries = v_new_balance, updated_at = now()
    WHERE user_id = _user_id;

  IF v_held_shares = 0 AND _side = 'buy' THEN
    INSERT INTO public.user_holdings (user_id, character_id, shares, avg_cost)
    VALUES (_user_id, v_char_id, v_new_shares, v_new_avg);
  ELSIF v_new_shares = 0 THEN
    DELETE FROM public.user_holdings
      WHERE user_id = _user_id AND character_id = v_char_id;
  ELSE
    UPDATE public.user_holdings
      SET shares = v_new_shares, avg_cost = v_new_avg, updated_at = now()
      WHERE user_id = _user_id AND character_id = v_char_id;
  END IF;

  INSERT INTO public.transactions
    (user_id, character_id, side, shares, price, total, balance_after)
  VALUES (_user_id, v_char_id, _side, _shares, v_price, v_cost, v_new_balance)
  RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_trade(uuid,text,text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_trade(uuid,text,text,numeric) TO service_role;
