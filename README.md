# Bistro Kóšta

Slovenian restaurant website with an owner dashboard, a kitchen screen and guest reservations.

Run `npm ci` and `npm run dev` with Node.js 24. Open [the website](http://127.0.0.1:3000), [owner dashboard](http://127.0.0.1:3000/admin), or [kitchen display](http://127.0.0.1:3000/kitchen). The dashboard displays local preview passwords. The preview saves to SQLite in `.data/` and does not need a mail account. Use fictional contact details in the preview. Run `npm test` to exercise publishing, guest bookings, simultaneous requests for the same capacity, owner confirmation and kitchen access.

- **Dnevni meni** — select the service date, add dishes, copy the previous service menu, or load the 15 April example, and publish. Customers see the menu for the current day or the date they select when booking. Toggle each dish's visibility and preorder availability separately.
- **Rezervacije** — enter a phone reservation, filter a day's reservations, confirm requests, edit details and dishes, and send a kitchen note. The booking preserves the chosen dish names, quantities and prices when the menu changes.
- **Kuhinja** — portions grouped by service time, followed by table tickets with party size, guest requests, and kitchen notes. Advance tickets through preparation, ready and served. The screen updates every 10 seconds and omits guest contact details.
- **Fotografije** — upload or replace gallery and headline images, change captions, and reorder the gallery. Uploads are resized and stored with the site data.

Add `?demo=1` to the site, owner dashboard, or kitchen URL to try the booking workflow with fictional data. These views share a store in the same browser. The kitchen link on the owner dashboard opens the selected service date.

## Vercel and email

Import the repository in Vercel and use its Node.js 24 runtime. Set the values in [`.env.example`](.env.example) in Vercel. `DATABASE_URL` points to a durable PostgreSQL database with permission to create the two Bistro tables on first use. Use a long random `SESSION_SECRET` and distinct staff passwords of at least 12 characters. For Resend, verify the sending domain and set `RESEND_API_KEY` and `RESERVATION_FROM` (for example, `Bistro Kóšta <reservations@example.com>`).

Without a database, Vercel serves the public site with the example and standing menus. Staff access and online booking become available after configuration. On the Kóšta production site, online requests enter the owner’s queue for confirmation by phone. The owner can change availability in Nastavitve. New installations start closed. Confirm opening hours, menu prices and allergens, set the number of seats and the length of each booking, and test delivery to a business mailbox before enabling reservations. In **Nastavitve**, choose whether available bookings are confirmed immediately or held for review. With a verified sender configured, confirmation can send an email. A request accepted for phone confirmation keeps that channel. The owner can retry failed emails on the reservation. Capacity accounts for overlapping reservations, including pending requests.

The food gallery and branded soup photographs use the bistro’s supplied images. The bread and terrace photographs and listing details come from [Marende](https://www.marende.si/ponudnik.php?id=220). The owner can update the gallery in Fotografije. Font licenses are in [`public/fonts`](public/fonts).
