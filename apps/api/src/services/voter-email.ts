import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

export type SendVoterVerificationEmailInput = {
  to: string;
  campaignTitle: string;
  verificationUrl: string;
  expiresInMinutes: number;
};

export type VoterEmailSender = {
  sendVerificationEmail(input: SendVoterVerificationEmailInput): Promise<void>;
};

export class SmtpVoterEmailSender implements VoterEmailSender {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string
  ) {}

  async sendVerificationEmail(input: SendVoterVerificationEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: `Verify your email for ${input.campaignTitle}`,
      text: [
        `Use this one-time link to verify your email for ${input.campaignTitle}:`,
        "",
        input.verificationUrl,
        "",
        `The link expires in ${input.expiresInMinutes} minutes.`,
        "If you did not request this message, you can ignore it.",
        "Verifying an email does not prove a unique real-world person."
      ].join("\n")
    });
  }
}

export function createVoterEmailSender(): VoterEmailSender {
  const auth =
    env.SMTP_USER && env.SMTP_PASSWORD
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD
        }
      : undefined;

  return new SmtpVoterEmailSender(
    nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(auth ? { auth } : {})
    }),
    env.VOTER_EMAIL_FROM
  );
}
