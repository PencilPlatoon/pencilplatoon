# Pencil Platoon

A 2D stick figure battle game built with React, TypeScript, and Express.

## Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)

## Getting Started

### 1. Install dependencies

```
npm install
```

### 2. Run the development server

This will start both the backend (Express) and the frontend (Vite) with hot reloading:

```
npm run dev
```

- The app will be available at [http://localhost:8888](http://localhost:8888)

### 3. Build for production or static serving

To build the frontend for production (static assets):

```
npm run build
```
- This will generate a `dist/` directory in the root containing all static assets.

### 4. Deploy to the production site

To build and deploy to the production site:

```
npm run release
```

To only deploy:

```
npm run deploy
```

Note: ~/.netrc needs the current hostname that ftp.alkaline.org resolves to, which can change occasionally. To get the current hostname:

echo | openssl s_client -connect ftp.alkaline.org:21 -starttls ftp 2>/dev/null | openssl x509 -noout -text | grep DNS:

Then update ~/.netrc and deploy-ftp.sh to match.
