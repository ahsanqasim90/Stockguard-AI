const { verifyEmailDelivery } = await import("../src/services/notificationService.js");

const result = await verifyEmailDelivery({ sendTo: String(process.env.SMTP_TEST_TO || "").trim() });
console.log(JSON.stringify(result, null, 2));

if (!result.configured) {
  console.error("Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and EMAIL_FROM before running this check.");
  process.exit(2);
}
if (!result.verified || (process.env.SMTP_TEST_TO && !result.sent)) process.exit(1);
