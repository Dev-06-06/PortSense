from __future__ import annotations

import logging
import os
import random
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import aiosmtplib
from dotenv import load_dotenv


# Always load backend/.env even when this module is used from the repository root.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

logger = logging.getLogger(__name__)

_mail_user = os.getenv("MAIL_USER", "")
_mail_pass = os.getenv("MAIL_PASS", "")
logger.info(
  "Mailer config loaded (MAIL_USER set: %s, MAIL_PASS set: %s)",
  bool(_mail_user),
  bool(_mail_pass),
)

GMAIL_HOST = "smtp.gmail.com"
GMAIL_PORT = 587

PURPOSE_MAP = {
    "verify": "verify your PortSense account",
    "reset": "reset your PortSense password",
}


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


def _get_mail_credentials() -> tuple[str, str]:
    mail_user = os.getenv("MAIL_USER")
    mail_pass = os.getenv("MAIL_PASS")

    if not mail_user or not mail_pass:
        raise ValueError("MAIL_USER and MAIL_PASS must be configured")

    return mail_user, mail_pass


def _build_html_email(otp: str, purpose: str) -> str:
    action_text = PURPOSE_MAP.get(purpose, purpose)

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PortSense OTP</title>
  </head>
  <body style="margin:0;padding:0;background:#0d1117;font-family:Arial,Helvetica,sans-serif;color:#e5eefb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0d1117;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#111827;border:1px solid rgba(37,99,235,0.28);border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:32px 32px 24px;text-align:center;background:linear-gradient(180deg, rgba(37,99,235,0.18), rgba(17,24,39,0));">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:rgba(37,99,235,0.16);color:#93c5fd;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">PortSense</div>
                <h1 style="margin:20px 0 10px;font-size:28px;line-height:1.2;color:#f9fbff;">Your one-time passcode</h1>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#c7d2e5;">Use this code to {action_text}.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;text-align:center;">
                <div style="display:inline-block;padding:18px 28px;border-radius:16px;background:#0b1220;border:1px solid rgba(37,99,235,0.35);color:#ffffff;font-size:34px;font-weight:800;letter-spacing:0.24em;">{otp}</div>
                <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#93a4c3;">Expires in 10 minutes</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 34px;text-align:center;">
                <p style="margin:0;font-size:13px;line-height:1.8;color:#7f8ba3;">If you did not request this code, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


async def send_otp_email(to: str, subject: str, otp: str, purpose: str):
    mail_user, mail_pass = _get_mail_credentials()

    message = MIMEMultipart("alternative")
    message["From"] = f'PortSense <{mail_user}>'
    message["To"] = to
    message["Subject"] = subject

    text_body = (
        f"Your PortSense one-time passcode is {otp}. "
        "It expires in 10 minutes."
    )
    html_body = _build_html_email(otp, purpose)

    message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    logger.info("Sending OTP email to %s via %s:%s", to, GMAIL_HOST, GMAIL_PORT)
    try:
        await aiosmtplib.send(
            message,
            hostname=GMAIL_HOST,
            port=GMAIL_PORT,
            start_tls=True,
            username=mail_user,
            password=mail_pass,
        )
        logger.info("OTP email sent successfully to %s", to)
    except Exception as exc:
        logger.error("Failed to send OTP email to %s: %r", to, exc, exc_info=True)
        raise