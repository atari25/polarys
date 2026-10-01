#!/bin/bash
set -euo pipefail

# Xcode Cloud runs this beside Polarys.xcworkspace after cloning.
IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$IOS_DIR/.." && pwd)"
if [ -z "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}" ]; then
  echo 'Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. Add it as a secret workflow environment variable.' >&2
  exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
cd "$REPO_DIR"
npm ci --no-audit --no-fund

# Persist Node's path for Xcode's later React Native bundle phase.
printf 'export NODE_BINARY="%s"\n' "$(command -v node)" > "$IOS_DIR/.xcode.env.local"
# Expo reads this ignored file when generating the Release JavaScript bundle.
# Do not echo its contents: EXPO_PUBLIC values ship inside the app.
node <<'NODE'
const fs = require('fs');
fs.writeFileSync('.env.local', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=' + JSON.stringify(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) + '\n', { mode: 0o600 });
NODE

cd "$IOS_DIR"
pod install --deployment
