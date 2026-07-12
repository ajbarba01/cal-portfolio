-- Record HOW a debit was cleared/changed, for admin reporting. Does not affect
-- the outstanding-balance projection (that still keys off settled_at is null).
alter table client_debits
  add column resolution text
    check (resolution in ('paid', 'waived', 'adjusted'));
