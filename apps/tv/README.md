# iHub TV — Android TV client

Native Android TV app (Kotlin + Jetpack Compose for TV). Separate toolchain from the
rest of this monorepo — Gradle, not pnpm — but lives here so the whole project stays
in one repo and one roadmap. See the plan this was built from for the full context:
tech stack rationale, API surface, and milestone scope.

**Verified**: `./gradlew assembleDebug` builds a real debug APK on this machine
(JDK 17 via `brew install openjdk@17`, Android SDK platforms 34–36 + build-tools
already present). The Gradle wrapper is real (not just scripts) and pinned to 8.7.

## Opening the project

Open `apps/tv/` as a project root in Android Studio (not the repo root — Studio expects
`settings.gradle.kts` at the project root it's pointed at). `local.properties` already
points `sdk.dir` at the local SDK. First sync will need network access for anything not
already cached.

If your system `java` isn't 17+ (check `java -version`), point Gradle at one explicitly:
`export JAVA_HOME="$(brew --prefix openjdk@17)"` before running `./gradlew` from a
terminal — Android Studio manages its own JDK regardless and doesn't need this.

## Requirements

- JDK 17 to build (Android Studio bundles its own; from a bare terminal, `brew install
  openjdk@17` works — the system default `java` doesn't matter either way, only
  `JAVA_HOME` when invoking `./gradlew` directly).
- `compileSdk`/`targetSdk` = 35, AGP 8.6.1 — bumped from an initial 34/8.5.2 pin after a
  real build showed a transitive androidx.lifecycle dependency required 35+.
- `androidx.security:security-crypto:1.1.0-alpha06` specifically — the `MasterKey` API
  `TokenStore.kt` uses only exists in the 1.1.0-alpha line; the 1.0.0 "stable" release
  only has the older, differently-shaped `MasterKeys` API. Don't downgrade this without
  rewriting `TokenStore.kt`'s Keystore setup to match.
- Gradle caches run ~6GB after a first successful build (`~/.gradle`) — worth knowing
  before assuming a lightweight footprint.

## Config

`app/src/main/kotlin/com/ott/tv/data/api/NetworkConfig.kt` points at
`http://10.0.2.2:4000/api/` — the Android emulator's alias for the host machine's
localhost, i.e. this repo's own API dev server. This needs to become a real,
build-variant-driven URL before targeting anything beyond local development.

## What's built (Milestone 1 — scaffold + auth)

Device-pairing QR sign-in (reuses the backend flow built for the web app's
`/login/qr`) and the profile picker. No password/Google UI on the TV itself — sign-in
happens on a phone or computer, matching the Netflix/YouTube TV pattern.

Not built yet: Home rails, title detail, playback, Live TV — see the plan's milestone
list. Not run on an actual device/emulator yet — build success only, no on-screen
verification so far.
