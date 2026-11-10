# Forma Flutter app

The Flutter client works with any Forma server. Standard Android builds do not contain a server URL. On first launch, they ask for the instance URL, check that its API is reachable, and save it in app-private preferences on that device. Use an HTTPS URL for remote servers. HTTP is accepted only for local development hosts.

## Run locally

From this directory:

```powershell
flutter pub get
flutter run -d chrome --dart-define=FORMA_API_BASE_URL=http://localhost:3001
```

Start the backend from the repository root with `npm run dev --workspace=packages/backend`. For an Android emulator, use `flutter run --dart-define=FORMA_API_BASE_URL=http://10.0.2.2:3001`. For a physical device, either enter a reachable HTTPS server URL on first launch or pass the computer's LAN URL with `--dart-define` (the device must be able to reach that address). The Android debug manifest permits local HTTP for development; remote release servers should use HTTPS.

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

The Android workflow builds a host-configurable APK without `FORMA_API_BASE_URL`, uploads it as a workflow artifact, and attaches that universal APK to releases. To also create a private-use APK in Actions, add a repository Actions secret named `FORMA_PERSONAL_API_BASE_URL`; the workflow will build a second, separately named artifact with that URL. The private APK is not attached to public releases. Keep the secret limited to your own deployment and do not expose it in logs or documentation.

The workflow also builds the Flutter Web app into the Docker image and publishes the image to GitHub Container Registry. For Android SDK setup, install Android SDK Command-line Tools and NDK (Side by side) in Android Studio's SDK Manager, then run `flutter doctor --android-licenses` and accept the displayed terms. Current release APK signing uses Flutter's debug key for direct testing and sideloading; Play Store distribution needs a private release keystore.
