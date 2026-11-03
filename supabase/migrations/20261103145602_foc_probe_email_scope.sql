-- Temporary guard may inspect only email, never password hashes.
grant select(email) on auth.users to service_role;
