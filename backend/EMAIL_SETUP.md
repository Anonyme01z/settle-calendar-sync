# Email Notification Setup (Brevo)

The system sends transactional emails for booking confirmations, cancellations, password resets, and feedback notifications. We use Brevo (formerly Sendinblue) as the email provider.

## 1) Create a Brevo account and API key
- Go to https://www.brevo.com/ and create an account.
- In your Brevo dashboard, go to SMTP & API → API Keys → Create a new API key.
- Copy the API key.

## 2) Configure environment variables
Add these to your backend `.env` file:

```bash
# Brevo API
BREVO_API_KEY=your-brevo-api-key

# Sender details
MAIL_FROM=notifications@yourdomain.com
MAIL_FROM_NAME=Your App Name
# Optional: a short tag prefix to group metrics
MAIL_TAG_PREFIX=settle
```

Optionally, you can still configure your own SMTP for fallback if desired, but by default we use Brevo’s HTTP API.

## 3) Install dependencies
The backend uses `@getbrevo/brevo`.

```bash
npm install @getbrevo/brevo
```

## 4) How it works in code
- The mailer is implemented in `src/services/emailService.ts` and uses Brevo’s Transactional Emails API.
- You only need to ensure `BREVO_API_KEY`, `MAIL_FROM`, and `MAIL_FROM_NAME` are set.
- If the API key is missing, the system will log a warning and skip sending (it won’t block bookings).

## 5) Testing email setup
1. Run the backend with your `.env` correctly set.
2. Create a booking through the frontend (after wiring confirmation emails).
3. You should receive confirmation emails at the customer and business addresses.
4. Check server logs if emails don’t arrive.

## 6) Deliverability tips
- Add and verify your domain in Brevo (Sender & IP > Domains) and configure SPF/DKIM.
- Use a dedicated sender (like `notifications@yourdomain.com`).
- Avoid spammy words and test sending to different inbox providers.

## 7) Customizing templates
The HTML templates live in `src/services/emailService.ts`. You can adapt branding, text, and layout there.

## 8) Fallback behavior
If Brevo configuration is missing or fails, the system logs the error. Bookings and other flows continue; emails are best-effort and won’t block user actions.
