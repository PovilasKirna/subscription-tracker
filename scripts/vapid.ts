// Prints a fresh VAPID key pair for Web Push:   npm run vapid
// Put the lines in .env (self-hosted) or your hosting's environment variables. Generate once and keep
// them: changing the keys invalidates every device that already enabled notifications.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("# A contact for the push services (optional when MAIL_FROM is set):");
console.log("VAPID_SUBJECT=mailto:you@example.com");
