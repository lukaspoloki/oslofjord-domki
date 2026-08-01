# Nederlandse versie (apart)

Publieke kaart: [lukaspoloki.github.io/oslofjord-domki/nl/](https://lukaspoloki.github.io/oslofjord-domki/nl/)

Dit is een **volledig aparte** Nederlandse app naast de Poolse Oslofjord-versie:

| | Pools (`/`) | Nederlands (`/nl/`) |
|---|---|---|
| UI-taal | Pools | Nederlands |
| Data | `data.json` | `nl/data.json` |
| Bewoners & kamers | Oslofjord | eigen set |
| Straten | Oslofjordveien / Rekketun | configureerbaar in `meta` |

## Data invullen

Bewerk alleen `nl/data.json`. De huidige inhoud is **voorbeelddata** (gebouwen + namen) om de app te laten werken — vervang die door jullie echte park, kamers en mensen.

```json
{
  "meta": {
    "brand": "Jouw park — huisjes",
    "title": "Jouw park — wie woont waar",
    "street": "Hoofdstraat",
    "altStreet": "Zijpad",
    "altPrefix": "L",
    "altKind": "rijtjes",
    "altKindLabel": "rijtjeshuis",
    "mainKindLabel": "huisje",
    "searchHint": "Jansen, L3, rijtjes"
  },
  "buildings": {
    "1": { "lat": 52.15, "lng": 5.39 },
    "L2": { "lat": 52.151, "lng": 5.388 }
  },
  "apartments": [
    { "building": "1", "apt": "101", "residents": ["Voornaam Achternaam"] }
  ]
}
```

- Gewone gebouwen: nummers (`1`, `2`, …) → `meta.street`
- Alternatieve rij / “slang”: prefix uit `meta.altPrefix` (standaard `L`, bijv. `L2`) → `meta.altStreet`
- Appartementnummers: zelfde 3-cijferige stijl als de Poolse app (`101`, `208`, …); eerste cijfer = verdieping
