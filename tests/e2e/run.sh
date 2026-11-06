#!/usr/bin/env bash
# End-to-end test: builds the site, starts `wrangler dev` with a fake ElevenLabs
# API and a fresh local database, then drives it with Playwright.
#   npm i -D playwright && npx playwright install chromium   (once)
#   bash tests/e2e/run.sh path/to/some-image.png
set -euo pipefail
cd "$(dirname "$0")/../.."
IMG="${1:?pass a PNG image to use as the fake generated picture}"
OUT="${OUT:-/tmp/snapshift-e2e}"; mkdir -p "$OUT" "$OUT/img"; cp "$IMG" "$OUT/img/test.png"
npx tsc shared/engine.ts shared/rules.ts --outDir tests/e2e/.engine --module ES2022 --target ES2022 --moduleResolution bundler --skipLibCheck
sed -i.bak "s#from './rules'#from './rules.js'#" tests/e2e/.engine/engine.js && echo '{"type":"module"}' > tests/e2e/.engine/package.json
npx vite build >/dev/null
printf 'DEV_MODE=1\nELEVENLABS_API_KEY=test-key\nELEVENLABS_BASE_URL=http://127.0.0.1:8790\nSTRIPE_SECRET_KEY=sk_test_mock\nSTRIPE_WEBHOOK_SECRET=whsec_test\nSTRIPE_BASE_URL=http://127.0.0.1:8791\n' > .dev.vars
rm -rf .wrangler/state && npx wrangler d1 migrations apply snapshift --local >/dev/null
node tests/e2e/mock-elevenlabs.mjs "$OUT/img" & MOCK=$!
node tests/e2e/mock-stripe.mjs http://127.0.0.1:8787 whsec_test & STRIPE=$!
npx wrangler dev --port 8787 --ip 127.0.0.1 >"$OUT/wrangler.log" 2>&1 & WR=$!
trap 'kill $MOCK $STRIPE $WR 2>/dev/null; rm -f .dev.vars' EXIT
sleep 8
node tests/e2e/e2e.mjs "$OUT" "$OUT/img/test.png"
