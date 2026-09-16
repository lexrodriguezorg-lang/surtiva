begin;
-- Owner explicitly confirmed the Gmail address on 2026-09-16.
-- Preserve the existing one-time bootstrap and require verified email.
update private.owner_bootstrap set email='lexrodriguezorg@gmail.com'
where email='lexrodriguezorg@mail.com';

-- Re-run the existing verification trigger for the already-confirmed account.
-- This does not confirm an email or change a password.
update auth.users set email_confirmed_at=email_confirmed_at
where lower(email)='lexrodriguezorg@gmail.com' and email_confirmed_at is not null;
commit;
