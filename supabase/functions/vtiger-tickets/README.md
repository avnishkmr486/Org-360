# vtiger-tickets

Read-only proxy that feeds the **Support Tickets** dashboard. Keeps the VTiger access key out of the browser.

```
supabase secrets set VTIGER_URL=https://<your-vtiger-portal> VTIGER_USERNAME=<user> VTIGER_ACCESS_KEY=<access key>
supabase functions deploy vtiger-tickets --no-verify-jwt
```

The access key is the one under VTiger > My Preferences > Access Key (not the password).
Note: `--no-verify-jwt` makes the endpoint callable by anyone who knows the URL (it returns ticket data only).
