DO $$
DECLARE
  rec record;
  new_id uuid;
  users jsonb := '[
    {"email":"admin@factory.local","password":"Admin@123","name":"مدیر کارخانه","role":"factory_manager"},
    {"email":"sales.manager@factory.local","password":"Sales@123","name":"مدیر فروش","role":"sales_manager"},
    {"email":"sales1@factory.local","password":"Sales@123","name":"کارشناس فروش ۱","role":"sales_expert"},
    {"email":"sales2@factory.local","password":"Sales@123","name":"کارشناس فروش ۲","role":"sales_expert"},
    {"email":"production@factory.local","password":"Prod@123","name":"مدیر تولید","role":"production_manager"},
    {"email":"warehouse@factory.local","password":"Ware@123","name":"انباردار","role":"warehouse_keeper"}
  ]'::jsonb;
BEGIN
  FOR rec IN SELECT value AS j FROM jsonb_array_elements(users)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = rec.j->>'email') THEN
      new_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_super_admin,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
        rec.j->>'email', crypt(rec.j->>'password', gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.j->>'name'),
        false, '', '', '', ''
      );

      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        created_at, updated_at, last_sign_in_at
      ) VALUES (
        gen_random_uuid(), new_id, new_id::text,
        jsonb_build_object('sub', new_id::text, 'email', rec.j->>'email'),
        'email', now(), now(), now()
      );

      INSERT INTO public.user_profiles (user_id, full_name, role)
        VALUES (new_id, rec.j->>'name', (rec.j->>'role')::public.app_role);

      -- Also seed user_roles for legacy has_role() admin checks (give factory_manager admin role)
      IF rec.j->>'role' = 'factory_manager' THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (new_id, 'admin') ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END LOOP;
END $$;