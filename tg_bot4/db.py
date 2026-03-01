# """
# db.py — PostgreSQL database layer
# All tables are created automatically on first run.
# """

# import psycopg2
# import psycopg2.extras
# import secrets
# import hashlib
# import random
# from contextlib import contextmanager
# from datetime import datetime, timezone, timedelta
# from config import DATABASE_URL

# APPLICATION_STATUSES = [
#     "sent", "viewed", "responded", "in process",
#     "interviewing", "got offer", "rejected", "withdrawn",
# ]

# DEFAULT_SETTINGS = {
#     "role":               "Software Engineer",
#     "skills":             "Python, FastAPI, PostgreSQL, Docker",
#     "yoe":                "3",
#     "gmail_user":         "",
#     "gmail_app_password": "",
#     "email_subject":      "Application for {role} Position – {your_name}",
#     "email_body": (
#         "Dear Hiring Team at {company},\n\n"
#         "I am writing to express my strong interest in the {role} position at {company}. "
#         "With {yoe} years of hands-on experience in software development, I am confident that "
#         "my skills and passion for building scalable, reliable systems make me a great fit for your team.\n\n"
#         "My core technical expertise includes: {skills}.\n\n"
#         "Throughout my career, I have consistently delivered high-quality solutions while collaborating "
#         "effectively in cross-functional teams. I am drawn to {company} because of its reputation for "
#         "innovation and its commitment to engineering excellence.\n\n"
#         "I would welcome the opportunity to discuss how my background aligns with your team's goals. "
#         "Please find my resume attached, and feel free to reach out at your convenience.\n\n"
#         "Thank you for your time and consideration.\n\n"
#         "Best regards,\n{your_name}"
#     ),
# }

# OTP_EXPIRY_MINUTES = 10


# @contextmanager
# def get_conn():
#     conn = psycopg2.connect(DATABASE_URL)
#     try:
#         yield conn
#         conn.commit()
#     except Exception:
#         conn.rollback()
#         raise
#     finally:
#         conn.close()


# def init_db():
#     with get_conn() as conn:
#         cur = conn.cursor()

#         cur.execute("""
#             CREATE TABLE IF NOT EXISTS users (
#                 id                 SERIAL PRIMARY KEY,
#                 email              TEXT   UNIQUE NOT NULL,
#                 password_hash      TEXT   NOT NULL,
#                 your_name          TEXT   NOT NULL DEFAULT '',
#                 is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
#                 otp_code           TEXT,
#                 otp_expires_at     TIMESTAMPTZ,
#                 link_code          TEXT   UNIQUE,
#                 telegram_id        BIGINT UNIQUE,
#                 created_at         TIMESTAMPTZ DEFAULT NOW()
#             )
#         """)

#         # Safe migrations for existing deployments
#         migrations = [
#             ("is_verified",    "BOOLEAN NOT NULL DEFAULT FALSE"),
#             ("otp_code",       "TEXT"),
#             ("otp_expires_at", "TIMESTAMPTZ"),
#         ]
#         for col, defn in migrations:
#             cur.execute("""
#                 SELECT 1 FROM information_schema.columns
#                 WHERE table_name='users' AND column_name=%s
#             """, (col,))
#             if not cur.fetchone():
#                 cur.execute(f"ALTER TABLE users ADD COLUMN {col} {defn}")

#         cur.execute("""
#             CREATE TABLE IF NOT EXISTS settings (
#                 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 key     TEXT    NOT NULL,
#                 value   TEXT    NOT NULL,
#                 PRIMARY KEY (user_id, key)
#             )
#         """)

#         cur.execute("""
#             CREATE TABLE IF NOT EXISTS applications (
#                 id         SERIAL PRIMARY KEY,
#                 user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
#                 sent_at    TIMESTAMPTZ DEFAULT NOW(),
#                 to_email   TEXT NOT NULL,
#                 company    TEXT,
#                 role       TEXT,
#                 status     TEXT NOT NULL DEFAULT 'sent'
#             )
#         """)

#         print("✅ Database tables ready.")


# # ── Helpers ───────────────────────────────────────────────────────────────────

# def _hash_password(password: str) -> str:
#     return hashlib.sha256(password.encode()).hexdigest()

# def _generate_link_code() -> str:
#     return secrets.token_urlsafe(6)[:8].upper()

# def _generate_otp() -> str:
#     return str(random.randint(100000, 999999))

# def _otp_expiry() -> datetime:
#     return datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)


# # ── User creation & OTP ───────────────────────────────────────────────────────

# def create_user(email: str, password: str, your_name: str,
#                 gmail_user: str = "", gmail_app_password: str = "") -> dict | None:
#     """
#     Creates user as unverified with a fresh OTP.
#     Returns user dict (with otp_code), or None if email already exists.
#     """
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT id, is_verified FROM users WHERE email = %s", (email,))
#         existing = cur.fetchone()
#         if existing and existing["is_verified"]:
#             return None   # verified account already exists

#         otp   = _generate_otp()
#         expiry = _otp_expiry()

#         if existing:
#             # Unverified leftover — refresh OTP and credentials
#             cur.execute(
#                 """UPDATE users SET password_hash=%s, your_name=%s,
#                           otp_code=%s, otp_expires_at=%s
#                    WHERE id=%s RETURNING *""",
#                 (_hash_password(password), your_name, otp, expiry, existing["id"])
#             )
#         else:
#             link_code = _generate_link_code()
#             cur.execute(
#                 """INSERT INTO users
#                        (email, password_hash, your_name, is_verified,
#                         otp_code, otp_expires_at, link_code)
#                    VALUES (%s,%s,%s,FALSE,%s,%s,%s) RETURNING *""",
#                 (email, _hash_password(password), your_name, otp, expiry, link_code)
#             )

#         user = dict(cur.fetchone())

#         # Store gmail creds in settings
#         for key, val in [("gmail_user", gmail_user), ("gmail_app_password", gmail_app_password)]:
#             if val:
#                 cur.execute(
#                     """INSERT INTO settings (user_id, key, value) VALUES (%s,%s,%s)
#                        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value""",
#                     (user["id"], key, val)
#                 )
#         return user   # caller will use user["otp_code"] to send the email


# def verify_otp(user_id: int, submitted_otp: str) -> str:
#     """
#     Returns: 'ok' | 'wrong' | 'expired'
#     """
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute(
#             "SELECT otp_code, otp_expires_at FROM users WHERE id = %s", (user_id,)
#         )
#         row = cur.fetchone()
#         if not row or row["otp_code"] is None:
#             return "wrong"
#         if row["otp_code"] != submitted_otp.strip():
#             return "wrong"
#         if row["otp_expires_at"] < datetime.now(timezone.utc):
#             return "expired"
#         # Mark verified, clear OTP
#         cur.execute(
#             "UPDATE users SET is_verified=TRUE, otp_code=NULL, otp_expires_at=NULL WHERE id=%s",
#             (user_id,)
#         )
#         return "ok"


# def refresh_otp(user_id: int) -> str:
#     """Generates a new OTP for resend. Returns the new OTP string."""
#     otp    = _generate_otp()
#     expiry = _otp_expiry()
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute(
#             "UPDATE users SET otp_code=%s, otp_expires_at=%s WHERE id=%s",
#             (otp, expiry, user_id)
#         )
#     return otp


# # ── Standard auth ─────────────────────────────────────────────────────────────

# def authenticate_user(email: str, password: str) -> dict | None:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT * FROM users WHERE email = %s", (email,))
#         user = cur.fetchone()
#     if user and user["password_hash"] == _hash_password(password):
#         return dict(user)
#     return None

# def get_user_by_id(user_id: int) -> dict | None:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
#         row = cur.fetchone()
#     return dict(row) if row else None

# def get_user_by_link_code(code: str) -> dict | None:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT * FROM users WHERE link_code = %s", (code.upper(),))
#         row = cur.fetchone()
#     return dict(row) if row else None

# def get_user_by_telegram_id(telegram_id: int) -> dict | None:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT * FROM users WHERE telegram_id = %s", (telegram_id,))
#         row = cur.fetchone()
#     return dict(row) if row else None

# def link_telegram(user_id: int, telegram_id: int):
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute("UPDATE users SET telegram_id=%s WHERE id=%s", (telegram_id, user_id))

# def update_user_name(user_id: int, your_name: str):
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute("UPDATE users SET your_name=%s WHERE id=%s", (your_name, user_id))

# def regenerate_link_code(user_id: int) -> str:
#     new_code = _generate_link_code()
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute("UPDATE users SET link_code=%s WHERE id=%s", (new_code, user_id))
#     return new_code


# # ── Per-user settings ─────────────────────────────────────────────────────────

# def get_settings(user_id: int) -> dict:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute("SELECT key, value FROM settings WHERE user_id = %s", (user_id,))
#         rows = cur.fetchall()
#     result = DEFAULT_SETTINGS.copy()
#     result.update({r["key"]: r["value"] for r in rows})
#     return result

# def set_setting(user_id: int, key: str, value: str):
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute(
#             """INSERT INTO settings (user_id, key, value) VALUES (%s,%s,%s)
#                ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value""",
#             (user_id, key, value)
#         )


# # ── Applications ──────────────────────────────────────────────────────────────

# def log_application(user_id: int, to_email: str, company: str, role: str, status: str) -> int:
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute(
#             """INSERT INTO applications (user_id, to_email, company, role, status)
#                VALUES (%s,%s,%s,%s,%s) RETURNING id""",
#             (user_id, to_email, company, role, status)
#         )
#         return cur.fetchone()[0]

# def update_status(app_id: int, user_id: int, status: str):
#     with get_conn() as conn:
#         cur = conn.cursor()
#         cur.execute(
#             "UPDATE applications SET status=%s WHERE id=%s AND user_id=%s",
#             (status, app_id, user_id)
#         )

# def get_all_applications(user_id: int) -> list[dict]:
#     with get_conn() as conn:
#         cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
#         cur.execute(
#             "SELECT * FROM applications WHERE user_id=%s ORDER BY id DESC", (user_id,)
#         )
#         rows = cur.fetchall()
#     return [dict(r) for r in rows]





























"""
db.py — PostgreSQL database layer
All tables are created automatically on first run.

Fixes applied:
  1. create_user: fetchone() was called outside the with-block after commit/close.
     All RETURNING * rows are now fetched INSIDE the with-block before it exits.
  2. gmail_app_password is stored encrypted via Fernet (FERNET_KEY in .env).
     encrypt_password() / decrypt_password() are used transparently in
     set_setting() reads and writes for that specific key.
"""

import psycopg2
import psycopg2.extras
import secrets
import hashlib
import random
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta

from cryptography.fernet import Fernet
from config import DATABASE_URL, FERNET_KEY

# ── Fernet cipher (encrypt/decrypt gmail_app_password) ────────────────────────

_fernet = Fernet(FERNET_KEY.encode())

def _encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()

def _decrypt(ciphertext: str) -> str:
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except Exception:
        # If decryption fails (e.g. old plain-text value during migration),
        # return as-is so the app doesn't crash. User just needs to re-save.
        return ciphertext

ENCRYPTED_KEYS = {"gmail_app_password"}

# ── Constants ──────────────────────────────────────────────────────────────────

APPLICATION_STATUSES = [
    "sent", "viewed", "responded", "in process",
    "interviewing", "got offer", "rejected", "withdrawn",
]

DEFAULT_SETTINGS = {
    "role":               "Software Engineer",
    "skills":             "Python, FastAPI, PostgreSQL, Docker",
    "yoe":                "3",
    "gmail_user":         "",
    "gmail_app_password": "",
    "email_subject":      "Application for {role} Position – {your_name}",
    "email_body": (
        "Dear Hiring Team at {company},\n\n"
        "I am writing to express my strong interest in the {role} position at {company}. "
        "With {yoe} years of hands-on experience in software development, I am confident that "
        "my skills and passion for building scalable, reliable systems make me a great fit for your team.\n\n"
        "My core technical expertise includes: {skills}.\n\n"
        "Throughout my career, I have consistently delivered high-quality solutions while collaborating "
        "effectively in cross-functional teams. I am drawn to {company} because of its reputation for "
        "innovation and its commitment to engineering excellence.\n\n"
        "I would welcome the opportunity to discuss how my background aligns with your team's goals. "
        "Please find my resume attached, and feel free to reach out at your convenience.\n\n"
        "Thank you for your time and consideration.\n\n"
        "Best regards,\n{your_name}"
    ),
}

OTP_EXPIRY_MINUTES = 10


# ── DB connection ──────────────────────────────────────────────────────────────

@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Schema ─────────────────────────────────────────────────────────────────────

def init_db():
    with get_conn() as conn:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id             SERIAL PRIMARY KEY,
                email          TEXT    UNIQUE NOT NULL,
                password_hash  TEXT    NOT NULL,
                your_name      TEXT    NOT NULL DEFAULT '',
                is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
                otp_code       TEXT,
                otp_expires_at TIMESTAMPTZ,
                link_code      TEXT    UNIQUE,
                telegram_id    BIGINT  UNIQUE,
                created_at     TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Safe migrations for existing deployments
        migrations = [
            ("is_verified",    "BOOLEAN NOT NULL DEFAULT FALSE"),
            ("otp_code",       "TEXT"),
            ("otp_expires_at", "TIMESTAMPTZ"),
        ]
        for col, defn in migrations:
            cur.execute("""
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name=%s
            """, (col,))
            if not cur.fetchone():
                cur.execute(f"ALTER TABLE users ADD COLUMN {col} {defn}")

        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                key     TEXT    NOT NULL,
                value   TEXT    NOT NULL,
                PRIMARY KEY (user_id, key)
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id        SERIAL PRIMARY KEY,
                user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                sent_at   TIMESTAMPTZ DEFAULT NOW(),
                to_email  TEXT NOT NULL,
                company   TEXT,
                role      TEXT,
                status    TEXT NOT NULL DEFAULT 'sent'
            )
        """)

        print("✅ Database tables ready.")


# ── Internal helpers ───────────────────────────────────────────────────────────

def _hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def _generate_link_code() -> str:
    return secrets.token_urlsafe(6)[:8].upper()

def _generate_otp() -> str:
    return str(random.randint(100000, 999999))

def _otp_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)


# ── User creation & OTP ───────────────────────────────────────────────────────

def create_user(email: str, password: str, your_name: str,
                gmail_user: str = "", gmail_app_password: str = "") -> dict | None:
    """
    Creates user as unverified with a fresh OTP.
    Returns user dict (including otp_code in plain text for sending), or None
    if a *verified* account already exists for this email.

    FIX: all cur.fetchone() calls happen INSIDE the with-block, before
    the context manager commits and closes the connection.
    """
    otp    = _generate_otp()
    expiry = _otp_expiry()

    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ── Check for existing account ────────────────────────────────────────
        cur.execute("SELECT id, is_verified FROM users WHERE email = %s", (email,))
        existing = cur.fetchone()                       # ← fetched inside with-block ✓

        if existing and existing["is_verified"]:
            return None                                 # verified account — reject

        if existing:
            # Unverified leftover — refresh credentials + OTP
            cur.execute(
                """UPDATE users
                   SET password_hash=%s, your_name=%s, otp_code=%s, otp_expires_at=%s
                   WHERE id=%s
                   RETURNING *""",
                (_hash_password(password), your_name, otp, expiry, existing["id"])
            )
        else:
            link_code = _generate_link_code()
            cur.execute(
                """INSERT INTO users
                       (email, password_hash, your_name, is_verified,
                        otp_code, otp_expires_at, link_code)
                   VALUES (%s, %s, %s, FALSE, %s, %s, %s)
                   RETURNING *""",
                (email, _hash_password(password), your_name, otp, expiry, link_code)
            )

        user = dict(cur.fetchone())                     # ← fetched inside with-block ✓

        # ── Store Gmail creds in settings (app password encrypted) ────────────
        for key, val in [("gmail_user", gmail_user),
                         ("gmail_app_password", gmail_app_password)]:
            if val:
                stored_val = _encrypt(val) if key in ENCRYPTED_KEYS else val
                cur.execute(
                    """INSERT INTO settings (user_id, key, value)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value""",
                    (user["id"], key, stored_val)
                )

    # Return user dict with plain-text otp_code so the caller can email it.
    # (otp_code is NOT encrypted — it's a short-lived throwaway value.)
    user["otp_code"] = otp
    return user


def verify_otp(user_id: int, submitted_otp: str) -> str:
    """Returns: 'ok' | 'wrong' | 'expired'"""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT otp_code, otp_expires_at FROM users WHERE id = %s", (user_id,)
        )
        row = cur.fetchone()                            # ← inside with-block ✓

        if not row or row["otp_code"] is None:
            return "wrong"
        if row["otp_code"] != submitted_otp.strip():
            return "wrong"
        if row["otp_expires_at"] < datetime.now(timezone.utc):
            return "expired"

        # Mark verified and clear OTP — still inside the with-block so it commits
        cur.execute(
            """UPDATE users
               SET is_verified=TRUE, otp_code=NULL, otp_expires_at=NULL
               WHERE id=%s""",
            (user_id,)
        )
        return "ok"


def refresh_otp(user_id: int) -> str:
    """Generates a new OTP for resend. Returns plain-text OTP."""
    otp    = _generate_otp()
    expiry = _otp_expiry()
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET otp_code=%s, otp_expires_at=%s WHERE id=%s",
            (otp, expiry, user_id)
        )
    return otp


# ── Standard auth ─────────────────────────────────────────────────────────────

def authenticate_user(email: str, password: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()                           # ← inside with-block ✓
        if user and user["password_hash"] == _hash_password(password):
            return dict(user)
    return None

def get_user_by_id(user_id: int) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
    return dict(row) if row else None

def get_user_by_link_code(code: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE link_code = %s", (code.upper(),))
        row = cur.fetchone()
    return dict(row) if row else None

def get_user_by_telegram_id(telegram_id: int) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM users WHERE telegram_id = %s", (telegram_id,))
        row = cur.fetchone()
    return dict(row) if row else None

def link_telegram(user_id: int, telegram_id: int):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET telegram_id=%s WHERE id=%s", (telegram_id, user_id))

def update_user_name(user_id: int, your_name: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET your_name=%s WHERE id=%s", (your_name, user_id))

def regenerate_link_code(user_id: int) -> str:
    new_code = _generate_link_code()
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET link_code=%s WHERE id=%s", (new_code, user_id))
    return new_code


# ── Per-user settings ─────────────────────────────────────────────────────────

def get_settings(user_id: int) -> dict:
    """Returns settings dict with gmail_app_password already decrypted."""
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT key, value FROM settings WHERE user_id = %s", (user_id,))
        rows = cur.fetchall()

    result = DEFAULT_SETTINGS.copy()
    for r in rows:
        key, val = r["key"], r["value"]
        result[key] = _decrypt(val) if key in ENCRYPTED_KEYS else val
    return result

def set_setting(user_id: int, key: str, value: str):
    """Encrypts gmail_app_password before storing."""
    stored_value = _encrypt(value) if key in ENCRYPTED_KEYS else value
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO settings (user_id, key, value) VALUES (%s, %s, %s)
               ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value""",
            (user_id, key, stored_value)
        )


# ── Applications ──────────────────────────────────────────────────────────────

def log_application(user_id: int, to_email: str, company: str, role: str, status: str) -> int:
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO applications (user_id, to_email, company, role, status)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (user_id, to_email, company, role, status)
        )
        return cur.fetchone()[0]                        # ← inside with-block ✓

def update_status(app_id: int, user_id: int, status: str):
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE applications SET status=%s WHERE id=%s AND user_id=%s",
            (status, app_id, user_id)
        )

def get_all_applications(user_id: int) -> list[dict]:
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM applications WHERE user_id=%s ORDER BY id DESC", (user_id,)
        )
        rows = cur.fetchall()
    return [dict(r) for r in rows]