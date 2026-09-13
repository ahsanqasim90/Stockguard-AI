# MongoDB Atlas setup for StockGuard AI

1. Open the Atlas project that contains `Cluster0`.
2. In **Database Access**, create a password user named `stockguard_app` and grant
   **Read and write to any database**. Save the generated password securely.
3. In **Network Access**, select **Add Current IP Address** for local development.
   Vercel uses changing outbound addresses, so the production deployment will
   later require `0.0.0.0/0`; database credentials and application authorization
   remain mandatory.
4. Return to **Database**, select **Connect → Drivers → Node.js**, and copy the SRV
   connection string.
5. Replace `<db_password>` with the database user's password and make sure the
   database name is `stockguard_ai`:

   ```text
   mongodb+srv://stockguard_app:PASSWORD@CLUSTER.mongodb.net/stockguard_ai?retryWrites=true&w=majority&appName=Cluster0
   ```

6. Copy `server/.env.example` to `server/.env`, then place the URI after
   `MONGODB_URI=`. Never commit or paste `server/.env` into chat.
7. Replace both JWT secret placeholders with two different random strings of at
   least 32 characters.
8. Run `./run_server.ps1` and open <http://127.0.0.1:5000/api/health>. The response
   must show `mongodb.state` as `connected`.
9. Open <http://127.0.0.1:5173/login>, choose **Create account**, and register the
   first StockGuard business owner.
