import nodemailer from 'nodemailer';

const email = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

export const transporter = nodemailer.createTransport({
  host: "smtp.mail.yahoo.com",
  port: 465,
  secure: true,
  auth: {
    user: email,
    pass: pass?.replace(/\s+/g, ''),
  },
});

export const mailOptions = {
  from: email || 'service@asija.in',
};

// Send OTP email
export async function sendOTPEmail(otp: string): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL || 'service@asija.in';
  
  await transporter.sendMail({
    ...mailOptions,
    to: adminEmail,
    subject: 'Attendance Console - Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 400px;">
        <h2 style="color: #10b981;">Attendance Console</h2>
        <p>Your one-time password (OTP) for login is:</p>
        <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This OTP is valid for 5 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
}
