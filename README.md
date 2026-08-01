# Oslofjord domki

Publiczna mapa mieszkańców: [lukaspoloki.github.io/oslofjord-domki](https://lukaspoloki.github.io/oslofjord-domki/)

W repozytorium są tylko pliki stronki (`index.html`, `data.json`). Edycja danych odbywa się botem Telegram (poza gitem).

## Nederlandse versie (apart)

Aparte Nederlandse app (zelfde gebouwen, andere bewoners) op een **eigen GitHub Pages-repo**:

- Kaart: [lukaspoloki.github.io/oslofjord-huisjes](https://lukaspoloki.github.io/oslofjord-huisjes/)
- Repo: [lukaspoloki/oslofjord-huisjes](https://github.com/lukaspoloki/oslofjord-huisjes)
- Publiceren vanuit deze branch: `./scripts/publish-huisjes.sh` (bestanden in `standalone-huisjes/`)
- Lokale preview hier: [`nl/`](nl/) — zie [nl/README.md](nl/README.md)

## Adresy budynków

- **Domki** (Oslofjordveien) — zwykły numer, np. `3/203`, `8/208`, `24/502`
- **Rekketun** — prefiks `R`, np. `R8/208`, `R2/417`

Rekketun to osobny „wąż” zachodnio od hotelu (wzdłuż Bekkeveien): **R2, R4, R6, R8, R10, R12**.
To **nie** te same budynki co Oslofjordveien 2–12 — adres `R8/208` ≠ `8/208`.

Bot Telegram musi akceptować prefiks `R` w adresach (`R8/208`) oraz w komendach
`dodaj` / `usuń` / `zmień` / `przenieś` / `lista` / `budynek`.
