# Tía Norma

Scaffold Next.js (App Router + TypeScript + Tailwind) para el catálogo de cerámica de Tía Norma.

Repo: [github.com/fedemiguez/tia-norma](https://github.com/fedemiguez/tia-norma)

## Correr en local

Requisitos: Node.js 20+ y npm.

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

Otros scripts:

```bash
npm run build   # build de producción
npm run start   # servir el build
npm run lint    # ESLint
```

## Deploy en Vercel

1. Entrá a [vercel.com/new](https://vercel.com/new).
2. **Import Git Repository** → elegí `fedemiguez/tia-norma` (autorizá GitHub si hace falta).
3. Framework Preset: **Next.js** (autodetectado). Root Directory: `.`
4. Dejá Build Command `next build` / Output vacío (default).
5. **Deploy**.

Después de la primera importación, cada push a `main` redeploya automático.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
