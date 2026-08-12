# AGENTS.md

## Cel projektu

To repozytorium zawiera docelową aplikację na iPhone rozwijaną na Windows 11 pod nazwą `motivAItion`.
Aplikacja powstaje w React Native + Expo + TypeScript. Lokalny development odbywa
się przez Metro/Expo Go na fizycznym iPhonie, a prawdziwy build iOS wykonuje GitHub
Actions na runnerze macOS z Xcode.

Nie zakładaj dostępu do lokalnego Maca. Nie używaj EAS Build, App Store Connect,
TestFlight ani płatnego Apple Developer Program, dopóki użytkownik wyraźnie nie
zmieni tej decyzji. Wynikiem pipeline'u ma być niepodpisany plik `.ipa`, możliwy do
lokalnego podpisania i instalacji przez Sideloadly na Windows.

## Specyfikacja

Specyfikację aplikacji znajdziesz w `docs/PRODUCT_SPEC.md`

## Sprawdzony baseline narzędzi

Poniższy zestaw został zweryfikowany end-to-end: aplikacja działała na fizycznym
iPhonie przez Expo Go, GitHub Actions zbudował IPA, a Sideloadly podpisało i
zainstalowało je na urządzeniu.

- Node.js: 20 LTS w CI.
- Expo: `~54.0.0` (zweryfikowana instalacja: `54.0.36`).
- React Native: `0.81.5`.
- React: `19.1.0`.
- TypeScript: `~5.9.2` (zweryfikowana instalacja: `5.9.3`).
- `@types/react`: `~19.1.10`.
- `expo-status-bar`: `~3.0.9`.
- `@react-native-async-storage/async-storage`: `2.2.0`, jeśli projekt potrzebuje
  prostego persistence.
- GitHub Actions runner: `macos-26`.
- Zweryfikowany obraz runnera: macOS 26.5.2 arm64, Xcode 26.6 (`17F113`),
  iPhoneOS SDK 26.5, CocoaPods 1.17.0.

Nie podnoś samodzielnie głównej wersji Expo/React Native. Publiczne Expo Go na
fizycznym iPhonie obsługuje tylko wybrane SDK. Expo SDK 57 wygenerowane przez
najnowszy szablon nie działało z wersją Expo Go dostępną w App Store, podczas gdy
SDK 54 działało. Upgrade SDK jest osobnym zadaniem i wymaga sprawdzenia bieżącej
kompatybilności Expo Go, migracji wszystkich zależności oraz prawdziwego builda IPA.

Zależności natywne instaluj przez:

```powershell
npx expo install <pakiet>
```

Po zmianie wersji Expo uruchom `npx expo install --fix`. Nigdy nie naprawiaj ostrzeżeń
`npm audit` przez `npm audit fix --force` bez analizy — może to rozbić zgodny zestaw
wersji Expo/React Native.

## Konfiguracja Expo

Projekt jest przeznaczony tylko dla iOS. W `app.json` lub `app.config.ts` zachowaj:

```json
{
  "expo": {
    "platforms": ["ios"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.example.app",
      "buildNumber": "1"
    }
  }
}
```

Ustaw unikalny, stabilny `bundleIdentifier` przed pierwszą instalacją. Przy kolejnych
instalacjach używaj tego samego bundle ID i tego samego Apple ID w Sideloadly, aby
aktualizować aplikację bez utraty jej lokalnych danych. Zwiększaj `buildNumber` dla
kolejnych wydań instalacyjnych.

Projekt stosuje Expo Continuous Native Generation. Katalogi `/ios` i `/android` są
generowane i muszą pozostać w `.gitignore`. Zmiany natywne deklaruj przez konfigurację
Expo lub config plugins; nie edytuj ręcznie wygenerowanego katalogu `ios`.

## Praca lokalna na Windows

Podstawowa konfiguracja `package.json` powinna zawierać:

```json
{
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit",
    "check:expo": "expo config --type public"
  }
}
```

Po checkout:

```powershell
npm ci
npm run typecheck
npm run check:expo
npx expo install --check
npx expo-doctor
```

Uruchomienie na fizycznym iPhonie:

```powershell
npx expo start --clear
```

Zeskanuj QR w Expo Go. Komputer i iPhone powinny być w tej samej sieci. Jeśli LAN
jest blokowany, użyj `npx expo start --tunnel`. Konflikt portu 8081 oznacza zwykle,
że inna instancja Metro już działa; zatrzymaj ją przez `Ctrl+C` albo użyj
`--port 8082`.

`npm ci`, typecheck i `check:expo` niczego nie uruchamiają — są kontrolami. Windows
nie może lokalnie wykonać `xcodebuild`; pełna weryfikacja natywna należy do CI.

## Wymagany workflow iOS

Workflow `.github/workflows/ios-build.yml` ma działać dla `workflow_dispatch`, pull
requestów oraz pushy do `main`. Używaj:

- `actions/checkout@v6`;
- `actions/setup-node@v6` z Node 20 i cache npm;
- `actions/upload-artifact@v4`;
- `runs-on: macos-26`;
- `timeout-minutes: 45` lub więcej.

Minimalna kolejność kroków:

1. `npm ci`.
2. `npm run typecheck`.
3. `npx expo prebuild --platform ios --clean --no-install`.
4. `pod install --project-directory=ios`.
5. Wykrycie wygenerowanego `*.xcworkspace` i scheme — nie wpisuj ich na sztywno,
   ponieważ wynikają z nazwy aplikacji.
6. Build `Release` dla urządzenia przez `xcodebuild`.
7. Sprawdzenie, czy powstał bundle `Release-iphoneos/*.app`.
8. Utworzenie `Payload/<AppName>.app` i spakowanie katalogu `Payload` jako `.ipa`.
9. Upload IPA jako artefaktu; `if-no-files-found: error`.

Build dla fizycznego urządzenia ma używać:

```bash
xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath ios/build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY='' \
  DEVELOPMENT_TEAM='' \
  build
```

To celowo tworzy niepodpisany build urządzeniowy. Nie dodawaj certyfikatów Apple,
provisioning profiles ani sekretów Apple ID do GitHub Actions. Nie używaj targetu
symulatora — jego binarium nie nadaje się do instalacji na fizycznym iPhonie.

Nazwy artefaktu i IPA mogą odpowiadać aplikacji, ale README musi wskazywać je
dokładnie. Artefakt GitHub jest archiwum ZIP; po rozpakowaniu użytkownik powinien
otrzymać pojedynczy plik `.ipa`.

## Instalacja przez Sideloadly

Na Windows 64-bit używaj `SideloadlySetup64.exe`, nie wariantu 32-bit. Wymagane są
klasyczne/webowe, 64-bitowe wersje iTunes i iCloud, a nie wydania Microsoft Store.
iPhone musi być podłączony, odblokowany i oznaczony jako zaufany w iTunes.

Po instalacji IPA:

1. Włącz na iPhonie Tryb deweloperski.
2. Wejdź w `Ustawienia > Ogólne > VPN i urządzenia zarządzane`.
3. Wybierz profil Apple ID użyty w Sideloadly i zaufaj mu. W nowszym iOS może to
   wymagać opcji `Zezwól i uruchom ponownie`.

Bezpłatny podpis Apple ID jest ważny 7 dni. Reinstalacja z tym samym Apple ID i
bundle ID aktualizuje aplikację; usunięcie aplikacji może skasować dane lokalne.

## Zasady implementacji

- Buduj najprostszy pionowy slice rozwiązujący bieżące wymaganie.
- Nie dodawaj backendu, EAS, logowania, analityki, nawigacji ani nowych bibliotek,
  jeśli funkcja ich rzeczywiście nie wymaga.
- Zachowuj TypeScript `strict` i produkcyjną obsługę błędów operacji asynchronicznych.
- Dla persistence nie nadpisuj poprawnych danych wartością domyślną po błędzie
  odczytu. Zapis odblokuj po udanej hydratacji albo świadomej zmianie użytkownika.
- Utrzymuj interfejs dostępny: role elementów, czytelne etykiety i właściwe stany
  disabled/loading.
- Komentuj tylko decyzje i nieoczywiste ograniczenia platformowe.
- Nie commituj wygenerowanych katalogów `ios`, `android`, `dist`, `node_modules`,
  pobranych artefaktów ani danych podpisujących.

## Git i Definition of Done

Pracuj na branchach feature/fix. Nie pushuj, nie twórz PR i nie scalaj do `main` bez
wyraźnej zgody użytkownika. Nie używaj force-pusha. Zachowuj istniejące zmiany
użytkownika i nie dodawaj obcych plików do commita.

Przed zakończeniem zmiany uruchom odpowiednio:

```powershell
npm run typecheck
npm run check:expo
npx expo install --check
npx expo-doctor
npx expo export --platform ios --output-dir dist
```

Sprawdź także `git diff --check` i składnię workflow. Zmiana zależności natywnej,
konfiguracji Expo, workflow lub wersji toolchainu nie jest ukończona, dopóki realny
job na GitHub Actions nie zbuduje i nie opublikuje IPA. W raporcie końcowym podaj:

- wyniki wszystkich gate'ów;
- link/status prawdziwego workflow;
- nazwę pobieranego artefaktu i pliku IPA;
- potwierdzenie instalacji na fizycznym iPhonie, jeśli została wykonana;
- wszystkie elementy, których nie udało się zweryfikować.