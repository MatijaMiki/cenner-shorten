# Shorten — Personal URL shortener

A minimal URL shortener for personal use. Store short codes that redirect to long URLs. Built so it can later be extended for public use (auth, rate limits, analytics).

## Quick start

```bash
cd url-shortener
npm install
npm start
```

Open **http://localhost:3333**. Create short links from the form; visiting `http://localhost:3333/<code>` redirects to the original URL.

## Features

- **Create links**: Paste a URL, optionally set a custom short code and notes.
- **List & manage**: See all links, copy short URL, open target, or delete.
- **Redirects**: `GET /:code` → 302 redirect to the stored URL.
- **SQLite**: Data stored in `links.db` (path overridable with `DB_PATH`).

## API (for scripts or future clients)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/links` | Create link. Body: `{ "url": "https://...", "code?: "optional", "notes?: "" }` |
| `GET`  | `/api/links` | List all links with `short_url` and metadata |
| `DELETE` | `/api/links/:code` | Delete link by short code |

## Config

- **Port**: `PORT` (default `3333`)
- **Database**: `DB_PATH` (default `./links.db`)

## iPhone & macOS app

The same web UI runs as a native app via **Capacitor** (iOS). You can run it on **iPhone** and on **Mac** using **Mac Catalyst** (one iOS target, run as Mac app).

### Requirements

- **macOS** with **Xcode** (from the Mac App Store) and **Xcode Command Line Tools**
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)

### Build and run

1. **Install iOS dependencies** (from the project root):

   ```bash
   cd ios/App && pod install && cd ../..
   ```

   If `pod install` fails, open Xcode and ensure the active developer directory is Xcode:  
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

2. **Sync web assets** after any change to `public/`:

   ```bash
   npm run cap:sync
   ```

3. **Open in Xcode and run**:

   ```bash
   npm run ios
   ```

   Choose the iPhone or iPad simulator, or a connected device. The app will open; on first launch it will ask for a **Backend URL** (your Shorten server). Use:

   - A public URL if you host the server (e.g. `https://shorten.yourdomain.com`), or  
   - Your Mac’s local URL when testing (e.g. `http://192.168.1.x:3333` — find your Mac’s IP in System Settings → Network). Your phone and Mac must be on the same network.

### Run as a Mac app (Mac Catalyst)

1. In Xcode, select the **App** project in the left sidebar.
2. Select the **App** target.
3. Open **General** → **Frameworks, Libraries, and Embedded Content** (or **Deployment Info**).
4. Under **Supported Destinations**, check **Mac (Designed for iPad)** (or **Mac** if your Xcode shows a Mac Catalyst option).
5. Build and run; choose **My Mac** as the destination.

The app then runs as a native Mac window. Set the Backend URL to `http://localhost:3333` if the server is running on the same Mac.

---

## Later: public use

The DB schema and API are ready to extend with:

- User/auth (e.g. `owner_id` on `links`)
- Rate limiting and abuse protection
- Optional click analytics (e.g. `clicks` column + logging)
- Moving from SQLite to PostgreSQL for multi-instance deployment
