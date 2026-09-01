# lifeos.app — Static Marketing Site

Minimal landing page for the LifeOS mobile app.

## Stack
- Pure HTML + inline CSS (no build step)
- Firebase Hosting

## Deploy

```bash
# 1. Install Firebase CLI (one time)
npm install -g firebase-tools
firebase login

# 2. From this directory
cd "/Users/mustafakaankocak/Documents/YULAlab-AI/Projects/Web Sites/lifeos.app"

# 3. Initialize once (creates .firebaserc) — choose existing project that owns lifeos.app
firebase init hosting
# - Use existing project: <pick your firebase project>
# - Public dir: . (current)
# - SPA: No
# - GitHub deploys: No (optional)
# - Don't overwrite index.html / 404.html

# 4. Deploy
firebase deploy --only hosting
```

## What's on this page

Detailed product info / privacy / support all live on yulalab.com:

- Detail: https://yulalab.com/projects/lifeos
- Privacy policy: https://yulalab.com/privacy/lifeos
- Support: https://lifeos.app/destek

Once App Store / Play Store apps are live, replace the "Yakında" store
buttons in index.html with the real store URLs.

## Security headers

Firebase config (`firebase.json`) sets strict-grade security headers:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- HSTS: 63072000 (2 years), includeSubDomains, preload
- CSP: tight default-src 'self', no inline scripts

## Apple / Google submit URLs

When filling out the App Store Connect / Play Console listing, use:
- Marketing URL: https://lifeos.app/
- Privacy Policy URL: https://yulalab.com/privacy/lifeos
- Support URL: https://lifeos.app/destek
