- need good mobile
- design overhaul
- errors need to be descriptive and human readable
- account system should have tabs for information (changing info, reset password, delete account, etc...), bookings (current bookings where you can cancel or prepay or modfiy), pets (edit, remove, or add pets), history (completed bookings for information and like to tip), any any others???
- cal should have an email created for automated emails
- website logo
- setup page analytics for vercel
- nav text is a little hard to see
- overscroll?
- gallery: click empty space to exit lightbox, remove "out on the trail", images load so slow into lightbox

## admin UI owed by booking-rules-v2 (see docs/superpowers/plans/2026-06-03-booking-rules-v2.md)

- `/admin/settings`: hour+minute pickers writing `booking_open_minute` / `booking_close_minute` (not integer hours); inputs for the new miles/horizon/refund settings
- `/admin/bookings`: "grant full refund" + "mark no-show" actions; surface series occurrences the roll cron left pending on a conflict
- admin debt view: outstanding `client_debits` per client + "mark settled" action
- recurring booking UI: weekly with fixed-week-count or "no end" toggle

## future ideas

- dynamic gallery based on priority of photos (also should be able to select individual photos and expand them and see a description or something)
- contact page?
- placeholder accounts so clients can still manually input bookings with these placeholder accounts and then migrate them in the future if the client makes an account
