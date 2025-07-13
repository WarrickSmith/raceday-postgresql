# 7. Source Tree

The project will follow a standard Next.js `src` directory structure.

```
/
|-- .env.local
|-- .gitignore
|-- next.config.js
|-- package.json
|-- README.md
|-- tsconfig.json
|-- public/
|   |-- favicons/
|-- src/
|   |-- app/
|   |   |-- (api)/               # API routes and server actions
|   |   |-- (auth)/              # Auth pages (login, signup)
|   |   |-- (main)/              # Core application layout and pages
|   |   |   |-- layout.tsx
|   |   |   |-- page.tsx         # Main dashboard
|   |   |   |-- race/[id]/       # Detailed race view
|   |-- components/
|   |   |-- common/              # Reusable UI components (buttons, modals)
|   |   |-- layout/              # Layout components (header, sidebar)
|   |   |-- dashboard/           # Dashboard-specific components
|   |   |-- race-view/           # Race view-specific components
|   |-- lib/
|   |   |-- appwrite.ts          # Appwrite client configuration
|   |   |-- utils.ts             # Utility functions
|   |-- hooks/                   # Custom React hooks
|   |-- services/                # Backend service interactions
|   |-- styles/
|   |   |-- globals.css
|-- scripts/
    |-- appwrite-setup.ts      # Appwrite project setup script
```

---
