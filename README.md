# Meddeb (web)

Meddeb, a local and private Qur'an recitation coach. Website: https://karim-53.github.io/Meddeb/

- `index.html`, `privacy.html`, `impressum.html`, `site.css`, `favicon.svg` - the GitHub Pages site (served from `main`, root).
- `download.html` - the Android download page; `update.json` - what the Android app checks for its updates (written
  only by `android/tools/publish_release.ps1` from the built APK; the APK itself is a GitHub Release asset of this
  repository, tag `android-vX.Y`, file `meddeb_vX.Y.apk`).
- `models/` - the phone models re-hosted for the Meddeb apps (parts + manifest; see each folder's README and LICENSE).
- `LICENSE.md` - the licences of this repository; `THIRD_PARTY_NOTICES.md` and `licenses/` - the third-party notices and licence texts of the Meddeb apps (copies of the app's files).
- Bugs and ideas: [open an issue](https://github.com/Karim-53/Meddeb/issues/new/choose).
