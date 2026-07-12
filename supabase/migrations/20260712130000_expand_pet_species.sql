-- Expand pet_species from dog/cat to the full pet taxonomy. Additive: existing
-- dog/cat rows are untouched, no data migration. New values are only ADDED here
-- (never used in this same file), so this is safe inside the migration tx.
alter type pet_species add value if not exists 'bird';
alter type pet_species add value if not exists 'rodent';
alter type pet_species add value if not exists 'reptile';
alter type pet_species add value if not exists 'fish';
alter type pet_species add value if not exists 'other';
