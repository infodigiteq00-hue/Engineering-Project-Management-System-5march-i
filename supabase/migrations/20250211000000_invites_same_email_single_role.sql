-- Block same email with different role in invites.
-- Same email can appear multiple times only with the same role.

CREATE OR REPLACE FUNCTION check_invites_email_single_role()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invites i
    WHERE lower(trim(i.email)) = lower(trim(NEW.email))
      AND (i.role IS DISTINCT FROM NEW.role)
      AND (TG_OP <> 'UPDATE' OR i.id IS DISTINCT FROM NEW.id)
  ) THEN
    RAISE EXCEPTION 'This email already exists with a different role. Same email cannot have multiple roles.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_invites_email_single_role ON public.invites;
CREATE TRIGGER enforce_invites_email_single_role
  BEFORE INSERT OR UPDATE OF email, role ON public.invites
  FOR EACH ROW EXECUTE PROCEDURE check_invites_email_single_role();
