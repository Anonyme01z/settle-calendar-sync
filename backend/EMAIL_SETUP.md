# Email Notification Setup (SendGrid)

The system sends transactional emails for booking confirmations, cancellations, password resets, and feedback notifications. We use SendGrid as the email provider.

## 1) Create a SendGrid account and API key
- Go to https://sendgrid.com/ and create an account.
- In your SendGrid dashboard, go to Settings → API Keys → Create API Key.
- Create a full access or restricted access key (with at least Mail Send permissions).
- Copy the API key.

## 2) Configure environment variables
Add these to your backend `.env` file:

```bash
# SendGrid API
SENDGRID_API_KEY=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

# Sender details
MAIL_FROM=notifications@settle.com
MAIL_FROM_NAME=Settle
# Optional: a short tag prefix to group metrics
MAIL_TAG_PREFIX=settle
```

Optionally, you can still configure your own SMTP for fallback if desired, but by default we use SendGrid's API.

## 3) Install dependencies
The backend uses `@sendgrid/mail`.

```bash
npm install @sendgrid/mail
```

## 4) How it works in code
- The mailer is implemented in `src/services/emailService.ts` and uses SendGrid's Mail Send API.
- You only need to ensure `SENDGRID_API_KEY`, `MAIL_FROM`, and `MAIL_FROM_NAME` are set.
- If the API key is missing, the system will log a warning and skip sending (it won't block bookings).

## 5) Testing email setup
1. Run the backend with your `.env` correctly set.
2. Create a booking through the frontend (after wiring confirmation emails).
3. You should receive confirmation emails at the customer and business addresses.
4. Check server logs if emails don’t arrive.

## 6) Deliverability tips
- Add and verify your domain in SendGrid (Settings > Sender Authentication) and configure SPF/DKIM.
- Use a dedicated sender (like `notifications@yourdomain.com`).
- Avoid spammy words and test sending to different inbox providers.

## 7) Customizing templates
The HTML templates live in `src/services/emailService.ts`. You can adapt branding, text, and layout there.

## 8) Fallback behavior
If SendGrid configuration is missing or fails, the system logs the error. Bookings and other flows continue; emails are best-effort and won't block user actions.
