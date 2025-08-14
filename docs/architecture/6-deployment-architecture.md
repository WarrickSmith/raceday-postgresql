# 6. Deployment Architecture

## 6.1. Function Specifications

```json
{
  "functions": [
    {
      "$id": "daily-meetings",
      "specification": "s-1vcpu-512mb",
      "schedule": "0 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-races", 
      "specification": "s-1vcpu-512mb",
      "schedule": "10 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-entrants",
      "specification": "s-1vcpu-1gb",
      "schedule": "20 17 * * *", 
      "timeout": 300
    },
    {
      "$id": "race-data-poller",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300
    },
    {
      "$id": "alert-evaluator",
      "specification": "s-1vcpu-512mb",
      "events": ["databases.*.collections.entrants.documents.*.update"],
      "timeout": 60
    }
  ]
}
```

## 6.2. Deployment Pipeline

- **Frontend:** Vercel deployment with automatic builds on main branch
- **Backend:** Individual function deployment via Appwrite CLI
- **Database:** Idempotent schema setup via client/scripts/appwrite-setup.ts
- **Monitoring:** Built-in Appwrite Console + structured logging

---
