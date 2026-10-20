# Production Deployment & Android Release Guide (`docs/DEPLOYMENT.md`)

## 1. Ubuntu VPS & Nginx Deployment

1. **Provision Node.js 22 LTS & PM2**:
   ```bash
   npm ci
   npm run build
   NODE_ENV=production PORT=3000 pm2 start "npx tsx server.ts" --name attendly-api
   pm2 save
   ```
2. **Configure Nginx Reverse Proxy + Let's Encrypt TLS**:
   - Proxy `https://api.attendly.app` to `http://127.0.0.1:3000`.
   - Verify `/health` returns `200 OK`.
3. **MongoDB Atlas Security**:
   - Restrict IP Access List to the Ubuntu VPS static IP.
   - Use a least-privilege database user with `readWrite` on `attendly`.

## 2. Android Development & Release Builds (EAS)

1. **Development Build (for Physical Device Background Location Testing)**:
   ```bash
   cd mobile
   eas build --profile development --platform android
   ```
   > Do not rely on Expo Go for background geofencing (`ACCESS_BACKGROUND_LOCATION` and Foreground Services require a custom development build).

2. **Production Android App Bundle (`.aab`)**:
   ```bash
   cd mobile
   eas build --profile production --platform android
   ```
3. **Google Play Console Declarations**:
   - Complete the **Background Location Permission Declaration** demonstrating that automatic campus attendance verification is the core user-facing feature.
   - Link the Privacy Policy URL and complete the Data Safety section disclosing location collection and user deletion controls.
