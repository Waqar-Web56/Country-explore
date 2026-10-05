# Atlas — Country Explorer

Static site: HTML, CSS, JavaScript and Tailwind (CDN). No build step.

## Run
Open `index.html` in a browser, or serve the folder:

    npx serve .

## Notes
- Data comes from https://restcountries.com (free, no key required).
- `.env` holds your key. Browsers cannot read `.env` files, so the key is not used in client code (which is intentional: anything in front-end JS is public).
- `.env` is listed in `.gitignore`.
