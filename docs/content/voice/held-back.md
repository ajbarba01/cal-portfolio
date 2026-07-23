# Held-back strings (blind round)

> Do not read this file during calibration. These five strings are the control
> for the blind round: they exist to test whether the skill generalizes beyond
> the strings the maintainer reacted to. Reading them first destroys the test.

| #   | String                                                                                   | Location                                                                                  | Surface  |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| 1   | `A valid email is required`                                                              | `src/features/admin/create-client-actions.ts:30`                                          | feedback |
| 2   | `Complete your required profiles before changing this booking — see Account → Profiles.` | `src/app/(site)/(account)/account/bookings/[id]/edit/_components/use-edit-booking.ts:304` | feedback |
| 3   | `Add or edit your pets. Name, species, breed, a photo, and any care notes.`              | `src/app/(site)/(account)/account/pets/page.tsx:47`                                       | client   |
| 4   | `Update your contact info. Email is managed through your login.`                         | `src/app/(site)/(account)/account/page.tsx:26`                                            | client   |
| 5   | `Approve, edit, or cancel right from the row.`                                           | `src/app/(site)/(admin)/admin/bookings/page.tsx:35`                                       | admin    |
