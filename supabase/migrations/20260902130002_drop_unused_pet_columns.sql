-- Drop the pet identity columns nothing ever wrote.
--
-- 20260616130001_pets_identity_columns.sql added these for an intake form that
-- shipped as a form_responses payload instead: PET_COLUMNS, the one canonical
-- pets select, never listed them, and no insert or update in the app names one,
-- so every value is null. The vet pair is the misleading half — owner-schema.ts
-- pointed at pets.vet_name / pets.vet_phone while the owner form was the only
-- surface collecting vet contact, and it stores them in its own payload.
--
-- Freeform pet detail (medical, behavior, feeding, meds) stays where it already
-- lives, in the pet-scoped form_responses row; birthdate stays a column because
-- pricing reads it.
--
-- The guard makes the destructive step explicit: on any database where these
-- columns did collect something, the migration stops instead of deleting it.

do $$
begin
  if exists (
    select 1 from pets
    where age is not null
       or sex is not null
       or spayed_neutered is not null
       or weight is not null
       or vet_name is not null
       or vet_phone is not null
       or vet_address is not null
       or emergency_vet is not null
  ) then
    raise exception 'pets identity columns hold data; export it before dropping';
  end if;
end $$;

alter table pets
  drop column if exists age,
  drop column if exists sex,
  drop column if exists spayed_neutered,
  drop column if exists weight,
  drop column if exists vet_name,
  drop column if exists vet_phone,
  drop column if exists vet_address,
  drop column if exists emergency_vet;
