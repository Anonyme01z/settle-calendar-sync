# Email Notification Setup

The booking system includes email notifications for booking confirmations and cancellations. To enable email functionality, you need to configure SMTP settings in your environment variables.

## Required Environment Variables

Add these variables to your `.env` file:

```bash
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@gmail.com
```

## Supported Email Providers

### Gmail (Recommended)
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → App Passwords
   - Generate a password for "Mail"
3. Use the generated password as `SMTP_PASSWORD`

Example Gmail configuration:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourbusiness@gmail.com
SMTP_PASSWORD=your-16-character-app-password
SMTP_FROM_EMAIL=yourbusiness@gmail.com
```

### Outlook/Hotmail
```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-password
SMTP_FROM_EMAIL=your-email@outlook.com
```

### Custom SMTP Server
```bash
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=noreply@yourdomain.com
```

## Email Templates

The system includes two types of email notifications:

### 1. Booking Confirmation
- Sent to both customer and business owner
- Includes booking details, date, time, service info
- Professional HTML template with fallback text

### 2. Booking Cancellation
- Sent when bookings are cancelled
- Includes cancellation reason
- Different messaging for customer vs business

## Testing Email Setup

To test if email is working:

1. Start your backend server with the environment variables configured
2. Make a test booking through your booking page
3. Check both customer and business email inboxes
4. Look for any errors in the server console

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Double-check your email and password
   - For Gmail, ensure you're using an App Password, not your regular password
   - Verify 2FA is enabled for Gmail

2. **Connection Refused**
   - Check the SMTP host and port settings
   - Ensure your firewall allows outbound connections on the SMTP port

3. **Emails Not Being Sent**
   - Check server console for error messages
   - Verify all environment variables are set correctly
   - Test with a simple email client first

### Security Notes

- Never commit SMTP credentials to version control
- Use App Passwords instead of regular passwords when available
- Consider using a dedicated email address for system notifications
- Regularly rotate your SMTP credentials

## Advanced Configuration

### Production Recommendations

1. **Use a dedicated SMTP service** like:
   - SendGrid
   - Mailgun
   - Amazon SES
   - Postmark

2. **Set up DKIM and SPF** records for better deliverability

3. **Monitor email delivery** and bounce rates

4. **Use environment-specific configurations** for development vs production

### Custom Email Templates

The email templates are defined in `src/services/emailService.ts`. You can customize:

- HTML styling and branding
- Email content and messaging
- Template structure
- Company logos and colors

## Fallback Behavior

If email configuration is missing or fails:
- Bookings will still be created successfully
- Error messages are logged to the console
- The booking process won't be interrupted
- Consider implementing alternative notification methods
