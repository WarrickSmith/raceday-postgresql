# 8. Deployment Architecture

## 8.1. Function Specifications

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
      "$id": "enhanced-race-poller",
      "specification": "s-2vcpu-2gb",
      "events": ["http"],
      "timeout": 300
    },
    {
      "$id": "master-race-scheduler",
      "specification": "s-1vcpu-512mb",
      "schedule": "*/1 * * * *",
      "timeout": 180
    },
    {
      "$id": "race-data-poller",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300
    },
    {
      "$id": "single-race-poller",
      "specification": "s-1vcpu-1gb",
      "events": ["http"],
      "timeout": 300
    },
    {
      "$id": "batch-race-poller",
      "specification": "s-1vcpu-2gb",
      "events": ["schedule"],
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

## 8.2. Deployment Pipeline

- **Frontend:** Vercel deployment with automatic builds on main branch
- **Backend:** Individual function deployment via Appwrite CLI
- **Database:** Idempotent schema setup via client/scripts/appwrite-setup.ts
- **Monitoring:** Built-in Appwrite Console + structured logging

---
