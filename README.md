# AquaFix Website

One-page website for **AquaFix (ETS Eid)**, a pool equipment and water treatment shop in El Naame, Mount Lebanon. Built as a senior project.

Layout is based on the Pizi pool services template. Product photos come from the business Instagram [@ets.eid](https://www.instagram.com/ets.eid/).

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 5173
```

## Structure

- `index.html`: all page sections
- `assets/css/style.css`: theme and responsive styles
- `assets/js/main.js`: navbar, counters, tabs, product filter, WhatsApp quote form
- `assets/img/`: logo and product photos

## To do

- Replace placeholder phone, email and WhatsApp number (`CONTACT` in `assets/js/main.js`)
- Add chatbot (mounts in `#chatbot-root`)
