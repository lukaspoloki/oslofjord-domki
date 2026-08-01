# Nederlandse versie (apart)

Publieke kaart: [lukaspoloki.github.io/oslofjord-domki/nl/](https://lukaspoloki.github.io/oslofjord-domki/nl/)

Dit is een **aparte** Nederlandse app naast de Poolse Oslofjord-versie. De **gebouwen zijn hetzelfde** (Oslofjordveien + Rekketun), maar bewoners en appartementen staan in een eigen bestand.

| | Pools (`/`) | Nederlands (`/nl/`) |
|---|---|---|
| UI-taal | Pools | Nederlands |
| Data | `data.json` | `nl/data.json` |
| Gebouwen / coords | Oslofjord | **zelfde** |
| Bewoners & kamers | Poolse set | eigen Nederlandse set |

## Adressen

Zelfde als de Poolse app:

- **Huisjes** (Oslofjordveien) — gewoon nummer, bijv. `3/203`, `8/208`, `24/502`
- **Rekketun** — prefix `R`, bijv. `R8/208`, `R2/417`

## Data invullen

Bewerk alleen `nl/data.json` voor Nederlandse bewoners. Laat `buildings` gelijk aan de Poolse `data.json` (of sync ze mee als er een gebouw bij komt).

```json
{
  "meta": {
    "brand": "Oslofjord — huisjes",
    "street": "Oslofjordveien",
    "altStreet": "Rekketun",
    "altPrefix": "R",
    "altKind": "rekketun"
  },
  "buildings": { "...zelfde als poolse data.json..." },
  "apartments": [
    { "building": "1", "apt": "203", "residents": ["Voornaam Achternaam"] }
  ]
}
```

De huidige `apartments` zijn **voorbeeldnamen** — vervang ze door jullie echte Nederlandse bewonerslijst.
