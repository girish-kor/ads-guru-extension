# Ads Guru — Advanced Ads Blocker

 Manifest V3 extension for fully automated ads blocking.

---

## Architecture

```
ads-guru-extension/
├── manifest.json              MV3 manifest
├── background/
│   ├── service-worker.js      MV3 service worker (lifecycle, rule hydration)
│   └── rule-engine.js         Compiles parsed rules → declarativeNetRequest
├── content/
│   ├── content-script.js      Script blocking, anti-anti-adblock, cosmetic inject
│   └── dom-filter.js          MutationObserver-based DOM ads element removal
├── core/
│   ├── filter-engine.js       DSA-orchestrated URL evaluation pipeline
│   └── request-interceptor.js Dynamic rule manager + allowlist
├── filters/
│   ├── filter-loader.js       Downloads & caches EasyList, EasyPrivacy, uBlock, AdGuard
│   ├── filter-parser.js       ABP/uBO syntax parser → ParsedRule[]
│   └── static-rules.json      Bootstrap DNR rules (no network required)
├── dsa/
│   ├── trie.js                O(m) domain/prefix matching
│   ├── aho-corasick.js        O(n+k) multi-pattern substring matching
│   ├── bloom-filter.js        O(k) probabilistic pre-filter
│   ├── lru-cache.js           O(1) verdict memoisation
│   └── hash-map.js            O(1) amortised rule index
├── util/
│   ├── logger.js              Structured levelled logger
│   └── storage.js             chrome.storage.local async wrapper
└── tests/
    ├── test-runner.js          Minimal test harness + benchmark utility
    ├── dsa.test.js             Unit + perf tests for all DSA structures
    ├── filter-parser.test.js   Filter list parsing correctness
    ├── rule-validation.test.js DNR compliance validation
    ├── performance.test.js     End-to-end pipeline benchmarks
    ├── browsing-simulation.test.js  Real-world URL classification accuracy
    └── run-all.js              Test suite entry point
```

---

## Filter Sources

| List | URL | Coverage |
|---|---|---|
| EasyList | https://easylist.to/easylist/easylist.txt | Ads |
| EasyPrivacy | https://easylist.to/easylist/easyprivacy.txt | Tracking |
| uBlock Filters | uBlockOrigin/uAssets filters.txt | Extended |
| uBlock Privacy | uBlockOrigin/uAssets privacy.txt | Privacy |
| uBlock Unbreak | uBlockOrigin/uAssets unbreak.txt | Anti-breakage |
| AdGuard Base | filters.adtidy.org filters/2.txt | Ads |
| AdGuard Tracking | filters.adtidy.org filters/3.txt | Tracking |
| Peter Lowe | pgl.yoyo.org serverlist | Combined |

All lists are fetched at install and refreshed every 24 hours via `chrome.alarms`.

---

## DSA Evaluation Pipeline

Every request URL passes through a layered decision pipeline:

```
URL
 │
 ▼
[1] BloomFilter.mayContain(url)   — O(k)  probabilistic pre-check
     │ false → ALLOW (definitive miss)
     │ true  → continue
     ▼
[2] Trie.longestPrefixMatch(host) — O(m)  domain-anchor matching
     │ match → return rule verdict
     │ miss  → continue
     ▼
[3] AhoCorasick.search(url)       — O(n)  multi-pattern matching
     │ match → BLOCK
     │ miss  → continue
     ▼
[4] HashMap.get(ruleId)           — O(1)  rule retrieval
     │
     ▼
[5] LRUCache.set(url, verdict)    — O(1)  memoize for next request
```

---

## MV3 Compliance

- **declarativeNetRequest**: Static rules in `filters/static-rules.json`;
  dynamic rules hydrated from filter lists via `updateDynamicRules()`.
- **Service Worker**: Replaces persistent background pages. Manages alarms,
  lifecycle, and rule compilation.
- **No remote code execution**: All logic is bundled; no `eval()`, no
  `innerHTML` script injection.
- **scripting API**: Cosmetic filter injection via `chrome.scripting.executeScript`.

---

## Installation

### Development (Chrome)
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `ads-guru-extension/` folder
4. The extension installs and immediately begins fetching filter lists.

### Testing
```bash
cd ads-guru-extension
npm test                     # Full suite
npm run test:perf            # Performance benchmarks only
npm run test:sim             # Browsing simulation
```

## Chrome Web Store Deployment

This repository includes a GitHub Actions workflow at [`.github/workflows/publish-chrome-web-store.yml`](.github/workflows/publish-chrome-web-store.yml) that packages the extension and publishes it to the Chrome Web Store.

Set these GitHub repository secrets before running it:

`CHROME_WEB_STORE_EXTENSION_ID`
`CHROME_WEB_STORE_CLIENT_ID`
`CHROME_WEB_STORE_CLIENT_SECRET`
`CHROME_WEB_STORE_REFRESH_TOKEN`

How to get them:

`CHROME_WEB_STORE_EXTENSION_ID`: Open the Chrome Web Store Developer Dashboard, create or open your item, and copy the extension ID from the item URL or dashboard details.

`CHROME_WEB_STORE_CLIENT_ID` and `CHROME_WEB_STORE_CLIENT_SECRET`: Create an OAuth 2.0 client in Google Cloud Console for a Web application. Enable the Chrome Web Store API for that Google Cloud project, then copy the client ID and client secret from the OAuth client details.

`CHROME_WEB_STORE_REFRESH_TOKEN`: Use the same Google account that owns the Web Store item to complete an OAuth consent flow with the `chromewebstore` scope, then exchange the authorization code for a refresh token. A common shortcut is Google OAuth Playground or any OAuth code flow tool that can request offline access.

Add them in GitHub:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Click `New repository secret`.
4. Add each secret name and value exactly as above.
5. Save all four secrets, then run the workflow again.

To deploy, either push a tag that starts with `v` such as `v1.0.1`, or run the workflow manually from the GitHub Actions tab. The workflow zips the runtime extension files and runs `chrome-webstore-upload` with the configured OAuth credentials.

If you want trusted-tester publishing instead of public publishing, change the upload step to use the CLI's `publish` command and pass the `--trusted-testers` flag.

---

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `logLevel` | string | `INFO` | Log verbosity: DEBUG/INFO/WARN/ERROR |
| `allowlist` | string[] | `[]` | Domains to never block |
| `lastRuleUpdate` | number | — | Unix ms timestamp of last rule refresh |
| `ruleCount` | number | — | Active dynamic DNR rule count |

---

## Performance Targets

| Operation | Target | Typical |
|---|---|---|
| Parse 10K rules | < 1 s | ~100 ms |
| Build Bloom (100K items) | < 200 ms | ~30 ms |
| BloomFilter lookup | > 1M ops/sec | ~5M ops/sec |
| Trie lookup | > 500K ops/sec | ~2M ops/sec |
| HashMap get | > 2M ops/sec | ~8M ops/sec |
| LRU get+set | > 500K ops/sec | ~3M ops/sec |
| AhoCorasick (5K patterns) | < 3s / 10K URLs | ~1s |

---

## Limitations & Known Issues

1. **MV3 rule cap**: Chrome limits dynamic rules to 30,000. Large filter lists
   are truncated. Static `static-rules.json` covers critical domains.
2. **Service worker sleep**: MV3 service workers can be terminated by Chrome.
   Alarms and `chrome.storage` persist state across wakeups.
3. **Filter list CORS**: Some hosts may block direct fetch from extensions.
   Fallback: static rules + cached data from previous session.
4. **No HTTPS inspection**: DNR cannot decrypt TLS. Only URL metadata is used.
5. **CSP bypass**: Sites with strict CSPs may prevent cosmetic style injection.

---

## Scaffold Origin

Generated by `ads-guru-extension.sh` — a POSIX-compliant idempotent scaffold script.
Re-run with `--force` to overwrite all files.
