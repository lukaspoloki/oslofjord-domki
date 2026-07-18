# Oslofjord domki

Mapa mieszkańców (GitHub Pages) + prywatny bot Telegram do edycji `data.json`.

- **Mapa:** `index.html` + `data.json` (publikowane przez GitHub Pages)
- **Bot:** `bot/` — zero zależności, Node.js ≥ 18, zapis przez GitHub API (każda zmiana = commit)

---

## 1. BotFather (Telegram)

1. W Telegramie otwórz [@BotFather](https://t.me/BotFather) → `/newbot`
2. Podaj nazwę i username (np. `oslofjord_domki_bot`)
3. Skopiuj **token** (`123456789:AA…`) — to będzie `BOT_TOKEN`
4. Opcjonalnie: `/setprivacy` → Disable (nie jest wymagane przy DM)

## 2. Personal Access Token (GitHub)

Bot potrzebuje osobnego tokenu z zapisem do `data.json`:

1. [Fine-grained PAT](https://github.com/settings/personal-access-tokens/new)
2. Repository access → tylko `lukaspoloki/oslofjord-domki`
3. Permissions → **Contents: Read and write**
4. Wygeneruj i skopiuj token (`github_pat_…`) — to będzie `GITHUB_TOKEN`

## 3. Lokalny test bota

```bash
cd bot
cp .env.example .env
# uzupełnij BOT_TOKEN i GITHUB_TOKEN
node bot.js
```

Napisz do bota cokolwiek — odpisze Twoje Telegram ID. Wpisz je jako `ALLOWED_USER_ID` w `.env` i zrestartuj.

Przydatne komendy: `/menu`, `lista`, `dodaj 3/203 Anna Kowalska`, `usuń Anna Kowalska`.

## 4. GitHub Pages

Repozytorium jest publiczne; Pages serwuje root z gałęzi `main`.

URL mapy (po włączeniu Pages, zwykle po 1–2 min):

`https://lukaspoloki.github.io/oslofjord-domki/`

## 5. Wdrożenie na Mikrus (systemd)

Na VPS (Node.js ≥ 18):

```bash
# sklonuj / zaktualizuj kod
mkdir -p /opt/oslofjord-domki
cd /opt/oslofjord-domki
# jeśli jeszcze nie ma:
# git clone https://github.com/lukaspoloki/oslofjord-domki.git .

cp bot/.env.example bot/.env
nano bot/.env   # BOT_TOKEN, ALLOWED_USER_ID, GITHUB_TOKEN

# jednostka systemd
cp bot/oslofjord-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now oslofjord-bot
systemctl status oslofjord-bot
journalctl -u oslofjord-bot -f
```

Aktualizacja kodu:

```bash
cd /opt/oslofjord-domki && git pull
systemctl restart oslofjord-bot
```

## Bezpieczeństwo

- `.env` nigdy nie trafia do gita (jest w `.gitignore`)
- Bot akceptuje wiadomości **tylko** od `ALLOWED_USER_ID`
- PAT ogranicz do jednego repo i uprawnienia Contents
- Hasło root VPS zmień po pierwszym logowaniu (`passwd`)
