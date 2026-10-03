import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
  Users,
  X,
  Cake,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

const ADMIN_EMAILS = [
  "jrsumalinab@gmail.com",
  "jsumalinab@addu.edu.ph",
];

function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem("theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return { isDark, toggleDark: () => setIsDark((d) => !d) };
}

function useAuth() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const signOut = () => supabase.auth.signOut();
  const isAdmin = !!session && ADMIN_EMAILS.includes(session.user?.email);

  return { session, isAdmin, loading: session === undefined, signInWithGoogle, signOut };
}

const COL = {
  volunteer: {
    id: "id",
    name: "name",
    email: "email",
    tier: "membership_type",
    yearCourse: "course_year",
    contact: "contact_number",
    birthday: "birthday",
  },
  event: {
    id: "id",
    title: "title",
    date: "event_date",
    endDate: "event_end_date",
    endTime: "end_time",
  },
  attendee: { id: "id", volunteerId: "volunteer_id", eventId: "event_id", role: "role_assigned" },
  schedule: {
    id: "id",
    volunteerId: "volunteer_id",
    course: "course_name",
    day: "day_of_week",
    start: "start_time",
    end: "end_time",
  },
};

const ROLE_OPTIONS = ["Photographer", "Videographer", "Documentation", "Logistics", "Registration", "Other"];

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function todayLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

function nowLocalHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function parseEventDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLocalDate(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function combineLocalDateTime(dateStr, timeStr) {
  const combined = parseLocalDate(dateStr);
  const [h, m] = timeStr.split(":").map(Number);
  combined.setHours(h, m, 0, 0);
  return combined;
}

function formatEventTimeRange(startValue, endValue) {
  const start = parseEventDate(startValue);
  if (!start) return "";
  const startStr = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = parseEventDate(endValue);
  if (!end) return startStr;
  const endStr = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

function parseBirthday(value) {
  if (!value) return null;
  const short = value.match(/^(\d{2})-(\d{2})$/);
  if (short) return { month: Number(short[1]), day: Number(short[2]) };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function birthdayFallsOn(value, date) {
  const bd = parseBirthday(value);
  if (!bd) return false;
  return bd.month === date.getMonth() + 1 && bd.day === date.getDate();
}

function eventFallsOn(eventDateValue, date) {
  const d = parseEventDate(eventDateValue);
  if (!d) return false;
  return (
    d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
  );
}

function buildCalendarGrid(year, month) {
  const firstOfMonth = new Date(year, month - 1, 1);
  const startOffset = firstOfMonth.getDay();
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i);
    days.push(d);
  }
  return days;
}

function findDuplicateEvent(events, title, dateStr, excludeId = null) {
  const normalizedTitle = title.trim().toLowerCase();
  if (!normalizedTitle || !dateStr) return null;
  return (
    events.find((ev) => {
      if (excludeId != null && ev[COL.event.id] === excludeId) return false;
      const evTitle = (ev[COL.event.title] ?? "").trim().toLowerCase();
      if (evTitle !== normalizedTitle) return false;
      const evDate = parseEventDate(ev[COL.event.date]);
      if (!evDate) return false;
      return (
        evDate.getFullYear() === parseLocalDate(dateStr).getFullYear() &&
        evDate.getMonth() === parseLocalDate(dateStr).getMonth() &&
        evDate.getDate() === parseLocalDate(dateStr).getDate()
      );
    }) ?? null
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function findConflicts(schedules, dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dayOfWeek = parseLocalDate(dateStr).getDay();
  const minutes = timeToMinutes(timeStr);
  return schedules.filter((s) => {
    if (Number(s[COL.schedule.day]) !== dayOfWeek) return false;
    return (
      minutes >= timeToMinutes(s[COL.schedule.start]) &&
      minutes < timeToMinutes(s[COL.schedule.end])
    );
  });
}

/** "HH:MM" -> "HH:MM:00" for Postgres TIME columns */
function toPostgresTime(hhmm) {
  if (!hhmm) return null;
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

function TierBadge({ tier }) {
  const isCore = tier === "core";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        isCore
          ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
          : "bg-slate-100 text-slate-600 ring-slate-500/20"
      }`}
    >
      {isCore ? <ShieldCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
      {isCore ? "Core member" : "Volunteer"}
    </span>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-300"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 text-red-700 dark:text-red-300">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-slate-900 px-3 py-1.5 font-medium text-red-700 dark:text-red-300 ring-1 ring-red-200 hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

function VolunteerCard({ volunteer, onOpen }) {
  const name = volunteer[COL.volunteer.name];
  const email = volunteer[COL.volunteer.email];
  const tier = volunteer[COL.volunteer.tier];
  const program = volunteer[COL.volunteer.yearCourse];
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onOpen(volunteer[COL.volunteer.id])}
      className="group flex w-full items-start gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left shadow-sm dark:shadow-black/20 transition hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          tier === "core"
            ? "bg-indigo-600 text-white"
            : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
        }`}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{name}</p>
        {program && (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{program}</p>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500 dark:text-slate-400">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{email}</span>
        </p>
        <div className="mt-2">
          <TierBadge tier={tier} />
        </div>
      </div>
    </button>
  );
}

function DirectoryView({ onSelect, isAdmin }) {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [showAvailability, setShowAvailability] = useState(false);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("volunteers")
      .select(
        `${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.email}, ${COL.volunteer.tier}, ${COL.volunteer.yearCourse}`
      )
      .order(COL.volunteer.name, { ascending: true });
    if (error) setError(error.message);
    else setVolunteers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { core, regular, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? volunteers.filter(
          (v) =>
            v[COL.volunteer.name]?.toLowerCase().includes(q) ||
            v[COL.volunteer.email]?.toLowerCase().includes(q) ||
            v[COL.volunteer.yearCourse]?.toLowerCase().includes(q)
        )
      : volunteers;
    return {
      core: filtered.filter((v) => v[COL.volunteer.tier] === "core"),
      regular: filtered.filter((v) => v[COL.volunteer.tier] !== "core"),
      total: filtered.length,
    };
  }, [volunteers, query]);

  const Section = ({ title, icon: Icon, items }) =>
    items.length > 0 && (
      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          {title}
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {items.length}
          </span>
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <VolunteerCard key={v[COL.volunteer.id]} volunteer={v} onOpen={onSelect} />
          ))}
        </div>
      </section>
    );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Volunteer directory</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Select a person to see their event history and check when they're free.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddVolunteer(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Add volunteer
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAvailability(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
          >
            <UserCheck className="h-4 w-4" />
            Who's available?
          </button>
          <label className="relative block sm:w-72">
            <span className="sr-only">Search volunteers</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, or program"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBanner message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        !error && (
          <>
            <Section title="Core members" icon={ShieldCheck} items={core} />
            <Section title="Volunteers" icon={Users} items={regular} />
            {total === 0 && (
              <div className="mt-12 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {query
                  ? `No one matches "${query}". Try a different name or email.`
                  : "No volunteers yet. Add rows to the volunteers table in Supabase and they'll show up here."}
              </div>
            )}
          </>
        )
      )}

      {showAvailability && <AvailabilityOverviewModal onClose={() => setShowAvailability(false)} />}

      {isAdmin && showAddVolunteer && (
        <VolunteerFormModal
          mode="create"
          onClose={() => setShowAddVolunteer(false)}
          onSaved={() => {
            setShowAddVolunteer(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function VolunteerFormModal({ mode, volunteer, onClose, onSaved, onDeleted }) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(volunteer?.[COL.volunteer.name] ?? "");
  const [email, setEmail] = useState(volunteer?.[COL.volunteer.email] ?? "");
  const [tier, setTier] = useState(volunteer?.[COL.volunteer.tier] ?? "volunteer");
  const [yearCourse, setYearCourse] = useState(volunteer?.[COL.volunteer.yearCourse] ?? "");
  const [contact, setContact] = useState(volunteer?.[COL.volunteer.contact] ?? "");
  const [birthday, setBirthday] = useState(volunteer?.[COL.volunteer.birthday] ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    const payload = {
      [COL.volunteer.name]: name.trim(),
      [COL.volunteer.email]: email.trim(),
      [COL.volunteer.tier]: tier,
      [COL.volunteer.yearCourse]: yearCourse.trim() || null,
      [COL.volunteer.contact]: contact.trim() || null,
      [COL.volunteer.birthday]: birthday.trim() || null,
    };
    const query = isEdit
      ? supabase.from("volunteers").update(payload).eq(COL.volunteer.id, volunteer[COL.volunteer.id])
      : supabase.from("volunteers").insert(payload);
    const { error: saveErr } = await query;
    setSaving(false);
    if (saveErr) {
      setError(
        saveErr.message.includes("duplicate") || saveErr.message.includes("unique")
          ? "A volunteer with that email already exists."
          : saveErr.message
      );
      return;
    }
    onSaved();
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Remove ${volunteer[COL.volunteer.name]} from the system? This also deletes their attendance history and class schedule. This can't be undone.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase
      .from("volunteers")
      .delete()
      .eq(COL.volunteer.id, volunteer[COL.volunteer.id]);
    setDeleting(false);
    if (delErr) {
      setError(
        delErr.message.includes("violates foreign key")
          ? "Can't delete — this volunteer still has linked records that aren't set to cascade delete."
          : delErr.message
      );
      return;
    }
    onDeleted(volunteer[COL.volunteer.id]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? "Edit volunteer" : "Add volunteer"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Ana Cruz" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="e.g. ana@addu.edu.ph" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Tier</span>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className={inputClass}>
              <option value="volunteer">Volunteer</option>
              <option value="core">Core member</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Program & year</span>
            <input value={yearCourse} onChange={(e) => setYearCourse(e.target.value)} className={inputClass} placeholder="e.g. AB Psychology 3rd yr" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Contact number <span className="text-slate-400 dark:text-slate-500">(optional)</span>
            </span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} placeholder="e.g. 09171234567" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Birthday <span className="text-slate-400 dark:text-slate-500">(optional)</span>
            </span>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className={inputClass}
            />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? "Saving…" : isEdit ? "Save changes" : "Add volunteer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function HistoryList({ history }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        No events attended yet.
      </div>
    );
  }
  return (
    <ol className="relative space-y-4 border-l border-slate-200 dark:border-slate-800 pl-6">
      {history.map((row) => {
        const ev = row.events;
        const date = parseEventDate(ev?.[COL.event.date]);
        const hasTime = date && !/^\d{4}-\d{2}-\d{2}$/.test(ev[COL.event.date]);
        return (
          <li key={row.id} className="relative">
            <span className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{ev?.[COL.event.title] ?? "Untitled event"}</p>
                {row.role_assigned && (
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-400/30">
                    {row.role_assigned}
                  </span>
                )}
              </div>
              {date && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {date.toLocaleDateString(undefined, {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {hasTime && (
                    <>
                      <Clock className="ml-2 h-3.5 w-3.5" />
                      {formatEventTimeRange(ev[COL.event.date], ev[COL.event.endDate])}
                    </>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

function roundToHalfHour(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const roundedM = m < 30 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${roundedM}`;
}

function AddAttendanceModal({ volunteerId, existingHistory, onClose, onSaved }) {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [mode, setMode] = useState("existing");
  const [eventId, setEventId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(todayLocalISO);
  const [newTime, setNewTime] = useState(nowLocalHHMM);
  const [newEndTime, setNewEndTime] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    supabase
      .from("events")
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate}`)
      .order(COL.event.date, { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setEvents(data ?? []);
        setEventsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const finalRole = role === "Other" ? customRole.trim() : role;
    if (!finalRole) { setError("Pick or type a role."); return; }
    setSaving(true);
    try {
      let finalEventId = eventId;
      if (mode === "new") {
        if (!newTitle.trim() || !newDate || !newTime) {
          setError("Event title, date, and time are all required.");
          setSaving(false);
          return;
        }
        const duplicate = findDuplicateEvent(events, newTitle, newDate);
        if (duplicate) {
          setError(`"${duplicate[COL.event.title]}" is already on the calendar for that day.`);
          setSaving(false);
          return;
        }
        const combinedStart = combineLocalDateTime(newDate, newTime);
        const combinedEnd = newEndTime ? combineLocalDateTime(newDate, newEndTime) : null;
        const { data: created, error: evErr } = await supabase
          .from("events")
          .insert({
            [COL.event.title]: newTitle.trim(),
            [COL.event.date]: combinedStart.toISOString(),
            [COL.event.endDate]: combinedEnd ? combinedEnd.toISOString() : null,
            [COL.event.endTime]: toPostgresTime(newEndTime) || null,
          })
          .select(COL.event.id)
          .single();
        if (evErr) throw evErr;
        finalEventId = created[COL.event.id];
      } else if (!finalEventId) {
        setError("Pick an event.");
        setSaving(false);
        return;
      }
      const alreadyLogged = (existingHistory ?? []).some(
        (row) => row.events?.[COL.event.id] === finalEventId
      );
      if (alreadyLogged) {
        setError("This volunteer is already logged as attending that event.");
        setSaving(false);
        return;
      }
      const { error: attErr } = await supabase.from("event_attendees").insert({
        [COL.attendee.volunteerId]: volunteerId,
        [COL.attendee.eventId]: finalEventId,
        [COL.attendee.role]: finalRole,
      });
      if (attErr) throw attErr;
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add attendance</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setMode("existing")} className={`rounded-lg border px-3 py-1.5 font-medium transition ${mode === "existing" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              Event in the school calendar
            </button>
            <button type="button" onClick={() => setMode("new")} className={`rounded-lg border px-3 py-1.5 font-medium transition ${mode === "new" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              New event
            </button>
          </div>
          {mode === "existing" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Event</span>
              {eventsLoading ? (
                <Skeleton className="h-10" />
              ) : (
                <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
                  <option value="">Select an event…</option>
                  {events.map((ev) => (
                    <option key={ev[COL.event.id]} value={ev[COL.event.id]}>
                      {ev[COL.event.title]}
                      {ev[COL.event.date]
                        ? ` — ${parseEventDate(ev[COL.event.date])?.toLocaleDateString()}, ${formatEventTimeRange(ev[COL.event.date], ev[COL.event.endDate])}`
                        : ""}
                    </option>
                  ))}
                </select>
              )}
              {!eventsLoading && events.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">No events yet — switch to "New event" to create one.</p>
              )}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Event title</span>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Beach Cleanup" className={inputClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</span>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
                </label>
                <div />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Start time</span>
                  <select value={newTime} onChange={(e) => setNewTime(e.target.value)} className={inputClass}>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    End time <span className="text-slate-400 dark:text-slate-500">(optional)</span>
                  </span>
                  <select value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} className={inputClass}>
                    <option value="">No end time</option>
                    {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
                  </select>
                </label>
              </div>
            </>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              <option value="">Select a role…</option>
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {role === "Other" && (
              <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Type the role" className={`${inputClass} mt-2`} />
            )}
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function splitDateTime(value) {
  const d = parseEventDate(value);
  if (!d) return { date: todayLocalISO(), time: nowLocalHHMM() };
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function EventRow({ event, allEvents, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const initial = splitDateTime(event[COL.event.date]);
  const initialEnd = event[COL.event.endDate] ? splitDateTime(event[COL.event.endDate]).time : "";
  const [title, setTitle] = useState(event[COL.event.title] ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [endTime, setEndTime] = useState(initialEnd);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  const handleSave = async () => {
    setError(null);
    if (!title.trim() || !date || !time) { setError("Title, date, and time are all required."); return; }
    const duplicate = findDuplicateEvent(allEvents, title, date, event[COL.event.id]);
    if (duplicate) { setError(`"${duplicate[COL.event.title]}" is already on the calendar for that day.`); return; }
    setSaving(true);
    const combinedStart = combineLocalDateTime(date, time);
    const combinedEnd = endTime ? combineLocalDateTime(date, endTime) : null;
    const { data, error: updErr } = await supabase
      .from("events")
      .update({
        [COL.event.title]: title.trim(),
        [COL.event.date]: combinedStart.toISOString(),
        [COL.event.endDate]: combinedEnd ? combinedEnd.toISOString() : null,
        [COL.event.endTime]: toPostgresTime(endTime) || null,
      })
      .eq(COL.event.id, event[COL.event.id])
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate}`)
      .single();
    setSaving(false);
    if (updErr) { setError(updErr.message); return; }
    onSaved(data);
    setEditing(false);
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete "${event[COL.event.title]}"? This also removes any attendance records logged for this event.`);
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from("events").delete().eq(COL.event.id, event[COL.event.id]);
    setDeleting(false);
    if (delErr) {
      setError(delErr.message.includes("violates foreign key") ? "Can't delete — volunteers are still logged as having attended this event." : delErr.message);
      return;
    }
    onDeleted(event[COL.event.id]);
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Event title" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass}>
            <option value="">No end time</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </select>
        </div>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={() => { setEditing(false); setError(null); setTitle(event[COL.event.title] ?? ""); setDate(initial.date); setTime(initial.time); setEndTime(initialEnd); }} className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900 dark:text-slate-100">{event[COL.event.title]}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {parseEventDate(event[COL.event.date])?.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          {", "}
          {formatEventTimeRange(event[COL.event.date], event[COL.event.endDate])}
        </p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label={`Edit ${event[COL.event.title]}`}>
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-md p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50" aria-label={`Delete ${event[COL.event.title]}`}>
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}

function EventsManagerModal({ onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(todayLocalISO);
  const [newTime, setNewTime] = useState(nowLocalHHMM);
  const [newEndTime, setNewEndTime] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("events")
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate}`)
      .order(COL.event.date, { ascending: false });
    if (error) setError(error.message);
    else setEvents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e[COL.event.title]?.toLowerCase().includes(q));
  }, [events, query]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    setAddError(null);
    if (!newTitle.trim() || !newDate || !newTime) { setAddError("Title, date, and time are all required."); return; }
    const duplicate = findDuplicateEvent(events, newTitle, newDate);
    if (duplicate) { setAddError(`"${duplicate[COL.event.title]}" is already on the calendar for that day.`); return; }
    setAdding(true);
    const combinedStart = combineLocalDateTime(newDate, newTime);
    const combinedEnd = newEndTime ? combineLocalDateTime(newDate, newEndTime) : null;
    const { data, error: insErr } = await supabase
      .from("events")
      .insert({
        [COL.event.title]: newTitle.trim(),
        [COL.event.date]: combinedStart.toISOString(),
        [COL.event.endDate]: combinedEnd ? combinedEnd.toISOString() : null,
        [COL.event.endTime]: toPostgresTime(newEndTime) || null,
      })
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate}`)
      .single();
    setAdding(false);
    if (insErr) { setAddError(insErr.message); return; }
    setEvents((prev) => [data, ...prev]);
    setNewTitle("");
    setNewDate(todayLocalISO());
    setNewTime(nowLocalHHMM());
    setNewEndTime("");
    setShowAddForm(false);
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manage events</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {showAddForm ? (
          <form onSubmit={handleAddEvent} className="mb-4 shrink-0 space-y-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 p-3">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Event title (e.g. Beach Cleanup)" className={inputClass} autoFocus />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
              <div />
              <select value={newTime} onChange={(e) => setNewTime(e.target.value)} className={inputClass}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
              <select value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} className={inputClass}>
                <option value="">No end time</option>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </div>
            {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button type="submit" disabled={adding} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add event
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowAddForm(true)} className="mb-4 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100">
            <Plus className="h-4 w-4" />
            Add event
          </button>
        )}
        <label className="relative mb-3 block shrink-0">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </label>
        {error && <div className="mb-3 shrink-0"><ErrorBanner message={error} onRetry={load} /></div>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {query ? `No events match "${query}".` : "No events yet."}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((ev) => (
                <EventRow
                  key={ev[COL.event.id]}
                  event={ev}
                  allEvents={events}
                  onSaved={(updated) => setEvents((prev) => prev.map((e) => (e[COL.event.id] === updated[COL.event.id] ? updated : e)))}
                  onDeleted={(id) => setEvents((prev) => prev.filter((e) => e[COL.event.id] !== id))}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Class Schedule Manager — admin-only add/edit/delete of weekly class blocks */
/* -------------------------------------------------------------------------- */

function ClassScheduleManager({ volunteerId, schedules, onChanged }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // schedule row being edited, or null
  const [course, setCourse] = useState("");
  const [day, setDay] = useState("1");
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("08:00");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  const openAdd = () => {
    setEditing(null);
    setCourse(""); setDay("1"); setStart("07:00"); setEnd("08:00");
    setError(null);
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setCourse(s[COL.schedule.course] ?? "");
    setDay(String(s[COL.schedule.day]));
    setStart(s[COL.schedule.start]?.slice(0, 5) ?? "07:00");
    setEnd(s[COL.schedule.end]?.slice(0, 5) ?? "08:00");
    setError(null);
    setShowForm(true);
  };

  const handleCancel = () => { setShowForm(false); setEditing(null); setError(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!course.trim()) { setError("Course name is required."); return; }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const payload = {
      [COL.schedule.volunteerId]: volunteerId,
      [COL.schedule.course]: course.trim(),
      [COL.schedule.day]: Number(day),
      [COL.schedule.start]: `${start}:00`,
      [COL.schedule.end]: `${end}:00`,
    };
    const query = editing
      ? supabase.from("class_schedules").update(payload).eq(COL.schedule.id, editing[COL.schedule.id])
      : supabase.from("class_schedules").insert(payload);
    const { error: saveErr } = await query;
    setSaving(false);
    if (saveErr) { setError(saveErr.message); return; }
    setShowForm(false);
    setEditing(null);
    onChanged();
  };

  const handleDelete = async (s) => {
    const confirmed = window.confirm(`Remove "${s[COL.schedule.course]}" (${WEEKDAYS[s[COL.schedule.day]]})? This can't be undone.`);
    if (!confirmed) return;
    setDeletingId(s[COL.schedule.id]);
    const { error: delErr } = await supabase.from("class_schedules").delete().eq(COL.schedule.id, s[COL.schedule.id]);
    setDeletingId(null);
    if (delErr) { setError(delErr.message); return; }
    onChanged();
  };

  // Group schedules by day for display
  const byDay = useMemo(() => {
    const grouped = {};
    for (const s of schedules) {
      const d = Number(s[COL.schedule.day]);
      (grouped[d] ??= []).push(s);
    }
    return grouped;
  }, [schedules]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <BookOpen className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          Class schedule
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {schedules.length}
          </span>
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add block
          </button>
        )}
      </div>

      {/* Inline add/edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 space-y-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 p-4"
        >
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {editing ? "Edit class block" : "New class block"}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Course name</span>
            <input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Introduction to Psychology"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Day of week</span>
            <select value={day} onChange={(e) => setDay(e.target.value)} className={inputClass}>
              {WEEKDAYS.map((w, i) => (
                <option key={i} value={i}>{w}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Start time</span>
              <select value={start} onChange={(e) => setStart(e.target.value)} className={inputClass}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">End time</span>
              <select value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass}>
                {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
              </select>
            </label>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Add block"}
            </button>
          </div>
        </form>
      )}

      {/* Schedule list grouped by day */}
      {schedules.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No class blocks yet. Add one to start tracking availability.
        </div>
      ) : (
        <div className="space-y-3">
          {[0,1,2,3,4,5,6].filter((d) => byDay[d]?.length).map((d) => (
            <div key={d}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {WEEKDAYS[d]}
              </p>
              <ul className="space-y-1.5">
                {byDay[d].map((s) => (
                  <li
                    key={s[COL.schedule.id]}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {s[COL.schedule.course]}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatTime(s[COL.schedule.start])} – {formatTime(s[COL.schedule.end])}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded-md p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        aria-label={`Edit ${s[COL.schedule.course]}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s)}
                        disabled={deletingId === s[COL.schedule.id]}
                        className="rounded-md p-1.5 text-slate-400 dark:text-slate-500 hover:bg-red-50 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                        aria-label={`Delete ${s[COL.schedule.course]}`}
                      >
                        {deletingId === s[COL.schedule.id]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AvailabilitySandbox({ schedules }) {
  const [date, setDate] = useState(todayLocalISO);
  const [time, setTime] = useState(() => roundToHalfHour(nowLocalHHMM()));
  const conflicts = useMemo(() => findConflicts(schedules, date, time), [schedules, date, time]);
  const ready = conflicts !== null;
  const dayName = date ? WEEKDAYS[parseLocalDate(date).getDay()] : null;

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Date
          </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Time
          </span>
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-5" aria-live="polite">
        {!ready ? (
          <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center text-sm text-slate-500 dark:text-slate-400">
            Pick a date and time to check availability.
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-emerald-900 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Available</p>
              <p className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-300">No classes on {dayName} at {formatTime(time)}.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div key={c[COL.schedule.id]} className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-amber-900 dark:text-amber-300">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">In class: {c[COL.schedule.course]} ({formatTime(c[COL.schedule.start])} – {formatTime(c[COL.schedule.end])})</p>
                  <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">Recurring every {dayName}.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        {schedules.length === 0
          ? "This volunteer has no class blocks on file, so they'll show as available."
          : `Checked against ${schedules.length} weekly class ${schedules.length === 1 ? "block" : "blocks"}.`}
      </p>
    </div>
  );
}

function AvailabilityOverviewModal({ onClose }) {
  const [volunteers, setVolunteers] = useState([]);
  const [schedulesByVolunteer, setSchedulesByVolunteer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(todayLocalISO);
  const [time, setTime] = useState(() => roundToHalfHour(nowLocalHHMM()));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [volRes, schedRes] = await Promise.all([
      supabase.from("volunteers").select(`${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.tier}`).order(COL.volunteer.name, { ascending: true }),
      supabase.from("class_schedules").select(`${COL.schedule.id}, ${COL.schedule.volunteerId}, ${COL.schedule.course}, ${COL.schedule.day}, ${COL.schedule.start}, ${COL.schedule.end}`),
    ]);
    if (volRes.error || schedRes.error) {
      setError((volRes.error || schedRes.error).message);
      setLoading(false);
      return;
    }
    const grouped = {};
    for (const s of schedRes.data ?? []) {
      const vid = s[COL.schedule.volunteerId];
      (grouped[vid] ??= []).push(s);
    }
    setVolunteers(volRes.data ?? []);
    setSchedulesByVolunteer(grouped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dayName = date ? WEEKDAYS[parseLocalDate(date).getDay()] : null;

  const { available, inClass } = useMemo(() => {
    const available = [];
    const inClass = [];
    for (const v of volunteers) {
      const schedules = schedulesByVolunteer[v[COL.volunteer.id]] ?? [];
      const conflicts = findConflicts(schedules, date, time) ?? [];
      if (conflicts.length === 0) available.push(v);
      else inClass.push({ volunteer: v, conflicts });
    }
    return { available, inClass };
  }, [volunteers, schedulesByVolunteer, date, time]);

  const inputClass =
    "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Who's available?</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-5 grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300"><CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300"><Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" /> Time</span>
            <select value={time} onChange={(e) => setTime(e.target.value)} className={inputClass}>
              {TIME_OPTIONS.map((t) => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="mb-3 shrink-0"><ErrorBanner message={error} onRetry={load} /></div>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : !error && volunteers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">No volunteers yet.</div>
          ) : (
            !error && (
              <div className="space-y-6">
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Available
                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20 dark:ring-emerald-400/30">{available.length}</span>
                  </h4>
                  {available.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No one is free on {dayName} at {formatTime(time)}.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {available.map((v) => (
                        <li key={v[COL.volunteer.id]} className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-1.5 text-sm text-emerald-900 dark:text-emerald-300">
                          <TierBadge tier={v[COL.volunteer.tier]} />
                          <span className="truncate">{v[COL.volunteer.name]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <BookOpen className="h-4 w-4" />
                    In class
                    <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20 dark:ring-amber-400/30">{inClass.length}</span>
                  </h4>
                  {inClass.length === 0 ? (
                    <p className="text-sm text-slate-400 dark:text-slate-500">No one has class on {dayName} at {formatTime(time)}.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {inClass.map(({ volunteer, conflicts }) => (
                        <li key={volunteer[COL.volunteer.id]} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 px-3 py-1.5 text-sm text-amber-900 dark:text-amber-300">
                          <span className="truncate font-medium">{volunteer[COL.volunteer.name]}</span>
                          <span className="text-xs text-amber-700 dark:text-amber-300">{conflicts.map((c) => c[COL.schedule.course]).join(", ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileView({ volunteerId, onBack, isAdmin, onVolunteerDeleted }) {
  const [state, setState] = useState({ loading: true, error: null, volunteer: null, history: [], schedules: [] });
  const [attempt, setAttempt] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditVolunteer, setShowEditVolunteer] = useState(false);
  const [scheduleKey, setScheduleKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      const [volRes, historyRes, scheduleRes] = await Promise.all([
        supabase.from("volunteers").select(`${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.email}, ${COL.volunteer.tier}, ${COL.volunteer.yearCourse}, ${COL.volunteer.contact}`).eq(COL.volunteer.id, volunteerId).single(),
        supabase.from("event_attendees").select(`id, role_assigned, events ( ${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate} )`).eq("volunteer_id", volunteerId),
        supabase.from("class_schedules").select(`${COL.schedule.id}, ${COL.schedule.course}, ${COL.schedule.day}, ${COL.schedule.start}, ${COL.schedule.end}`).eq(COL.schedule.volunteerId, volunteerId),
      ]);
      if (cancelled) return;
      const err = volRes.error || historyRes.error || scheduleRes.error;
      if (err) { setState({ loading: false, error: err.message, volunteer: null, history: [], schedules: [] }); return; }
      const history = (historyRes.data ?? [])
        .filter((r) => r.events)
        .sort((a, b) => (parseEventDate(a.events[COL.event.date])?.getTime() ?? 0) - (parseEventDate(b.events[COL.event.date])?.getTime() ?? 0));
      setState({ loading: false, error: null, volunteer: volRes.data, history, schedules: scheduleRes.data ?? [] });
    })();
    return () => { cancelled = true; };
  }, [volunteerId, attempt]);

  const { loading, error, volunteer, history, schedules } = state;

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </button>
      {error && <div className="mt-6"><ErrorBanner message={error} onRetry={() => setAttempt((n) => n + 1)} /></div>}
      {loading && (
        <div className="mt-6 space-y-6">
          <Skeleton className="h-16 w-1/2" />
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            <Skeleton className="h-64" />
          </div>
        </div>
      )}
      {!loading && volunteer && (
        <>
          <header className="mt-6 border-b border-slate-200 dark:border-slate-800 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{volunteer[COL.volunteer.name]}</h1>
                  <TierBadge tier={volunteer[COL.volunteer.tier]} />
                </div>
                {volunteer[COL.volunteer.yearCourse] && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{volunteer[COL.volunteer.yearCourse]}</p>}
                <a href={`mailto:${volunteer[COL.volunteer.email]}`} className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600">
                  <Mail className="h-4 w-4" />
                  {volunteer[COL.volunteer.email]}
                </a>
                {volunteer[COL.volunteer.contact] && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{volunteer[COL.volunteer.contact]}</p>}
              </div>
              {isAdmin && (
                <button type="button" onClick={() => setShowEditVolunteer(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit volunteer
                </button>
              )}
            </div>
          </header>
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 xl:grid-cols-3">
            <section>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  <History className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                  Event history
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{history.length}</span>
                </h2>
                {isAdmin && (
                  <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <Plus className="h-3.5 w-3.5" />
                    Add attendance
                  </button>
                )}
              </div>
              <HistoryList history={history} />
            </section>
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                <CalendarClock className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                Availability checker
              </h2>
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Choose a date and time to see if a class gets in the way.</p>
              <AvailabilitySandbox schedules={schedules} />
            </section>
            {isAdmin && (
              <section>
                <ClassScheduleManager
                  key={scheduleKey}
                  volunteerId={volunteerId}
                  schedules={schedules}
                  onChanged={() => setAttempt((n) => n + 1)}
                />
              </section>
            )}
          </div>
        </>
      )}
      {isAdmin && showAddModal && (
        <AddAttendanceModal volunteerId={volunteerId} existingHistory={history} onClose={() => setShowAddModal(false)} onSaved={() => setAttempt((n) => n + 1)} />
      )}
      {isAdmin && showEditVolunteer && volunteer && (
        <VolunteerFormModal
          mode="edit"
          volunteer={volunteer}
          onClose={() => setShowEditVolunteer(false)}
          onSaved={() => { setShowEditVolunteer(false); setAttempt((n) => n + 1); }}
          onDeleted={(id) => { setShowEditVolunteer(false); onVolunteerDeleted?.(id); }}
        />
      )}
    </div>
  );
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function CalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [evRes, volRes] = await Promise.all([
      supabase.from("events").select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endDate}`).order(COL.event.date, { ascending: true }),
      supabase.from("volunteers").select(`${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.tier}, ${COL.volunteer.birthday}`).order(COL.volunteer.name, { ascending: true }),
    ]);
    if (evRes.error || volRes.error) setError((evRes.error || volRes.error).message);
    else { setEvents(evRes.data ?? []); setVolunteers(volRes.data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); setSelected(null); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); setSelected(null); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); setSelected(null); };

  const grid = useMemo(() => buildCalendarGrid(year, month), [year, month]);

  const dayData = useMemo(() => {
    return grid.map((date) => ({
      date,
      events: events.filter((ev) => eventFallsOn(ev[COL.event.date], date)),
      birthdays: volunteers.filter((v) => birthdayFallsOn(v[COL.volunteer.birthday], date)),
    }));
  }, [grid, events, volunteers]);

  const selectedData = useMemo(() => {
    if (!selected) return null;
    return dayData.find((d) => d.date.getFullYear() === selected.getFullYear() && d.date.getMonth() === selected.getMonth() && d.date.getDate() === selected.getDate());
  }, [selected, dayData]);

  const upcoming = useMemo(() => {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    return events.filter((ev) => { const d = parseEventDate(ev[COL.event.date]); return d && d >= today && d <= cutoff; }).slice(0, 5);
  }, [events]);

  const upcomingBirthdays = useMemo(() => {
    const results = [];
    const todayMD = (today.getMonth() + 1) * 100 + today.getDate();
    for (const v of volunteers) {
      const bd = parseBirthday(v[COL.volunteer.birthday]);
      if (!bd) continue;
      const bdMD = bd.month * 100 + bd.day;
      const diff = bdMD >= todayMD ? bdMD - todayMD : 10000 - todayMD + bdMD;
      if (diff <= 30) results.push({ volunteer: v, month: bd.month, day: bd.day, diff });
    }
    return results.sort((a, b) => a.diff - b.diff);
  }, [volunteers]);

  const isCurrentMonth = (date) => date.getMonth() + 1 === month && date.getFullYear() === year;
  const isToday = (date) => date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Calendar of activities</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Events and volunteer birthdays at a glance.</p>
        </div>
        <button type="button" onClick={goToday} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          Today
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_300px]">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <button onClick={prevMonth} aria-label="Previous month" className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{MONTH_NAMES[month - 1]} {year}</h2>
            <button onClick={nextMonth} aria-label="Next month" className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-slate-400 dark:text-slate-500">{d}</div>
            ))}
          </div>
          {loading ? (
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }).map((_, i) => (
                <div key={i} className="h-20 border-b border-r border-slate-100 dark:border-slate-800 p-1 last:border-r-0">
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {dayData.map(({ date, events: dayEvs, birthdays }, i) => {
                const inMonth = isCurrentMonth(date);
                const todayCell = isToday(date);
                const isSelected = selected && selected.getFullYear() === date.getFullYear() && selected.getMonth() === date.getMonth() && selected.getDate() === date.getDate();
                const hasContent = dayEvs.length > 0 || birthdays.length > 0;
                const isLastRow = i >= 35;
                const isLastCol = (i + 1) % 7 === 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : date)}
                    className={["relative min-h-[5rem] w-full p-1.5 text-left transition-colors", !isLastRow && "border-b", !isLastCol && "border-r", "border-slate-100 dark:border-slate-800", isSelected ? "bg-indigo-50 dark:bg-indigo-950/40" : hasContent ? "hover:bg-slate-50 dark:hover:bg-slate-800/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30", "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"].join(" ")}
                    aria-label={`${date.toDateString()}${dayEvs.length ? `, ${dayEvs.length} event(s)` : ""}${birthdays.length ? `, ${birthdays.length} birthday(s)` : ""}`}
                  >
                    <span className={["flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", todayCell ? "bg-indigo-600 text-white" : inMonth ? "text-slate-800 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"].join(" ")}>
                      {date.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvs.slice(0, 2).map((ev) => (
                        <div key={ev[COL.event.id]} className="truncate rounded bg-indigo-100 dark:bg-indigo-900/60 px-1 py-0.5 text-[10px] font-medium leading-tight text-indigo-700 dark:text-indigo-300" title={ev[COL.event.title]}>
                          {ev[COL.event.title]}
                        </div>
                      ))}
                      {dayEvs.length > 2 && <div className="px-1 text-[10px] text-slate-400 dark:text-slate-500">+{dayEvs.length - 2} more</div>}
                    </div>
                    {birthdays.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-0.5 px-0.5">
                        {birthdays.slice(0, 3).map((v) => (
                          <span key={v[COL.volunteer.id]} className="inline-flex items-center gap-0.5 rounded bg-rose-100 dark:bg-rose-900/50 px-1 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300" title={`🎂 ${v[COL.volunteer.name]}`}>
                            🎂
                            <span className="hidden sm:inline truncate max-w-[7rem]">{v[COL.volunteer.name]}</span>
                          </span>
                        ))}
                        {birthdays.length > 3 && <span className="text-[10px] text-rose-400">+{birthdays.length - 3}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-6">
          {selectedData && (
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                  {selectedData.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </h3>
                <button onClick={() => setSelected(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {selectedData.events.length === 0 && selectedData.birthdays.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500">Nothing scheduled.</p>
              )}
              {selectedData.events.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Events</p>
                  <ul className="space-y-2">
                    {selectedData.events.map((ev) => (
                      <li key={ev[COL.event.id]} className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2">
                        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">{ev[COL.event.title]}</p>
                        {ev[COL.event.date] && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                            <Clock className="h-3 w-3" />
                            {formatEventTimeRange(ev[COL.event.date], ev[COL.event.endDate])}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedData.birthdays.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400">Birthdays</p>
                  <ul className="space-y-1.5">
                    {selectedData.birthdays.map((v) => (
                      <li key={v[COL.volunteer.id]} className="flex items-center gap-2 rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30 px-3 py-2">
                        <Cake className="h-4 w-4 shrink-0 text-rose-500" />
                        <span className="text-sm font-medium text-rose-900 dark:text-rose-200">{v[COL.volunteer.name]}</span>
                        <TierBadge tier={v[COL.volunteer.tier]} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarDays className="h-4 w-4 text-indigo-500" />
              Upcoming events
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">next 30 days</span>
            </h3>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No events in the next 30 days.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((ev) => {
                  const d = parseEventDate(ev[COL.event.date]);
                  return (
                    <li key={ev[COL.event.id]} className="flex items-start gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                      <div className="flex shrink-0 flex-col items-center rounded-lg bg-indigo-600 px-2.5 py-1 text-white">
                        <span className="text-[10px] font-semibold uppercase leading-tight">{d?.toLocaleString(undefined, { month: "short" })}</span>
                        <span className="text-lg font-bold leading-tight">{d?.getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{ev[COL.event.title]}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {d?.toLocaleDateString(undefined, { weekday: "short" })}
                          {ev[COL.event.date] && `, ${formatEventTimeRange(ev[COL.event.date], ev[COL.event.endDate])}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Cake className="h-4 w-4 text-rose-500" />
              Upcoming birthdays
              <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-300">next 30 days</span>
            </h3>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : upcomingBirthdays.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">No birthdays in the next 30 days.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingBirthdays.map(({ volunteer, month: m, day: d, diff }) => (
                  <li key={volunteer[COL.volunteer.id]} className="flex items-center gap-3 rounded-lg border border-rose-100 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 px-3 py-2">
                    <span className="text-lg">🎂</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{volunteer[COL.volunteer.name]}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{MONTH_NAMES[m - 1]} {d}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${diff === 0 ? "bg-rose-500 text-white" : diff <= 7 ? "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                      {diff === 0 ? "Today! 🎉" : diff === 1 ? "Tomorrow" : `In ${diff} days`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("directory");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);
  const [showEventsManager, setShowEventsManager] = useState(false);
  const { session, isAdmin, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const { isDark, toggleDark } = useDarkMode();

  const handleViewChange = (v) => {
    setView(v);
    if (v !== "directory") setSelectedVolunteerId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased">
      <nav className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-indigo-600" />
              <span className="font-semibold">Volunteer tracker</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
              {[{ id: "directory", label: "Directory", Icon: Users }, { id: "calendar", label: "Calendar", Icon: CalendarDays }].map(({ id, label, Icon }) => (
                <button key={id} type="button" onClick={() => handleViewChange(id)} className={["inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", view === id ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"].join(" ")}>
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleDark} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {isAdmin && (
              <button onClick={() => setShowEventsManager(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <Calendar className="h-3.5 w-3.5" />
                Manage events
              </button>
            )}
            {authLoading ? (
              <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ) : session ? (
              <div className="flex items-center gap-2">
                {session.user?.user_metadata?.avatar_url && (
                  <img src={session.user.user_metadata.avatar_url} alt="" className="h-7 w-7 rounded-full ring-1 ring-slate-200 dark:ring-slate-700" />
                )}
                {!isAdmin && <span className="text-xs text-slate-400 dark:text-slate-500">Not an admin account</span>}
                <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <LogIn className="h-3.5 w-3.5" />
                Admin sign in
              </button>
            )}
          </div>
        </div>
        <div className="flex sm:hidden border-t border-slate-200 dark:border-slate-800">
          {[{ id: "directory", label: "Directory", Icon: Users }, { id: "calendar", label: "Calendar", Icon: CalendarDays }].map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => handleViewChange(id)} className={["flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors", view === id ? "border-b-2 border-indigo-600 text-indigo-600" : "text-slate-500 dark:text-slate-400"].join(" ")}>
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {view === "calendar" ? (
          <CalendarView />
        ) : selectedVolunteerId === null ? (
          <DirectoryView onSelect={setSelectedVolunteerId} isAdmin={isAdmin} />
        ) : (
          <ProfileView
            key={selectedVolunteerId}
            volunteerId={selectedVolunteerId}
            onBack={() => setSelectedVolunteerId(null)}
            isAdmin={isAdmin}
            onVolunteerDeleted={() => setSelectedVolunteerId(null)}
          />
        )}
      </main>
      {isAdmin && showEventsManager && <EventsManagerModal onClose={() => setShowEventsManager(false)} />}
      <Analytics />
    </div>
  );
}
