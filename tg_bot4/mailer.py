"""
mailer.py — reusable email sending helpers
Used for both OTP verification emails and job application emails.
"""

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)


def send_otp_email(gmail_user: str, gmail_app_password: str,
                   to_email: str, otp: str, your_name: str = "") -> bool:
    """Send OTP verification email. Returns True on success."""
    subject = "Your Job Bot verification code"
    name_line = f"Hi {your_name}," if your_name else "Hi,"
    body = (
        f"{name_line}\n\n"
        f"Your verification code is:\n\n"
        f"  {otp}\n\n"
        f"This code expires in 10 minutes.\n\n"
        f"If you didn't sign up for Job Bot, you can safely ignore this email.\n\n"
        f"— Job Bot"
    )
    return _send(gmail_user, gmail_app_password, to_email, subject, body)


def send_application_email(gmail_user: str, gmail_app_password: str,
                           to_email: str, subject: str, body: str) -> bool:
    """Send a job application email. Returns True on success."""
    return _send(gmail_user, gmail_app_password, to_email, subject, body)


def _send(gmail_user: str, gmail_app_password: str,
          to_email: str, subject: str, body: str) -> bool:
    try:
        msg = MIMEMultipart()
        msg["From"]    = gmail_user
        msg["To"]      = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
            srv.login(gmail_user, gmail_app_password)
            srv.sendmail(gmail_user, to_email, msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Email send failed ({to_email}): {e}")
        return False
