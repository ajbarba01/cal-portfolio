## Now

- cal should have an email created for automated emails
- return to top button bottom right
- gallery lightbox still slow
- contact page
- redirects to log in/set up account should redirect you back to the page you were at before so you don't have to navigate and enter a booking twice or stuff like that.
- audit for responsiveness and best performance practices for react.
- cancel bookings
- redirect or something after succesful booking, booking button just breaks instead
- email or text notifications for cal (can come when contact workflow comes)
- your bookings should show as muted clay in time slots
- the time based calendar needs a little work: should have somewhere that says where exactly you're current booking is.
- booking confirmation popup with details about prepaying, and penalty for cancellation
- ughhh i need a clients page and an admin client view sheesh
- merge booking and services page
- meet and greet

## Later

- website logo
- setup page analytics for vercel
- email icon footer + change those links in footer

## admin UI owed by booking-rules-v2 (see docs/superpowers/plans/2026-06-03-booking-rules-v2.md)

- `/admin/settings`: hour+minute pickers writing `booking_open_minute` / `booking_close_minute` (not integer hours); inputs for the new miles/horizon/refund settings
- `/admin/bookings`: "grant full refund" + "mark no-show" actions; surface series occurrences the roll cron left pending on a conflict
- admin debt view: outstanding `client_debits` per client + "mark settled" action
- recurring booking UI: weekly with fixed-week-count or "no end" toggle

## future ideas

- dynamic gallery based on priority of photos (also should be able to select individual photos and expand them and see a description or something)
- contact page?
- placeholder accounts so clients can still manually input bookings with these placeholder accounts and then migrate them in the future if the client makes an account
