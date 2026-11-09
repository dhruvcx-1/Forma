# Forma Flutter app

This is the shared Flutter client for Android and Web. It connects to the existing Forma Fastify API and uses the same accounts and stored data.

## Run locally

From this directory:

```powershell
flutter pub get
flutter run -d chrome --dart-define=FORMA_API_BASE_URL=http://localhost:3001
```

Start the backend first from the repository root with `npm run dev --workspace=packages/backend`. For an Android emulator, run `flutter run --dart-define=FORMA_API_BASE_URL=http://10.0.2.2:3001`. The Android debug manifest permits local HTTP for this development URL; release builds should use an HTTPS API URL.

## Build

```powershell
flutter test
flutter build web --release
flutter build apk --release
flutter build appbundle --release
```

For Android builds, install Android SDK Command-line Tools and NDK (Side by side) in Android Studio's SDK Manager, then run `flutter doctor --android-licenses` and accept the displayed Android SDK terms yourself. Native sessions store their cookie jar in app-private storage. Web sessions use browser cookies. The Docker image builds and serves the Web output on the same origin as the API. Override `FORMA_API_BASE_URL` at build time only when the API is hosted at a different origin.
