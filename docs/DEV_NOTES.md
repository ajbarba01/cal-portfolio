## Now

- generalize reschedule to paid bookings: a reschedule entry point on /account/bookings, house-sitting month-range mode, and recurring-series "this occurrence vs series" semantics. Core `rescheduleBookingCore` (in-place time move + re-validation) already exists; meet-greet is its first consumer.
- cal should have an email created for automated emails
- return to top button bottom right
- gallery lightbox still slow
- redirects to log in/set up account should redirect you back to the page you were at before so you don't have to navigate and enter a booking twice or stuff like that.
- audit for responsiveness and best performance practices for react.
- cancel bookings
- redirect or something after succesful booking, booking button just breaks instead
- email or text notifications for cal (can come when contact workflow comes)
- your bookings should show as muted clay in time slots
- the time based calendar needs a little work: should have somewhere that says where exactly your current booking is.
- booking confirmation popup with details about prepaying, and penalty for cancellation
- wordmark should have a notification badge next to it for admins. as well as admin tabs?
- restyle pop-ups
- cal needs a way to manually input bookings
- more information for services inside each booking
- inquiries tab for account - cancel, view status, view message, maybe edit?
- ensure text wrapping for any area where text could overflow (like sending a long contact message overflows). also the inquiry view could just show the first like few lines of the inquiry and then allow cal to click on it to create a popup that has the actual options for email, text, and resolution (better for mobile too)
- Toasts are like a set length. idk should be redesigned slightly
- use of "we" and cal third person throughout the site. idk need cals opinion
- onboarding page should be part of account (this is why the account underline doesn't work in the nav bar when in onboarding)
- "more lead time required" should never be an error, it should just mean those days are unavailable for booking (or ig it could say somewhere to contact cal for really soon bookings)
- cal should also have a way to ban a user from scheduling meet and greets (does rejected do this?)
- cancel booking should allow a reason (which should be included in the email notif)
- admin booking on behalf add pet button adds a pet for admin not for the client (maybe we could just remove the add pet button here and allow it to be editable in the admin client view)

## Larger categories

- notification system (dedicated email address, )
- admin + contact page redesign
- admin input bookings and account bookings reschedule (admin should also be able to edit booking through reschedule)
- whole site cohesiveness pass
- performance and responsiveness pass
- payment system
- recurring bookings rework

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
