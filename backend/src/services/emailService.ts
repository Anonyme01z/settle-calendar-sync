// Service: Email notifications (booking confirmation/cancellation, password reset, signup OTP)
import { format } from 'date-fns';
import nodemailer from 'nodemailer';

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

interface BookingUpdateData extends BookingEmailData {
  oldBookingDate?: Date;
  oldBookingTime?: string;
  oldDuration?: number;
  changes: string[];
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

  private static transporter: nodemailer.Transporter | null = null;

  private static getTransporter() {
    if (!this.transporter) {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        console.warn('⚠️  Email not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.');
        return null;
      }
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      console.log('📧 Email provider: Gmail SMTP');
    }
    return this.transporter;
  }

  private static async send(params: { to: string; subject: string; html: string; text?: string }) {
    const transporter = this.getTransporter();
    if (!transporter) return;
    const from = this.getFrom();
    await transporter.sendMail({
      from: `"${from.name}" <${from.email}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || this.stripHtml(params.html),
    });
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
  
  static async sendSignupOTPEmail(email: string, otp: string, userName?: string): Promise<void> {
    const subject = 'Verify your Settle account';
    const name = userName || 'there';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333; margin-bottom: 10px;">Welcome to Settle!</h1>
          <p style="color: #666; font-size: 16px;">Hi ${name}, please verify your email address to complete your registration.</p>
        </div>
        
        <div style="background-color: #f7f7f7; border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
          <p style="font-size: 16px; color: #555; margin-bottom: 15px;">Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; background:#ffffff; padding: 12px 16px; display:inline-block; border-radius:8px; margin-bottom: 15px;">
            ${otp}
          </div>
          <p style="font-size: 14px; color: #888;">This code will expire in 10 minutes.</p>
        </div>
        
        <div style="text-align: center; color: #888; font-size: 14px;">
          <p>If you didn't request this verification, you can safely ignore this email.</p>
          <p>© ${new Date().getFullYear()} Settle. All rights reserved.</p>
        </div>
      </div>
    `;
    
    try {
      await this.send({ to: email, subject, html, category: 'signup-verification' });
      console.log(`Signup OTP email sent to ${email}`);
    } catch (error) {
      console.error('Error sending signup OTP email:', error);
      throw error;
    }
  }
  
  static async sendForgotPasswordEmail(email: string, resetLink: string, userName?: string): Promise<void> {
    const subject = 'Reset Your Settle Password';
    const name = userName || 'there';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #333; margin-bottom: 10px;">Password Reset</h1>
          <p style="color: #666; font-size: 16px;">Hi ${name}, we received a request to reset your password.</p>
        </div>
        
        <div style="background-color: #f7f7f7; border-radius: 10px; padding: 20px; margin-bottom: 20px; text-align: center;">
          <p style="font-size: 16px; color: #555; margin-bottom: 15px;">Click the button below to reset your password:</p>
          <a href="${resetLink}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
          <p style="font-size: 14px; color: #888; margin-top: 15px;">This link will expire in 1 hour.</p>
          <p style="font-size: 14px; color: #888; margin-top: 15px;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="font-size: 14px; word-break: break-all; background: #fff; padding: 10px; border-radius: 5px;">${resetLink}</p>
        </div>
        
        <div style="text-align: center; color: #888; font-size: 14px;">
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
          <p>© ${new Date().getFullYear()} Settle. All rights reserved.</p>
        </div>
      </div>
    `;
    
    try {
      await this.send({ to: email, subject, html, category: 'forgot-password' });
      console.log(`Forgot password email sent to ${email}`);
    } catch (error) {
      console.error('Error sending forgot password email:', error);
      throw error;
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
  
  static async sendBookingUpdateNotification(data: BookingUpdateData): Promise<void> {
    const { 
      customerEmail, 
      businessEmail, 
      customerName, 
      businessName, 
      serviceName, 
      bookingDate, 
      bookingTime, 
      duration, 
      bookingId, 
      changes,
      oldBookingDate,
      oldBookingTime
    } = data;

    const formattedDate = format(bookingDate, 'EEEE, MMMM do, yyyy');
    const formattedOldDate = oldBookingDate ? format(oldBookingDate, 'EEEE, MMMM do, yyyy') : '';
    
    // Email to customer
    const customerSubject = `Booking Updated - ${serviceName} with ${businessName}`;
    const customerHtml = this.generateBookingUpdateTemplate({
      customerName,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      duration,
      bookingId,
      changes,
      oldBookingDate: formattedOldDate,
      oldBookingTime,
      isForCustomer: true
    });

    // Email to business
    const businessSubject = `Booking Updated - ${serviceName} on ${formattedDate}`;
    const businessHtml = this.generateBookingUpdateTemplate({
      customerName,
      businessName,
      serviceName,
      bookingDate: formattedDate,
      bookingTime,
      duration,
      bookingId,
      changes,
      oldBookingDate: formattedOldDate,
      oldBookingTime,
      isForCustomer: false
    });

    try {
      // Send email to customer
      await this.send({ to: customerEmail, subject: customerSubject, html: customerHtml, category: 'booking-update' });

      // Send email to business
      await this.send({ to: businessEmail, subject: businessSubject, html: businessHtml, category: 'booking-update' });

      console.log(`Booking update emails sent for booking ${bookingId}`);
    } catch (error) {
      console.error('Error sending booking update emails:', error);
    }
  }
  
  private static generateBookingUpdateTemplate(data: {
    customerName: string;
    businessName: string;
    serviceName: string;
    bookingDate: string;
    bookingTime: string;
    duration: number;
    bookingId: string;
    changes: string[];
    oldBookingDate?: string;
    oldBookingTime?: string;
    isForCustomer: boolean;
  }): string {
    const { 
      customerName, 
      businessName, 
      serviceName, 
      bookingDate, 
      bookingTime, 
      duration, 
      bookingId, 
      changes,
      oldBookingDate,
      oldBookingTime,
      isForCustomer
    } = data;
    
    const recipient = isForCustomer ? customerName : 'You';
    const provider = isForCustomer ? businessName : 'your business';
    const changesHtml = changes.map(change => `<li style="margin-bottom: 8px;">${change}</li>`).join('');
    
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Update</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #4a90e2; margin-bottom: 10px;">Booking Update</h1>
        <p style="font-size: 18px; color: #555;">Your booking details have been updated</p>
      </div>
      
      <div style="background-color: #f7f7f7; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #333; margin-top: 0;">Updated Booking Details</h2>
        
        <p style="margin-bottom: 5px;"><strong>Service:</strong> ${serviceName}</p>
        <p style="margin-bottom: 5px;"><strong>Date:</strong> ${bookingDate}</p>
        <p style="margin-bottom: 5px;"><strong>Time:</strong> ${bookingTime}</p>
        <p style="margin-bottom: 5px;"><strong>Duration:</strong> ${duration} minutes</p>
        <p style="margin-bottom: 5px;"><strong>Booking ID:</strong> ${bookingId}</p>
        
        <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
          <h3 style="color: #333;">Changes Made:</h3>
          <ul style="padding-left: 20px; color: #555;">
            ${changesHtml}
          </ul>
        </div>
      </div>
      
      <div style="text-align: center; color: #888; font-size: 14px; margin-top: 30px;">
        <p>If you have any questions, please contact us.</p>
        <p>© ${new Date().getFullYear()} Settle. All rights reserved.</p>
      </div>
    </body>
    </html>
    `;
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
