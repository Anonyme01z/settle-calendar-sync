// Service: Email notifications (booking confirmation/cancellation, password reset)
import { format } from 'date-fns';
import * as Brevo from '@getbrevo/brevo';

interface BookingEmailData {
  customerName: string;
  customerEmail: string;
  businessName: string;
  businessEmail: string;
  serviceName: string;
  bookingDate: Date;
  bookingTime: string;
  duration: number;
  customerNotes?: string;
  bookingId: string;
}

export class EmailService {
  private static getFrom() {
    const email = process.env.MAIL_FROM || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const name = process.env.MAIL_FROM_NAME || 'Settle';
    if (!email) {
      console.warn('MAIL_FROM is not set. Please configure MAIL_FROM in environment.');
    }
    return { email: email as string, name };
  }

  private static ensureInitialized() {
    const key = process.env.BREVO_API_KEY;
    if (!key) {
      console.warn('BREVO_API_KEY is not set. Emails will fail to send.');
    }
  }

  private static async send(params: { to: string; subject: string; html: string; text?: string; replyTo?: string; category?: string }) {
    this.ensureInitialized();
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      // Skip sending if not configured
      return;
    }
    const { to, subject, html, text, replyTo, category } = params;
    const from = this.getFrom();
    const tags: string[] = [];
    if (process.env.MAIL_TAG_PREFIX) tags.push(process.env.MAIL_TAG_PREFIX);
    if (category) tags.push(category);

    const defaultClient = Brevo.ApiClient.instance;
    const apiKeyAuth = defaultClient.authentications['api-key'];
    apiKeyAuth.apiKey = apiKey;
    const tranEmailApi = new Brevo.TransactionalEmailsApi();

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: from.email, name: from.name };
    sendSmtpEmail.to = [{ email: to }];
    if (replyTo) sendSmtpEmail.replyTo = { email: replyTo } as any;
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text || this.stripHtml(html);
    if (tags.length) (sendSmtpEmail as any).tags = tags;

    await tranEmailApi.sendTransacEmail(sendSmtpEmail);
  }

  static async sendBookingConfirmation(data: BookingEmailData): Promise<void> {
    const { customerEmail, businessEmail, customerName, businessName, serviceName, bookingDate, bookingTime, duration, customerNotes, bookingId } = data;

    const formattedDate = format(bookingDate, 'EEEE, MMMM do, yyyy');
    
    // Email to customer
    const customerSubject = `Booking Confirmed - ${serviceName} with ${businessName}`;
    const customerHtml = this.generateCustomerEmailTemplate({
      customerName,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      duration,
      customerNotes,
      bookingId,
      businessEmail
    });

    // Email to business
    const businessSubject = `New Booking - ${serviceName} on ${formattedDate}`;
    const businessHtml = this.generateBusinessEmailTemplate({
      customerName,
      customerEmail,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      duration,
      customerNotes,
      bookingId
    });

    try {
      // Send email to customer
      await this.send({ to: customerEmail, subject: customerSubject, html: customerHtml, category: 'booking-confirmation' });

      // Send email to business
      await this.send({ to: businessEmail, subject: businessSubject, html: businessHtml, category: 'booking-notification' });

      console.log(`Booking confirmation emails sent for booking ${bookingId}`);
    } catch (error) {
      console.error('Error sending booking confirmation emails:', error);
      // Don't throw error to prevent booking failure due to email issues
    }
  }

  static async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    const subject = 'Your Settle password reset code';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <h2>Password Reset Request</h2>
        <p>Use the following one-time code to reset your password. This code expires in 10 minutes.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; background:#f5f5f5; padding: 12px 16px; display:inline-block; border-radius:8px;">
          ${code}
        </div>
        <p style="margin-top: 16px; color:#555;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `;
    try {
      await this.send({ to: email, subject, html, category: 'password-reset' });
    } catch (error) {
      console.error('Error sending password reset email:', error);
    }
  }

  static async sendBookingCancellation(data: BookingEmailData & { cancellationReason?: string }): Promise<void> {
    const { customerEmail, businessEmail, customerName, businessName, serviceName, bookingDate, bookingTime, bookingId, cancellationReason } = data;

    const formattedDate = format(bookingDate, 'EEEE, MMMM do, yyyy');
    
    // Email to customer
    const customerSubject = `Booking Cancelled - ${serviceName} with ${businessName}`;
    const customerHtml = this.generateCancellationEmailTemplate({
      customerName,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      bookingId,
      businessEmail,
      cancellationReason,
      isForCustomer: true
    });

    // Email to business
    const businessSubject = `Booking Cancelled - ${serviceName} on ${formattedDate}`;
    const businessHtml = this.generateCancellationEmailTemplate({
      customerName,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      bookingId,
      businessEmail: customerEmail,
      cancellationReason,
      isForCustomer: false
    });

    try {
      // Send email to customer
      await this.send({ to: customerEmail, subject: customerSubject, html: customerHtml, category: 'booking-cancellation' });

      // Send email to business
      await this.send({ to: businessEmail, subject: businessSubject, html: businessHtml, category: 'booking-cancellation' });

      console.log(`Booking cancellation emails sent for booking ${bookingId}`);
    } catch (error) {
      console.error('Error sending booking cancellation emails:', error);
    }
  }

  private static generateCustomerEmailTemplate(data: {
    customerName: string;
    businessName: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    duration: number;
    customerNotes?: string;
    bookingId: string;
    businessEmail: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .booking-details { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
    .detail-label { font-weight: 600; color: #666; }
    .detail-value { color: #333; }
    .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
    .success-icon { font-size: 48px; margin-bottom: 10px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1>Booking Confirmed!</h1>
      <p>Your appointment has been successfully scheduled</p>
    </div>
    
    <div class="content">
      <p>Hi ${data.customerName},</p>
      
      <p>Great news! Your booking with <strong>${data.businessName}</strong> has been confirmed. Here are your appointment details:</p>
      
      <div class="booking-details">
        <h3>📅 Appointment Details</h3>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${data.serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${data.bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time:</span>
          <span class="detail-value">${data.bookingTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Duration:</span>
          <span class="detail-value">${data.duration} minutes</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${data.bookingId}</span>
        </div>
        ${data.customerNotes ? `
        <div class="detail-row">
          <span class="detail-label">Your Notes:</span>
          <span class="detail-value">${data.customerNotes}</span>
        </div>` : ''}
      </div>
      
      <p><strong>What's Next?</strong></p>
      <ul>
        <li>Please arrive a few minutes early for your appointment</li>
        <li>If you need to reschedule or cancel, please contact ${data.businessName} as soon as possible</li>
        <li>Save this email for your records</li>
      </ul>
      
      <p>If you have any questions, you can contact ${data.businessName} directly at <a href="mailto:${data.businessEmail}">${data.businessEmail}</a></p>
      
      <p>We look forward to seeing you!</p>
    </div>
    
    <div class="footer">
      <p>This is an automated confirmation email for your booking with ${data.businessName}.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private static generateBusinessEmailTemplate(data: {
    customerName: string;
    customerEmail: string;
    businessName: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    duration: number;
    customerNotes?: string;
    bookingId: string;
  }): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking Notification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .booking-details { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
    .detail-label { font-weight: 600; color: #666; }
    .detail-value { color: #333; }
    .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
    .notification-icon { font-size: 48px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="notification-icon">🔔</div>
      <h1>New Booking Received</h1>
      <p>You have a new appointment scheduled</p>
    </div>
    
    <div class="content">
      <p>Hello ${data.businessName},</p>
      
      <p>You have received a new booking. Here are the details:</p>
      
      <div class="booking-details">
        <h3>📋 Booking Details</h3>
        <div class="detail-row">
          <span class="detail-label">Customer:</span>
          <span class="detail-value">${data.customerName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Email:</span>
          <span class="detail-value"><a href="mailto:${data.customerEmail}">${data.customerEmail}</a></span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${data.serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${data.bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time:</span>
          <span class="detail-value">${data.bookingTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Duration:</span>
          <span class="detail-value">${data.duration} minutes</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${data.bookingId}</span>
        </div>
        ${data.customerNotes ? `
        <div class="detail-row">
          <span class="detail-label">Customer Notes:</span>
          <span class="detail-value">${data.customerNotes}</span>
        </div>` : ''}
      </div>
      
      <p>The customer has been automatically sent a confirmation email with all the appointment details.</p>
      
      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Add this appointment to your calendar</li>
        <li>Prepare any materials needed for the ${data.serviceName} service</li>
        <li>Contact the customer if you need to make any changes</li>
      </ul>
    </div>
    
    <div class="footer">
      <p>This notification was generated automatically by your booking system.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private static generateCancellationEmailTemplate(data: {
    customerName: string;
    businessName: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    bookingId: string;
    businessEmail: string;
    cancellationReason?: string;
    isForCustomer: boolean;
  }): string {
    const recipient = data.isForCustomer ? data.customerName : data.businessName;
    const subject = data.isForCustomer ? 'Your booking has been cancelled' : 'A booking has been cancelled';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Cancellation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .booking-details { background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
    .detail-label { font-weight: 600; color: #666; }
    .detail-value { color: #333; }
    .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
    .cancel-icon { font-size: 48px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="cancel-icon">❌</div>
      <h1>Booking Cancelled</h1>
      <p>${subject}</p>
    </div>
    
    <div class="content">
      <p>Hi ${recipient},</p>
      
      <p>This is to inform you that the following booking has been cancelled:</p>
      
      <div class="booking-details">
        <h3>📅 Cancelled Appointment</h3>
        <div class="detail-row">
          <span class="detail-label">Customer:</span>
          <span class="detail-value">${data.customerName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Service:</span>
          <span class="detail-value">${data.serviceName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">${data.bookingDate}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time:</span>
          <span class="detail-value">${data.bookingTime}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Booking ID:</span>
          <span class="detail-value">${data.bookingId}</span>
        </div>
        ${data.cancellationReason ? `
        <div class="detail-row">
          <span class="detail-label">Reason:</span>
          <span class="detail-value">${data.cancellationReason}</span>
        </div>` : ''}
      </div>
      
      ${data.isForCustomer ? `
      <p>If you'd like to reschedule, please contact ${data.businessName} at <a href="mailto:${data.businessEmail}">${data.businessEmail}</a> or visit their booking page to select a new time.</p>
      <p>We apologize for any inconvenience this may cause.</p>
      ` : `
      <p>The customer has been automatically notified of this cancellation.</p>
      <p>This time slot is now available for new bookings.</p>
      `}
    </div>
    
    <div class="footer">
      <p>This is an automated notification from your booking system.</p>
    </div>
  </div>
</body>
</html>`;
  }

  static async sendFeedbackNotification(params: { name: string; email: string; message: string }): Promise<void> {
    const to = process.env.MAIL_FEEDBACK_TO || process.env.MAIL_FROM || 'tech@settle.com';
    const subject = `New Feedback from ${params.name}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <h2>New Feedback Received</h2>
        <p><strong>Name:</strong> ${this.escapeHtml(params.name)}</p>
        <p><strong>Email:</strong> ${this.escapeHtml(params.email)}</p>
        <p><strong>Message:</strong></p>
        <div style="white-space: pre-wrap; background:#f5f5f5; padding:12px; border-radius:8px;">${this.escapeHtml(params.message)}</div>
      </div>
    `;
    try {
      await this.send({ to, subject, html, replyTo: params.email, category: 'feedback' });
    } catch (error) {
      console.error('Error sending feedback notification:', error);
    }
  }

  private static stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private static escapeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
