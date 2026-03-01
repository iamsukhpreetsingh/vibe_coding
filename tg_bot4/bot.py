"""
Telegram Job Application Bot
- /link <CODE>  → link your Telegram to your web account
- /apply        → send a job application email
- /settings     → view/edit your default variables and email template
- /me           → show your linked account info
"""

import logging
from mailer import send_application_email

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ConversationHandler, ContextTypes, filters,
)

from config import BOT_TOKEN
from db import (
    init_db, log_application, get_settings, set_setting,
    get_user_by_link_code, get_user_by_telegram_id, link_telegram,
    APPLICATION_STATUSES,
)

logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Conversation states ────────────────────────────────────────────────────────
ASK_EMAIL, ASK_ROLE, ASK_COMPANY, ASK_SKILLS, ASK_YOE, ASK_YOUR_NAME, CONFIRM = range(7)
SET_MENU, SET_FIELD_VALUE, SET_EMAIL_BODY = range(10, 13)

SETTING_LABELS = {
    "role":          ("💼", "Default Role"),
    "skills":        ("🛠", "Default Skills"),
    "yoe":           ("📅", "Default YOE"),
    "email_subject": ("📌", "Email Subject"),
    "email_body":    ("📝", "Email Body"),
}


# ── Auth guard ────────────────────────────────────────────────────────────────

async def require_linked(update: Update) -> dict | None:
    """Return user dict if linked and verified, else send instructions and return None."""
    user = get_user_by_telegram_id(update.effective_user.id)
    if not user:
        await update.message.reply_text(
            "🔗 *Not linked yet!*\n\n"
            "1. Sign up at http://localhost:5000/signup\n"
            "2. Verify your email with the OTP sent to your inbox\n"
            "3. Copy your link code from the dashboard\n"
            "4. Send `/link YOUR_CODE` here",
            parse_mode="Markdown",
        )
        return None
    if not user.get("is_verified"):
        await update.message.reply_text(
            "⚠️ *Email not verified!*\n\n"
            "Please verify your account at http://localhost:5000/verify first.",
            parse_mode="Markdown",
        )
        return None
    return user


# ── /start & /help ────────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = get_user_by_telegram_id(update.effective_user.id)
    if user:
        await update.message.reply_text(
            f"👋 Hey *{user['your_name'] or user['email']}*!\n\n"
            "Commands:\n"
            "/apply – Send a new application\n"
            "/settings – Edit defaults & email template\n"
            "/me – Your account info\n"
            "/cancel – Cancel current action",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            "👋 *Job Application Bot*\n\n"
            "To get started:\n"
            "1. Sign up at http://localhost:5000/signup\n"
            "2. Copy your link code from the dashboard\n"
            "3. Send `/link YOUR_CODE` here\n\n"
            "Then use /apply to send applications!",
            parse_mode="Markdown",
        )


# ── /link ─────────────────────────────────────────────────────────────────────

async def link_account(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tg_id = update.effective_user.id

    # Already linked?
    existing = get_user_by_telegram_id(tg_id)
    if existing:
        await update.message.reply_text(
            f"✅ Already linked to *{existing['email']}*.\nUse /me to see your info.",
            parse_mode="Markdown",
        )
        return

    if not context.args:
        await update.message.reply_text(
            "Usage: `/link YOUR_CODE`\n\nFind your code at http://localhost:5000 → Settings.",
            parse_mode="Markdown",
        )
        return

    code = context.args[0].strip()
    user = get_user_by_link_code(code)

    if not user:
        await update.message.reply_text("❌ Invalid code. Check your dashboard and try again.")
        return

    if not user.get("is_verified"):
        await update.message.reply_text(
            "⚠️ That account's email hasn't been verified yet.\n"
            "Please verify at http://localhost:5000/verify first."
        )
        return

    if user["telegram_id"]:
        await update.message.reply_text("❌ This code is already linked to another Telegram account.")
        return

    link_telegram(user["id"], tg_id)
    await update.message.reply_text(
        f"✅ *Linked successfully!*\n\n"
        f"Account: `{user['email']}`\n\n"
        "You can now use /apply to send job applications.",
        parse_mode="Markdown",
    )


# ── /me ───────────────────────────────────────────────────────────────────────

async def me(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_linked(update)
    if not user:
        return
    settings = get_settings(user["id"])
    await update.message.reply_text(
        f"👤 *Your Account*\n\n"
        f"Email: `{user['email']}`\n"
        f"Name: {user['your_name'] or '_(not set)_'}\n\n"
        f"*Defaults:*\n"
        f"💼 Role: {settings.get('role','—')}\n"
        f"🛠 Skills: {settings.get('skills','—')}\n"
        f"📅 YOE: {settings.get('yoe','—')}\n\n"
        f"Use /settings to edit. Track apps at: http://localhost:5000",
        parse_mode="Markdown",
    )


# ── /apply flow ───────────────────────────────────────────────────────────────

async def apply_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_linked(update)
    if not user:
        return ConversationHandler.END
    context.user_data.clear()
    context.user_data["user_id"] = user["id"]
    settings = get_settings(user["id"])
    context.user_data["vars"] = {
        "role":      settings.get("role", "Software Engineer"),
        "company":   "",
        "skills":    settings.get("skills", ""),
        "yoe":       settings.get("yoe", "3"),
        "your_name": user.get("your_name") or settings.get("your_name", "Your Name"),
    }
    await update.message.reply_text(
        "📬 *New Application*\n\nRecipient's *email address*?",
        parse_mode="Markdown",
    )
    return ASK_EMAIL


async def got_email(update: Update, context: ContextTypes.DEFAULT_TYPE):
    email = update.message.text.strip()
    if "@" not in email or "." not in email:
        await update.message.reply_text("❌ Invalid email. Try again:")
        return ASK_EMAIL
    context.user_data["email"] = email
    cur = context.user_data["vars"]["role"]
    await update.message.reply_text(
        f"💼 *Role*?\n_(default: `{cur}` — send `.` to keep)_",
        parse_mode="Markdown",
    )
    return ASK_ROLE


async def got_role(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    if val != ".": context.user_data["vars"]["role"] = val
    await update.message.reply_text(
        "🏢 *Company name*?",
        parse_mode="Markdown",
    )
    return ASK_COMPANY


async def got_company(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["vars"]["company"] = update.message.text.strip()
    cur = context.user_data["vars"]["skills"]
    await update.message.reply_text(
        f"🛠 *Skills* (comma separated)?\n_(default: `{cur}` — send `.` to keep)_",
        parse_mode="Markdown",
    )
    return ASK_SKILLS


async def got_skills(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    if val != ".": context.user_data["vars"]["skills"] = val
    cur = context.user_data["vars"]["yoe"]
    await update.message.reply_text(
        f"📅 *Years of experience*?\n_(default: `{cur}` — send `.` to keep)_",
        parse_mode="Markdown",
    )
    return ASK_YOE


async def got_yoe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    if val != ".": context.user_data["vars"]["yoe"] = val
    cur = context.user_data["vars"]["your_name"]
    await update.message.reply_text(
        f"👤 *Your name*?\n_(default: `{cur}` — send `.` to keep)_",
        parse_mode="Markdown",
    )
    return ASK_YOUR_NAME


async def got_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    if val != ".": context.user_data["vars"]["your_name"] = val
    v = context.user_data["vars"]
    summary = (
        f"📧 *To:* `{context.user_data['email']}`\n"
        f"🏢 *Company:* {v['company']}\n"
        f"💼 *Role:* {v['role']}\n"
        f"🛠 *Skills:* {v['skills']}\n"
        f"📅 *YOE:* {v['yoe']} years\n"
        f"👤 *Name:* {v['your_name']}"
    )
    keyboard = [[
        InlineKeyboardButton("✅ Send Email", callback_data="send"),
        InlineKeyboardButton("❌ Cancel", callback_data="cancel"),
    ]]
    await update.message.reply_text(
        f"*Review:*\n\n{summary}\n\nSend it?",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )
    return CONFIRM


async def confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "cancel":
        await query.edit_message_text("❌ Cancelled.")
        return ConversationHandler.END

    to_email  = context.user_data["email"]
    variables = context.user_data["vars"]
    user_id   = context.user_data["user_id"]
    settings  = get_settings(user_id)

    await query.edit_message_text("⏳ Sending…")

    gmail_user = settings.get("gmail_user", "").strip()
    gmail_pass = settings.get("gmail_app_password", "").strip()

    if not gmail_user or not gmail_pass:
        await query.edit_message_text(
            "⚠️ No Gmail credentials configured.\n\n"
            "Go to http://localhost:5000/settings and add your Gmail address and App Password."
        )
        return ConversationHandler.END

    try:
        subject = settings["email_subject"].format(**variables)
        body    = settings["email_body"].format(**variables)
    except KeyError as e:
        await query.edit_message_text(f"❌ Template error: missing placeholder {e}")
        return ConversationHandler.END

    success = send_application_email(gmail_user, gmail_pass, to_email, subject, body)
    status  = "sent" if success else "failed"

    log_application(user_id, to_email, variables["company"], variables["role"], status)

    if success:
        await query.edit_message_text(
            f"✅ Email sent to `{to_email}`!\nTrack it: http://localhost:5000",
            parse_mode="Markdown",
        )
    else:
        await query.edit_message_text("❌ Failed to send. Check your Gmail credentials in .env.")
    return ConversationHandler.END


# ── /settings flow ────────────────────────────────────────────────────────────

def settings_keyboard():
    buttons = [
        [InlineKeyboardButton(f"{icon} {label}", callback_data=f"set_{key}")]
        for key, (icon, label) in SETTING_LABELS.items()
    ]
    buttons.append([InlineKeyboardButton("❌ Close", callback_data="set_close")])
    return InlineKeyboardMarkup(buttons)


async def settings_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = await require_linked(update)
    if not user:
        return ConversationHandler.END
    context.user_data["user_id"] = user["id"]
    s = get_settings(user["id"])
    lines = []
    for key, (icon, label) in SETTING_LABELS.items():
        val = s.get(key, "—")
        if key == "email_body": val = val[:50].replace("\n", " ") + "…"
        lines.append(f"{icon} *{label}:* `{val}`")
    await update.message.reply_text(
        "*⚙️ Your Settings*\n\n" + "\n".join(lines) + "\n\nTap to edit:",
        parse_mode="Markdown",
        reply_markup=settings_keyboard(),
    )
    return SET_MENU


async def settings_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    if query.data == "set_close":
        await query.edit_message_text("✅ Settings closed.")
        return ConversationHandler.END
    key = query.data[4:]
    context.user_data["editing_key"] = key
    icon, label = SETTING_LABELS.get(key, ("✏️", key))
    user_id = context.user_data["user_id"]
    current = get_settings(user_id).get(key, "")
    if key == "email_body":
        await query.edit_message_text(
            f"📝 *Edit Email Body*\n\n"
            f"Placeholders: `{{role}}` `{{company}}` `{{skills}}` `{{yoe}}` `{{your_name}}`\n\n"
            f"Current:\n```\n{current[:300]}\n```\n\nSend new body (or `.` to cancel):",
            parse_mode="Markdown",
        )
        return SET_EMAIL_BODY
    else:
        await query.edit_message_text(
            f"{icon} *Edit {label}*\n\nCurrent: `{current}`\n\nSend new value (or `.` to cancel):",
            parse_mode="Markdown",
        )
        return SET_FIELD_VALUE


async def settings_got_value(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    key = context.user_data.get("editing_key")
    if val != "." and key:
        set_setting(context.user_data["user_id"], key, val)
        _, label = SETTING_LABELS.get(key, ("", key))
        await update.message.reply_text(f"✅ *{label}* updated!", parse_mode="Markdown")
    else:
        await update.message.reply_text("↩️ No changes.")
    return ConversationHandler.END


async def settings_got_body(update: Update, context: ContextTypes.DEFAULT_TYPE):
    val = update.message.text.strip()
    if val != ".":
        set_setting(context.user_data["user_id"], "email_body", val)
        await update.message.reply_text("✅ *Email body* updated!", parse_mode="Markdown")
    else:
        await update.message.reply_text("↩️ No changes.")
    return ConversationHandler.END


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Cancelled.")
    return ConversationHandler.END


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()

    apply_conv = ConversationHandler(
        entry_points=[CommandHandler("apply", apply_start)],
        states={
            ASK_EMAIL:     [MessageHandler(filters.TEXT & ~filters.COMMAND, got_email)],
            ASK_ROLE:      [MessageHandler(filters.TEXT & ~filters.COMMAND, got_role)],
            ASK_COMPANY:   [MessageHandler(filters.TEXT & ~filters.COMMAND, got_company)],
            ASK_SKILLS:    [MessageHandler(filters.TEXT & ~filters.COMMAND, got_skills)],
            ASK_YOE:       [MessageHandler(filters.TEXT & ~filters.COMMAND, got_yoe)],
            ASK_YOUR_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, got_name)],
            CONFIRM:       [CallbackQueryHandler(confirm_callback)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    settings_conv = ConversationHandler(
        entry_points=[CommandHandler("settings", settings_start)],
        states={
            SET_MENU:        [CallbackQueryHandler(settings_button)],
            SET_FIELD_VALUE: [MessageHandler(filters.TEXT & ~filters.COMMAND, settings_got_value)],
            SET_EMAIL_BODY:  [MessageHandler(filters.TEXT & ~filters.COMMAND, settings_got_body)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
    )

    app.add_handler(CommandHandler("start",    start))
    app.add_handler(CommandHandler("help",     start))
    app.add_handler(CommandHandler("link",     link_account))
    app.add_handler(CommandHandler("me",       me))
    app.add_handler(apply_conv)
    app.add_handler(settings_conv)

    logger.info("Bot is running…")
    app.run_polling()


if __name__ == "__main__":
    main()