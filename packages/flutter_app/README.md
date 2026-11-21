# Forma Flutter app

The Flutter client works with any Forma server. Standard Android builds do not contain a server URL. On first launch, they ask for the instance URL, check that its API is reachable, and save it in app-private preferences on that device. Use an HTTPS URL for remote servers. HTTP is accepted only for local development hosts.

## Run locally

From this directory:

```powershell
flutter pub get
flutter run -d chrome --dart-define=FORMA_API_BASE_URL=http://localhost:3001
```

Start the Rust backend from the repository root in a second terminal:

```powershell
$env:DATABASE_PATH = (Join-Path $PWD 'packages/backend-rust/data/rust-dev.db')
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml -- --init-db
cargo run --locked --manifest-path packages/backend-rust/Cargo.toml
```

For an Android emulator, use `flutter run --dart-define=FORMA_API_BASE_URL=http://10.0.2.2:3001`. For a physical device, either enter a reachable HTTPS server URL on first launch or pass the computer's LAN URL with `--dart-define` (the device must be able to reach that address). The Android debug manifest permits local HTTP for development; remote release servers should use HTTPS.

## Build APKs

### Host-configurable APK

This is the distributable build for people who host their own Forma instance:

```powershell
flutter build apk --release
```

The app prompts for the server URL at first launch and remembers it on the device. Clearing app storage resets the saved server selection. Reinstalling the app without clearing data keeps the selection.

### Personal APK with a default server

To create an APK for your own use with a default server URL baked into that build:

```powershell
flutter build apk --release --dart-define=FORMA_API_BASE_URL=https://your-host.example
```

That build skips the server prompt and uses the supplied URL. Do not use this option for the public APK; anyone inspecting the binary can recover a compiled-in URL. `FORMA_API_BASE_URL` is a build-time convenience, not a credential.

### Other builds

```powershell
flutter build web --release
flutter build appbundle --release
```

The Web app uses the current origin by default, so a self-hosted Docker deployment does not need a client URL build argument. Android native sessions use a persistent app-private cookie jar; Web uses browser cookies.

## GitHub Actions artifacts and releases

The Android workflow runs only for version tags. A tag such as `v1.2.3` creates a GitHub Release with `Forma-Android-v1.2.3.apk`. Obtainium users should track the repository's stable versioned releases and select assets named `Forma-Android-v*.apk`. For instructions and the required signing-key setup, see the [root README](../../README.md#configure-versioned-apk-releases).

Version-tag releases require a persistent Android keystore configured as the `FORMA_ANDROID_KEYSTORE_BASE64`, `FORMA_ANDROID_STORE_PASSWORD`, `FORMA_ANDROID_KEY_ALIAS`, and `FORMA_ANDROID_KEY_PASSWORD` Actions secrets. Back up the keystore: losing it prevents publishing compatible updates. The first release signed with this key may require uninstalling an older APK if it used a different signing certificate.

The same version tag also publishes the multi-architecture Rust server image to GitHub Container Registry. The APK and Docker image jobs run in parallel. Local Android APK builds use Flutter's debug key for direct testing and sideloading; Play Store distribution needs a separate private Play signing setup.
