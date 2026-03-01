"""
Job Application Tracker – Web Dashboard
Run: python dashboard.py  →  http://localhost:5000
"""

from flask import (
    Flask, render_template_string, request, redirect,
    url_for, session, jsonify, flash,
)
from functools import wraps
from db import (
    init_db, get_all_applications, update_status, get_settings, set_setting,
    create_user, authenticate_user, get_user_by_id, regenerate_link_code,
    update_user_name, verify_otp, refresh_otp, APPLICATION_STATUSES,
)
from mailer import send_otp_email
from config import SECRET_KEY

app = Flask(__name__)
app.secret_key = SECRET_KEY

STATUS_COLORS = {
    "sent":         ("#e0f2fe", "#0369a1"),
    "viewed":       ("#fef9c3", "#854d0e"),
    "responded":    ("#ede9fe", "#6d28d9"),
    "in process":   ("#dbeafe", "#1d4ed8"),
    "interviewing": ("#fce7f3", "#be185d"),
    "got offer":    ("#dcfce7", "#15803d"),
    "rejected":     ("#fee2e2", "#b91c1c"),
    "withdrawn":    ("#f3f4f6", "#6b7280"),
    "failed":       ("#fee2e2", "#b91c1c"),
}


# ── Auth decorators ────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return redirect(url_for("login"))
        user = get_user_by_id(session["user_id"])
        if not user:
            session.clear()
            return redirect(url_for("login"))
        if not user["is_verified"]:
            return redirect(url_for("verify_page"))
        return f(*args, **kwargs)
    return decorated


def current_user():
    uid = session.get("user_id")
    return get_user_by_id(uid) if uid else None


# ── CSS ────────────────────────────────────────────────────────────────────────

SHARED_CSS = """
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f1f5f9; color: #1e293b; min-height: 100vh;
}
a { color: inherit; text-decoration: none; }
.topbar {
  background: #1e293b; color: white;
  padding: 0 2rem; height: 56px;
  display: flex; align-items: center; gap: 1.5rem;
}
.topbar .brand { font-weight: 700; font-size: 1rem; margin-right: auto; }
.topbar a { color: #94a3b8; font-size: 0.88rem; padding: 4px 0; border-bottom: 2px solid transparent; }
.topbar a.active { color: white; border-bottom-color: #6366f1; }
.topbar .user-pill {
  background: #334155; border-radius: 999px;
  padding: 4px 12px; font-size: 0.82rem; color: #e2e8f0;
}
.topbar .logout { color: #f87171 !important; }
.container { max-width: 1100px; margin: 0 auto; padding: 2rem; }
.card {
  background: white; border-radius: 12px; padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,.07); margin-bottom: 1.2rem;
}
.card h3 { font-size: 0.95rem; font-weight: 700; color: #475569; margin-bottom: 1rem; }
.stats { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.stat {
  background: white; border-radius: 10px; padding: 0.9rem 1.4rem;
  box-shadow: 0 1px 3px rgba(0,0,0,.07); min-width: 100px;
}
.stat .num { font-size: 1.8rem; font-weight: 700; color: #6366f1; }
.stat .lbl { font-size: 0.76rem; color: #94a3b8; margin-top: 2px; }
table {
  width: 100%; border-collapse: collapse; background: white;
  border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.07);
}
thead { background: #1e293b; color: white; }
th { padding: 0.75rem 1rem; text-align: left; font-size: 0.8rem; font-weight: 600; letter-spacing:.03em; }
td { padding: 0.7rem 1rem; font-size: 0.87rem; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
tr:last-child td { border-bottom: none; }
tbody tr:hover { background: #f8fafc; }
select.status-select {
  padding: 3px 22px 3px 8px; border-radius: 999px;
  font-size: 0.75rem; font-weight: 600; border: none; cursor: pointer;
  outline: none; appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23555'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 6px center;
}
.form-row { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem; }
label { font-size: 0.82rem; font-weight: 600; color: #64748b; }
input[type=text], input[type=email], input[type=password], textarea {
  padding: 0.55rem 0.8rem; border: 1.5px solid #e2e8f0;
  border-radius: 8px; font-size: 0.9rem; font-family: inherit; width: 100%;
  transition: border 0.15s;
}
input:focus, textarea:focus { outline: none; border-color: #6366f1; }
textarea { resize: vertical; min-height: 200px; font-family: monospace; font-size: 0.84rem; }
.btn {
  padding: 0.55rem 1.4rem; background: #6366f1; color: white;
  border: none; border-radius: 8px; cursor: pointer;
  font-size: 0.9rem; font-weight: 600; display: inline-block;
}
.btn:hover { background: #4f46e5; }
.btn-sm { padding: 0.35rem 0.9rem; font-size: 0.82rem; }
.btn-ghost {
  background: none; border: 1.5px solid #e2e8f0; color: #475569;
}
.btn-ghost:hover { border-color: #6366f1; color: #6366f1; }
.auth-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.auth-box {
  background: white; border-radius: 16px; padding: 2.5rem;
  box-shadow: 0 4px 24px rgba(0,0,0,.08); width: 100%; max-width: 440px;
}
.auth-box h1 { font-size: 1.4rem; margin-bottom: 0.3rem; }
.auth-box .sub { color: #94a3b8; font-size: 0.88rem; margin-bottom: 1.8rem; }
.auth-link { text-align: center; margin-top: 1.2rem; font-size: 0.87rem; color: #64748b; }
.auth-link a { color: #6366f1; font-weight: 600; }
.flash-error   { background:#fee2e2; color:#b91c1c; border-radius:8px; padding:.6rem 1rem; font-size:.88rem; margin-bottom:.6rem; }
.flash-success { background:#dcfce7; color:#15803d; border-radius:8px; padding:.6rem 1rem; font-size:.88rem; margin-bottom:.6rem; }
.flash-info    { background:#e0f2fe; color:#0369a1; border-radius:8px; padding:.6rem 1rem; font-size:.88rem; margin-bottom:.6rem; }
.divider { border:none; border-top:1px solid #e2e8f0; margin: 1.2rem 0; }
/* OTP input */
.otp-wrap { display:flex; gap:.6rem; justify-content:center; margin: 1.2rem 0; }
.otp-wrap input {
  width: 48px; height: 56px; text-align: center;
  font-size: 1.4rem; font-weight: 700; letter-spacing: 0;
  border: 2px solid #e2e8f0; border-radius: 10px; padding: 0;
}
.otp-wrap input:focus { border-color: #6366f1; outline: none; }
.otp-timer { text-align:center; font-size:.82rem; color:#94a3b8; margin-bottom:.8rem; }
.code-box {
  background: #f8fafc; border: 1.5px dashed #6366f1;
  border-radius: 10px; padding: 1rem 1.5rem;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; margin-bottom: 0.5rem;
}
.code-box .code { font-size: 1.6rem; font-weight: 800; letter-spacing: .15em; color: #4f46e5; font-family: monospace; }
.hint {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: .65rem 1rem;
  font-size: .82rem; color: #64748b; margin-bottom: 1rem;
}
.hint code { background: #e0e7ff; color: #4338ca; padding: 1px 5px; border-radius: 4px; }
.empty { text-align: center; padding: 3rem; color: #94a3b8; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; }
@media(max-width:640px){ .two-col { grid-template-columns: 1fr; } }
</style>
"""

# ── Flash helpers ──────────────────────────────────────────────────────────────

def render_flashes():
    msgs = session.pop("_flashes", [])
    if not msgs: return ""
    html = ""
    for cat, msg in msgs:
        cls = {"error": "flash-error", "success": "flash-success"}.get(cat, "flash-info")
        html += f'<div class="{cls}">{msg}</div>'
    return html


# ── Page templates ─────────────────────────────────────────────────────────────

LOGIN_PAGE = SHARED_CSS + """
<div class="auth-wrap">
  <div class="auth-box">
    <h1>👋 Welcome back</h1>
    <p class="sub">Sign in to your job tracker</p>
    {{ flashes }}
    <form method="POST">
      <div class="form-row">
        <label>Email</label>
        <input type="email" name="email" placeholder="you@example.com" required autofocus>
      </div>
      <div class="form-row">
        <label>Password</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit" class="btn" style="width:100%;margin-top:.5rem">Sign In</button>
    </form>
    <p class="auth-link">No account? <a href="/signup">Create one</a></p>
  </div>
</div>
"""

SIGNUP_PAGE = SHARED_CSS + """
<div class="auth-wrap">
  <div class="auth-box">
    <h1>🚀 Get started</h1>
    <p class="sub">Create your account — we'll verify your email with a code</p>
    {{ flashes }}
    <form method="POST">
      <div class="form-row">
        <label>Your Name</label>
        <input type="text" name="your_name" placeholder="Jane Doe" required autofocus>
      </div>
      <div class="form-row">
        <label>Account Email</label>
        <input type="email" name="email" placeholder="you@example.com" required>
      </div>
      <div class="form-row">
        <label>Password</label>
        <input type="password" name="password" placeholder="min. 6 characters" required>
      </div>

      <hr class="divider">
      <p style="font-size:.82rem;color:#475569;font-weight:600;margin-bottom:.8rem">📤 Gmail Sending Account</p>
      <p style="font-size:.8rem;color:#64748b;margin-bottom:.8rem">
        The OTP verification email + all job application emails will be sent from this Gmail.
      </p>
      <div class="form-row">
        <label>Gmail Address</label>
        <input type="email" name="gmail_user" placeholder="you@gmail.com" required>
      </div>
      <div class="form-row">
        <label>
          Gmail App Password
          <a href="https://myaccount.google.com/apppasswords" target="_blank"
             style="color:#6366f1;font-weight:400;font-size:.76rem;margin-left:.4rem">How to get one ↗</a>
        </label>
        <input type="password" name="gmail_app_password" placeholder="xxxx xxxx xxxx xxxx" required>
      </div>

      <button type="submit" class="btn" style="width:100%;margin-top:.5rem">Create Account &amp; Send OTP</button>
    </form>
    <p class="auth-link">Already have an account? <a href="/login">Sign in</a></p>
  </div>
</div>
"""

VERIFY_PAGE = SHARED_CSS + """
<div class="auth-wrap">
  <div class="auth-box">
    <h1>📬 Check your email</h1>
    <p class="sub">We sent a 6-digit code to <strong>{{ email }}</strong></p>
    {{ flashes }}
    <form method="POST" action="/verify" id="otpForm">
      <div class="otp-wrap">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
        <input type="text" maxlength="1" class="otp-digit" inputmode="numeric" pattern="[0-9]" autocomplete="off">
      </div>
      <input type="hidden" name="otp" id="otpHidden">
      <div class="otp-timer" id="timer">Expires in <span id="countdown">10:00</span></div>
      <button type="submit" class="btn" style="width:100%" id="submitBtn" disabled>Verify</button>
    </form>

    <hr class="divider">
    <form method="POST" action="/resend_otp">
      <button type="submit" class="btn btn-ghost btn-sm" style="width:100%">🔁 Resend code</button>
    </form>
    <p style="text-align:center;margin-top:.8rem;font-size:.82rem;color:#94a3b8">
      Wrong account? <a href="/logout" style="color:#6366f1">Sign out</a>
    </p>
  </div>
</div>
<script>
// Auto-advance OTP boxes
const digits = document.querySelectorAll('.otp-digit');
const hidden  = document.getElementById('otpHidden');
const submit  = document.getElementById('submitBtn');

digits.forEach((el, i) => {
  el.addEventListener('input', () => {
    el.value = el.value.replace(/[^0-9]/g,'');
    if (el.value && i < digits.length - 1) digits[i+1].focus();
    syncOtp();
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !el.value && i > 0) digits[i-1].focus();
  });
  el.addEventListener('paste', e => {
    const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\\D/g,'');
    if (paste.length === 6) {
      digits.forEach((d, j) => d.value = paste[j] || '');
      syncOtp(); digits[5].focus();
    }
    e.preventDefault();
  });
});

function syncOtp() {
  const val = Array.from(digits).map(d => d.value).join('');
  hidden.value = val;
  submit.disabled = val.length !== 6;
}

// Countdown timer (10 min)
let secs = 10 * 60;
const cd = document.getElementById('countdown');
const tick = setInterval(() => {
  secs--;
  if (secs <= 0) { clearInterval(tick); cd.textContent = 'expired'; return; }
  cd.textContent = Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
}, 1000);

// Auto-focus first digit
digits[0].focus();
</script>
"""

TOPBAR = SHARED_CSS + """
<div class="topbar">
  <span class="brand">🤖 Job Bot</span>
  <a href="/" class="{{ 'active' if active=='tracker' else '' }}">Applications</a>
  <a href="/settings" class="{{ 'active' if active=='settings' else '' }}">Settings</a>
  <span class="user-pill">{{ user.your_name or user.email }}</span>
  <a href="/logout" class="logout">Logout</a>
</div>
"""

TRACKER_PAGE = TOPBAR + """
<div class="container">
  {{ flashes }}
  <div class="stats">
    <div class="stat"><div class="num">{{ total }}</div><div class="lbl">Total</div></div>
    <div class="stat"><div class="num" style="color:#15803d">{{ active_count }}</div><div class="lbl">Active</div></div>
    <div class="stat"><div class="num" style="color:#be185d">{{ by_status.get('interviewing',0) }}</div><div class="lbl">Interviewing</div></div>
    <div class="stat"><div class="num" style="color:#15803d">{{ by_status.get('got offer',0) }}</div><div class="lbl">Offers</div></div>
    <div class="stat"><div class="num" style="color:#b91c1c">{{ by_status.get('rejected',0) }}</div><div class="lbl">Rejected</div></div>
  </div>

  {% if not user.telegram_id %}
  <div class="card" style="border-left:4px solid #6366f1">
    <h3>🔗 Link your Telegram bot</h3>
    <p style="font-size:.88rem;color:#64748b;margin-bottom:1rem">Send this command to your bot on Telegram:</p>
    <div class="code-box">
      <span class="code">/link {{ user.link_code }}</span>
      <form method="POST" action="/regenerate_code" style="margin:0">
        <button class="btn btn-ghost btn-sm" type="submit">🔄 New code</button>
      </form>
    </div>
    <p style="font-size:.8rem;color:#94a3b8">Open Telegram → your bot → send the command above</p>
  </div>
  {% endif %}

  {% if applications %}
  <table>
    <thead>
      <tr><th>#</th><th>Date &amp; Time</th><th>Recipient Email</th><th>Company</th><th>Role</th><th>Status</th></tr>
    </thead>
    <tbody>
    {% for a in applications %}
      <tr>
        <td>{{ a.id }}</td>
        <td style="color:#64748b;font-size:.82rem">{{ a.sent_at.strftime('%Y-%m-%d %H:%M') if a.sent_at else '—' }}</td>
        <td>{{ a.to_email }}</td>
        <td>{{ a.company or '—' }}</td>
        <td>{{ a.role or '—' }}</td>
        <td>
          <select class="status-select" data-id="{{ a.id }}"
            style="background-color:{{ colors[a.status][0] if a.status in colors else '#f3f4f6' }};
                   color:{{ colors[a.status][1] if a.status in colors else '#6b7280' }};"
            onchange="updateStatus(this)">
            {% for s in statuses %}
            <option value="{{ s }}" {{ 'selected' if s == a.status else '' }}>{{ s }}</option>
            {% endfor %}
          </select>
        </td>
      </tr>
    {% endfor %}
    </tbody>
  </table>
  {% else %}
  <div class="card empty">
    No applications yet.<br>
    <span style="font-size:.85rem;color:#94a3b8">
      {% if user.telegram_id %}Send /apply to your bot.{% else %}Link your bot above first.{% endif %}
    </span>
  </div>
  {% endif %}
</div>
<script>
const colors = {{ colors_js | tojson }};
function updateStatus(sel) {
  const [bg, fg] = colors[sel.value] || ['#f3f4f6','#6b7280'];
  fetch('/update_status', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({id: sel.dataset.id, status: sel.value})
  }).then(r => r.json()).then(d => {
    if (d.ok) { sel.style.backgroundColor = bg; sel.style.color = fg; }
  });
}
setTimeout(() => location.reload(), 60000);
</script>
"""

SETTINGS_PAGE = TOPBAR + """
<div class="container">
  {{ flashes }}
  <div class="two-col">
    <div>
      <div class="card">
        <h3>👤 Profile</h3>
        <form method="POST" action="/settings/profile">
          <div class="form-row">
            <label>Your Name</label>
            <input type="text" name="your_name" value="{{ user.your_name }}">
          </div>
          <div class="form-row">
            <label>Account Email (read-only)</label>
            <input type="email" value="{{ user.email }}" disabled style="background:#f8fafc;color:#94a3b8">
          </div>
          <button class="btn btn-sm" type="submit">Save Profile</button>
        </form>
      </div>

      <div class="card">
        <h3>🔑 Change Password</h3>
        <form method="POST" action="/settings/password">
          <div class="form-row">
            <label>New Password</label>
            <input type="password" name="password" placeholder="min. 6 characters">
          </div>
          <div class="form-row">
            <label>Confirm Password</label>
            <input type="password" name="confirm">
          </div>
          <button class="btn btn-sm" type="submit">Update Password</button>
        </form>
      </div>

      <div class="card">
        <h3>📤 Gmail Sending Account</h3>
        <p style="font-size:.82rem;color:#64748b;margin-bottom:1rem">Emails are sent from this Gmail using an App Password.</p>
        <form method="POST" action="/settings/gmail">
          <div class="form-row">
            <label>Gmail Address</label>
            <input type="email" name="gmail_user" value="{{ s.get('gmail_user','') }}" placeholder="you@gmail.com">
          </div>
          <div class="form-row">
            <label>
              App Password
              <a href="https://myaccount.google.com/apppasswords" target="_blank"
                 style="color:#6366f1;font-weight:400;font-size:.76rem;margin-left:.4rem">Get one ↗</a>
            </label>
            <input type="password" name="gmail_app_password"
              placeholder="{{ '●●●● ●●●● ●●●● ●●●●' if s.get('gmail_app_password') else 'not set' }}">
            <span style="font-size:.78rem;color:#94a3b8">Leave blank to keep current</span>
          </div>
          {% if not s.get('gmail_user') %}
          <p style="font-size:.8rem;color:#ef4444;margin-bottom:.8rem">⚠️ Gmail not configured — bot cannot send emails yet.</p>
          {% endif %}
          <button class="btn btn-sm" type="submit">Save Gmail</button>
        </form>
      </div>

      <div class="card">
        <h3>🔗 Telegram Link</h3>
        {% if user.telegram_id %}
          <p style="font-size:.88rem;color:#15803d;margin-bottom:.8rem">✅ Bot linked!</p>
        {% else %}
          <p style="font-size:.88rem;color:#64748b;margin-bottom:.8rem">Not linked yet.</p>
        {% endif %}
        <div class="code-box">
          <span class="code">{{ user.link_code }}</span>
          <form method="POST" action="/regenerate_code" style="margin:0">
            <button class="btn btn-ghost btn-sm" type="submit">🔄 New code</button>
          </form>
        </div>
        <p style="font-size:.8rem;color:#94a3b8">
          Send <code style="background:#f1f5f9;padding:1px 4px;border-radius:4px">/link {{ user.link_code }}</code>
          to your bot on Telegram
        </p>
      </div>
    </div>

    <div>
      <div class="card">
        <h3>📋 Application Defaults</h3>
        <form method="POST" action="/settings/defaults">
          <div class="form-row">
            <label>Default Role</label>
            <input type="text" name="role" value="{{ s.role }}">
          </div>
          <div class="form-row">
            <label>Default Skills</label>
            <input type="text" name="skills" value="{{ s.skills }}">
          </div>
          <div class="form-row">
            <label>Default YOE</label>
            <input type="text" name="yoe" value="{{ s.yoe }}">
          </div>
          <button class="btn btn-sm" type="submit">Save Defaults</button>
        </form>
      </div>

      <div class="card">
        <h3>📧 Email Template</h3>
        <div class="hint">
          Placeholders: <code>{role}</code> <code>{company}</code>
          <code>{skills}</code> <code>{yoe}</code> <code>{your_name}</code>
        </div>
        <form method="POST" action="/settings/template">
          <div class="form-row">
            <label>Subject</label>
            <input type="text" name="email_subject" value="{{ s.email_subject }}">
          </div>
          <div class="form-row">
            <label>Body</label>
            <textarea name="email_body">{{ s.email_body }}</textarea>
          </div>
          <button class="btn btn-sm" type="submit">Save Template</button>
        </form>
      </div>
    </div>
  </div>
</div>
"""


# ── Auth routes ────────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    if "user_id" in session:
        return redirect(url_for("index"))
    if request.method == "POST":
        user = authenticate_user(request.form["email"], request.form["password"])
        if user:
            session["user_id"] = user["id"]
            if not user["is_verified"]:
                flash("Please verify your email to continue.", "info")
                return redirect(url_for("verify_page"))
            return redirect(url_for("index"))
        flash("Invalid email or password.", "error")
    return render_template_string(LOGIN_PAGE, flashes=render_flashes())


@app.route("/signup", methods=["GET", "POST"])
def signup():
    if "user_id" in session:
        return redirect(url_for("index"))
    if request.method == "POST":
        your_name      = request.form["your_name"].strip()
        email          = request.form["email"].strip().lower()
        password       = request.form["password"]
        gmail_user     = request.form.get("gmail_user", "").strip()
        gmail_app_pass = request.form.get("gmail_app_password", "").strip()

        if len(password) < 6:
            flash("Password must be at least 6 characters.", "error")
        else:
            user = create_user(email, password, your_name, gmail_user, gmail_app_pass)
            if user is None:
                flash("This email is already registered and verified.", "error")
            else:
                # Send OTP via their Gmail
                sent = send_otp_email(
                    gmail_user, gmail_app_pass,
                    to_email=email,
                    otp=user["otp_code"],
                    your_name=your_name,
                )
                session["user_id"] = user["id"]
                if sent:
                    flash(f"A 6-digit code was sent to {email}. Check your inbox.", "success")
                else:
                    flash(
                        "Account created but we couldn't send the OTP email — "
                        "check your Gmail credentials. Use Resend below.",
                        "error"
                    )
                return redirect(url_for("verify_page"))

    return render_template_string(SIGNUP_PAGE, flashes=render_flashes())


@app.route("/verify", methods=["GET", "POST"])
def verify_page():
    if "user_id" not in session:
        return redirect(url_for("login"))
    user = get_user_by_id(session["user_id"])
    if not user:
        session.clear()
        return redirect(url_for("login"))
    if user["is_verified"]:
        return redirect(url_for("index"))

    if request.method == "POST":
        submitted = request.form.get("otp", "").strip()
        result = verify_otp(user["id"], submitted)
        if result == "ok":
            flash("Email verified! Welcome 🎉", "success")
            return redirect(url_for("index"))
        elif result == "expired":
            flash("That code has expired. Request a new one below.", "error")
        else:
            flash("Incorrect code. Please try again.", "error")

    return render_template_string(
        VERIFY_PAGE, flashes=render_flashes(), email=user["email"]
    )


@app.route("/resend_otp", methods=["POST"])
def resend_otp():
    if "user_id" not in session:
        return redirect(url_for("login"))
    user = get_user_by_id(session["user_id"])
    if not user or user["is_verified"]:
        return redirect(url_for("index"))

    new_otp   = refresh_otp(user["id"])
    settings  = get_settings(user["id"])
    gmail_user = settings.get("gmail_user", "")
    gmail_pass = settings.get("gmail_app_password", "")

    if not gmail_user or not gmail_pass:
        flash("Gmail credentials not configured. Can't send OTP.", "error")
    else:
        sent = send_otp_email(gmail_user, gmail_pass, user["email"], new_otp, user["your_name"])
        if sent:
            flash("A new code was sent to your email.", "success")
        else:
            flash("Failed to send email. Check your Gmail credentials in settings.", "error")

    return redirect(url_for("verify_page"))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ── Main app routes ────────────────────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    user = current_user()
    apps = get_all_applications(user["id"])
    by_status = {}
    for a in apps:
        by_status[a["status"]] = by_status.get(a["status"], 0) + 1
    active_count = sum(
        by_status.get(s, 0)
        for s in ["sent","viewed","responded","in process","interviewing"]
    )
    return render_template_string(
        TRACKER_PAGE,
        user=user, applications=apps, total=len(apps),
        by_status=by_status, active_count=active_count,
        statuses=APPLICATION_STATUSES, colors=STATUS_COLORS,
        colors_js={k: list(v) for k, v in STATUS_COLORS.items()},
        active="tracker", flashes=render_flashes(),
    )


@app.route("/update_status", methods=["POST"])
@login_required
def status_update():
    user = current_user()
    data = request.json
    try:
        update_status(int(data["id"]), user["id"], data["status"])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@app.route("/regenerate_code", methods=["POST"])
@login_required
def regen_code():
    user = current_user()
    regenerate_link_code(user["id"])
    flash("New link code generated.", "success")
    return redirect(request.referrer or url_for("index"))


@app.route("/settings")
@login_required
def settings():
    user = current_user()
    s = get_settings(user["id"])
    return render_template_string(
        SETTINGS_PAGE, user=user, s=s,
        active="settings", flashes=render_flashes(),
    )


@app.route("/settings/profile", methods=["POST"])
@login_required
def settings_profile():
    user = current_user()
    name = request.form.get("your_name", "").strip()
    if name:
        update_user_name(user["id"], name)
        flash("Profile updated.", "success")
    return redirect(url_for("settings"))


@app.route("/settings/password", methods=["POST"])
@login_required
def settings_password():
    import hashlib
    user = current_user()
    pw  = request.form.get("password", "")
    cfm = request.form.get("confirm", "")
    if len(pw) < 6:
        flash("Password must be at least 6 characters.", "error")
    elif pw != cfm:
        flash("Passwords do not match.", "error")
    else:
        from db import get_conn
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE users SET password_hash=%s WHERE id=%s",
                (hashlib.sha256(pw.encode()).hexdigest(), user["id"])
            )
        flash("Password updated.", "success")
    return redirect(url_for("settings"))


@app.route("/settings/gmail", methods=["POST"])
@login_required
def settings_gmail():
    user = current_user()
    gmail_user = request.form.get("gmail_user", "").strip()
    gmail_pass = request.form.get("gmail_app_password", "").strip()
    if gmail_user:
        set_setting(user["id"], "gmail_user", gmail_user)
    if gmail_pass:
        set_setting(user["id"], "gmail_app_password", gmail_pass)
    if not gmail_user and not gmail_pass:
        flash("No changes made.", "error")
    else:
        flash("Gmail credentials saved.", "success")
    return redirect(url_for("settings"))


@app.route("/settings/defaults", methods=["POST"])
@login_required
def settings_defaults():
    user = current_user()
    for key in ["role", "skills", "yoe"]:
        val = request.form.get(key, "").strip()
        if val:
            set_setting(user["id"], key, val)
    flash("Defaults saved.", "success")
    return redirect(url_for("settings"))


@app.route("/settings/template", methods=["POST"])
@login_required
def settings_template():
    user = current_user()
    for key in ["email_subject", "email_body"]:
        val = request.form.get(key, "").strip()
        if val:
            set_setting(user["id"], key, val)
    flash("Email template saved.", "success")
    return redirect(url_for("settings"))


if __name__ == "__main__":
    init_db()
    print("Dashboard running at http://localhost:5000")
    app.run(debug=True, port=5000)