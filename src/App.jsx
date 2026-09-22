import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
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
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Supabase client                                                           */
/*  Add to .env.local:                                                        */
/*    VITE_SUPABASE_URL=https://xxxx.supabase.co                              */
/*    VITE_SUPABASE_ANON_KEY=your-anon-key                                    */
/* -------------------------------------------------------------------------- */
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

/* -------------------------------------------------------------------------- */
/*  Column mapping — edit these if your schema uses different names           */
/* -------------------------------------------------------------------------- */
const COL = {
  volunteer: { id: "id", name: "name", email: "email", tier: "membership_type" },
  event: { id: "id", title: "title", date: "event_date", endTime: "end_time" }, // event_date: timestamptz (start); end_time: time
  attendee: { id: "id", volunteerId: "volunteer_id", eventId: "event_id", role: "role_assigned" },
  schedule: {
    id: "id",
    volunteerId: "volunteer_id",
    course: "course_name",
    day: "day_of_week", // 0 = Sunday ... 6 = Saturday (matches JS Date.getDay())
    start: "start_time", // Postgres TIME, e.g. "08:30:00"
    end: "end_time",
  },
};

const ROLE_OPTIONS = ["Photographer", "Videographer", "BMD", "AVP", "Switcher", "Shadow", "Writer", "Other"];

/* -------------------------------------------------------------------------- */
/*  Time helpers                                                              */
/* -------------------------------------------------------------------------- */

/** "YYYY-MM-DD" -> local-midnight Date. Avoids the UTC-shift bug of new Date("YYYY-MM-DD"). */
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/** "14:30:00" -> "2:30 PM" */
function formatTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Today's date as "YYYY-MM-DD" in the user's local timezone. */
function todayLocalISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

/** Current local time as "HH:MM". */
function nowLocalHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

/** Event dates may be a date-only string or a full timestamp. Handle both as local time. */
function parseEventDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLocalDate(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Render an event's start (and end, if present) as a friendly string, e.g. "Sat, Aug 14 · 9:00 AM – 1:00 PM" */
function formatEventDateTime(dateValue, endTimeValue) {
  const date = parseEventDate(dateValue);
  if (!date) return "";
  const hasTime = !/^\d{4}-\d{2}-\d{2}$/.test(dateValue);
  const datePart = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!hasTime) return datePart;
  const startPart = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endPart = endTimeValue ? formatTime(endTimeValue) : null;
  return `${datePart} · ${startPart}${endPart ? ` – ${endPart}` : ""}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Returns every class block that overlaps the chosen moment.
 * Start is inclusive, end is exclusive: a class ending at 10:00 leaves you free at 10:00.
 */
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

/* -------------------------------------------------------------------------- */
/*  Small shared UI                                                           */
/* -------------------------------------------------------------------------- */

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
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
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

/* -------------------------------------------------------------------------- */
/*  View 1: Directory                                                         */
/* -------------------------------------------------------------------------- */

function VolunteerCard({ volunteer, onOpen }) {
  const name = volunteer[COL.volunteer.name];
  const email = volunteer[COL.volunteer.email];
  const tier = volunteer[COL.volunteer.tier];
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
      className="group flex w-full items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          tier === "core" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
        }`}
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">{name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500">
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

function DirectoryView({ onSelect }) {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("volunteers")
      .select(
        `${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.email}, ${COL.volunteer.tier}`
      )
      .order(COL.volunteer.name, { ascending: true });
    if (error) setError(error.message);
    else setVolunteers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { core, regular, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? volunteers.filter(
          (v) =>
            v[COL.volunteer.name]?.toLowerCase().includes(q) ||
            v[COL.volunteer.email]?.toLowerCase().includes(q)
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
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Icon className="h-4 w-4 text-slate-400" />
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Volunteer directory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Select a person to see their event history and check when they're free.
          </p>
        </div>
        <label className="relative block sm:w-72">
          <span className="sr-only">Search volunteers</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </label>
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
              <div className="mt-12 rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
                {query
                  ? `No one matches "${query}". Try a different name or email.`
                  : "No volunteers yet. Add rows to the volunteers table in Supabase and they'll show up here."}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  View 2: Profile                                                           */
/* -------------------------------------------------------------------------- */

function HistoryRow({ row, onDeleted }) {
  const ev = row.events;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Remove this attendance record${ev?.[COL.event.title] ? ` for "${ev[COL.event.title]}"` : ""}? This only removes the attendance log — the event itself stays on the calendar.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from("event_attendees").delete().eq("id", row.id);
    setDeleting(false);

    if (delErr) {
      setError(delErr.message);
      return;
    }
    onDeleted(row.id);
  };

  return (
    <li className="relative">
      <span className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-semibold text-slate-900">{ev?.[COL.event.title] ?? "Untitled event"}</p>
          <div className="flex shrink-0 items-center gap-2">
            {row.role_assigned && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                {row.role_assigned}
              </span>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
              aria-label="Remove attendance record"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        {ev?.[COL.event.date] && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatEventDateTime(ev[COL.event.date], ev[COL.event.endTime])}
          </p>
        )}
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </li>
  );
}

function HistoryList({ history, onDeleted }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No events attended yet.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {history.map((row) => (
        <HistoryRow key={row.id} row={row} onDeleted={onDeleted} />
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Add Attendance modal — logs an event + role + date/time for a volunteer   */
/* -------------------------------------------------------------------------- */

function AddAttendanceModal({ volunteerId, onClose, onSaved }) {
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [mode, setMode] = useState("existing"); // "existing" | "new"
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
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endTime}`)
      .order(COL.event.date, { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setEvents(data ?? []);
        setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const finalRole = role === "Other" ? customRole.trim() : role;
    if (!finalRole) {
      setError("Pick or type a role.");
      return;
    }

    setSaving(true);
    try {
      let finalEventId = eventId;

      if (mode === "new") {
        if (!newTitle.trim() || !newDate || !newTime) {
          setError("Event title, date, and start time are all required.");
          setSaving(false);
          return;
        }
        // Combine the date + time pickers into a single local-time ISO timestamp.
        const combined = parseLocalDate(newDate);
        const [h, m] = newTime.split(":").map(Number);
        combined.setHours(h, m, 0, 0);

        const { data: created, error: evErr } = await supabase
          .from("events")
          .insert({
            [COL.event.title]: newTitle.trim(),
            [COL.event.date]: combined.toISOString(),
            [COL.event.endTime]: newEndTime || null,
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
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Add attendance</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                mode === "existing"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Event in the school calendar
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                mode === "new"
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              New event
            </button>
          </div>

          {mode === "existing" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Event</span>
              {eventsLoading ? (
                <Skeleton className="h-10" />
              ) : (
                <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputClass}>
                  <option value="">Select an event…</option>
                  {events.map((ev) => (
                    <option key={ev[COL.event.id]} value={ev[COL.event.id]}>
                      {ev[COL.event.title]}
                      {ev[COL.event.date] ? ` — ${formatEventDateTime(ev[COL.event.date], ev[COL.event.endTime])}` : ""}
                    </option>
                  ))}
                </select>
              )}
              {!eventsLoading && events.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-400">No events yet — switch to "New event" to create one.</p>
              )}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Event title</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Beach Cleanup"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Date</span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Start time</span>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">End time</span>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            </>
          )}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              <option value="">Select a role…</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {role === "Other" && (
              <input
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Type the role"
                className={`${inputClass} mt-2`}
              />
            )}
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Manage Events modal — add, edit, or remove events from the school calendar */
/* -------------------------------------------------------------------------- */

/** Split an ISO/date-time value into separate "YYYY-MM-DD" and "HH:MM" strings for the inputs. */
function splitDateTime(value) {
  const d = parseEventDate(value);
  if (!d) return { date: todayLocalISO(), time: nowLocalHHMM() };
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function EventRow({ event, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const initial = splitDateTime(event[COL.event.date]);
  const [title, setTitle] = useState(event[COL.event.title] ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [endTime, setEndTime] = useState(event[COL.event.endTime] ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  const handleSave = async () => {
    setError(null);
    if (!title.trim() || !date || !time) {
      setError("Title, date, and start time are all required.");
      return;
    }
    setSaving(true);
    const combined = parseLocalDate(date);
    const [h, m] = time.split(":").map(Number);
    combined.setHours(h, m, 0, 0);

    const { data, error: updErr } = await supabase
      .from("events")
      .update({
        [COL.event.title]: title.trim(),
        [COL.event.date]: combined.toISOString(),
        [COL.event.endTime]: endTime || null,
      })
      .eq(COL.event.id, event[COL.event.id])
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endTime}`)
      .single();

    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    onSaved(data);
    setEditing(false);
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Delete "${event[COL.event.title]}"? This also removes any attendance records logged for this event.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from("events").delete().eq(COL.event.id, event[COL.event.id]);
    setDeleting(false);

    if (delErr) {
      // Most likely a foreign-key violation if event_attendees isn't set to cascade delete.
      setError(
        delErr.message.includes("violates foreign key")
          ? "Can't delete — volunteers are still logged as having attended this event."
          : delErr.message
      );
      return;
    }
    onDeleted(event[COL.event.id]);
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
        <div className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Event title" />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
              title="Start time"
            />
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputClass}
              title="End time"
            />
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              setTitle(event[COL.event.title] ?? "");
              setDate(initial.date);
              setTime(initial.time);
              setEndTime(event[COL.event.endTime] ?? "");
            }}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-900">{event[COL.event.title]}</p>
        <p className="text-xs text-slate-500">
          {formatEventDateTime(event[COL.event.date], event[COL.event.endTime])}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          aria-label={`Edit ${event[COL.event.title]}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
          aria-label={`Delete ${event[COL.event.title]}`}
        >
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

  // Add-event form state
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
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endTime}`)
      .order(COL.event.date, { ascending: false });
    if (error) setError(error.message);
    else setEvents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e[COL.event.title]?.toLowerCase().includes(q));
  }, [events, query]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    setAddError(null);
    if (!newTitle.trim() || !newDate || !newTime) {
      setAddError("Title, date, and start time are all required.");
      return;
    }
    setAdding(true);
    const combined = parseLocalDate(newDate);
    const [h, m] = newTime.split(":").map(Number);
    combined.setHours(h, m, 0, 0);

    const { data, error: insErr } = await supabase
      .from("events")
      .insert({
        [COL.event.title]: newTitle.trim(),
        [COL.event.date]: combined.toISOString(),
        [COL.event.endTime]: newEndTime || null,
      })
      .select(`${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endTime}`)
      .single();

    setAdding(false);
    if (insErr) {
      setAddError(insErr.message);
      return;
    }
    setEvents((prev) => [data, ...prev]);
    setNewTitle("");
    setNewDate(todayLocalISO());
    setNewTime(nowLocalHHMM());
    setNewEndTime("");
    setShowAddForm(false);
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Manage events</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toggleable add-event form */}
        {showAddForm ? (
          <form
            onSubmit={handleAddEvent}
            className="mb-4 shrink-0 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Event title (e.g. Beach Cleanup)"
              className={inputClass}
              autoFocus
            />
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className={inputClass}
                title="Start time"
                placeholder="Start time"
              />
              <input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
                className={inputClass}
                title="End time"
                placeholder="End time"
              />
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Add event
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mb-4 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            <Plus className="h-4 w-4" />
            Add a fixed event
          </button>
        )}

        <label className="relative mb-3 block shrink-0">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </label>

        {error && (
          <div className="mb-3 shrink-0">
            <ErrorBanner message={error} onRetry={load} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              {query ? `No events match "${query}".` : "No events yet."}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((ev) => (
                <EventRow
                  key={ev[COL.event.id]}
                  event={ev}
                  onSaved={(updated) =>
                    setEvents((prev) => prev.map((e) => (e[COL.event.id] === updated[COL.event.id] ? updated : e)))
                  }
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

function AvailabilitySandbox({ schedules }) {
  const [date, setDate] = useState(todayLocalISO);
  const [time, setTime] = useState(nowLocalHHMM);

  const conflicts = useMemo(() => findConflicts(schedules, date, time), [schedules, date, time]);
  const ready = conflicts !== null;
  const dayName = date ? WEEKDAYS[parseLocalDate(date).getDay()] : null;

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-400" /> Date
          </span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <Clock className="h-4 w-4 text-slate-400" /> Time
          </span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="mt-5" aria-live="polite">
        {!ready ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
            Pick a date and time to check availability.
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Available</p>
              <p className="mt-0.5 text-sm text-emerald-800">
                No classes on {dayName} at {formatTime(time)}.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div
                key={c[COL.schedule.id]}
                className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
              >
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold">
                    In class: {c[COL.schedule.course]} ({formatTime(c[COL.schedule.start])} –{" "}
                    {formatTime(c[COL.schedule.end])})
                  </p>
                  <p className="mt-0.5 text-sm text-amber-800">
                    Recurring every {dayName}.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        {schedules.length === 0
          ? "This volunteer has no class blocks on file, so they'll show as available."
          : `Checked against ${schedules.length} weekly class ${schedules.length === 1 ? "block" : "blocks"}.`}
      </p>
    </div>
  );
}

function ProfileView({ volunteerId, onBack }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    volunteer: null,
    history: [],
    schedules: [],
  });
  const [attempt, setAttempt] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      // Three independent requests, fired together so the profile loads in one round trip's time.
      const [volRes, historyRes, scheduleRes] = await Promise.all([
        supabase
          .from("volunteers")
          .select(`${COL.volunteer.id}, ${COL.volunteer.name}, ${COL.volunteer.email}, ${COL.volunteer.tier}`)
          .eq(COL.volunteer.id, volunteerId)
          .single(),
        // Joined query: attendance rows with their event embedded.
        supabase
          .from("event_attendees")
          .select(
            `id, role_assigned, events ( ${COL.event.id}, ${COL.event.title}, ${COL.event.date}, ${COL.event.endTime} )`
          )
          .eq("volunteer_id", volunteerId),
        supabase
          .from("class_schedules")
          .select(
            `${COL.schedule.id}, ${COL.schedule.course}, ${COL.schedule.day}, ${COL.schedule.start}, ${COL.schedule.end}`
          )
          .eq(COL.schedule.volunteerId, volunteerId),
      ]);

      if (cancelled) return;

      const err = volRes.error || historyRes.error || scheduleRes.error;
      if (err) {
        setState({ loading: false, error: err.message, volunteer: null, history: [], schedules: [] });
        return;
      }

      // Sort chronologically (oldest first). Flip a/b to show most recent first.
      const history = (historyRes.data ?? [])
        .filter((r) => r.events)
        .sort(
          (a, b) =>
            (parseEventDate(a.events[COL.event.date])?.getTime() ?? 0) -
            (parseEventDate(b.events[COL.event.date])?.getTime() ?? 0)
        );

      setState({
        loading: false,
        error: null,
        volunteer: volRes.data,
        history,
        schedules: scheduleRes.data ?? [],
      });
    })();

    return () => {
      cancelled = true; // ignore stale responses if the user navigates away quickly
    };
  }, [volunteerId, attempt]);

  const { loading, error, volunteer, history, schedules } = state;

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </button>

      {error && (
        <div className="mt-6">
          <ErrorBanner message={error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      )}

      {loading && (
        <div className="mt-6 space-y-6">
          <Skeleton className="h-16 w-1/2" />
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      )}

      {!loading && volunteer && (
        <>
          <header className="mt-6 border-b border-slate-200 pb-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {volunteer[COL.volunteer.name]}
              </h1>
              <TierBadge tier={volunteer[COL.volunteer.tier]} />
            </div>
            <a
              href={`mailto:${volunteer[COL.volunteer.email]}`}
              className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
            >
              <Mail className="h-4 w-4" />
              {volunteer[COL.volunteer.email]}
            </a>
          </header>

          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
            <section>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <History className="h-5 w-5 text-slate-400" />
                  Event history
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {history.length}
                  </span>
                </h2>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add attendance
                </button>
              </div>
              <HistoryList
                history={history}
                onDeleted={(attendeeId) =>
                  setState((s) => ({ ...s, history: s.history.filter((row) => row.id !== attendeeId) }))
                }
              />
            </section>

            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <CalendarClock className="h-5 w-5 text-slate-400" />
                Availability checker
              </h2>
              <p className="mb-4 text-sm text-slate-500">
                Choose a date and time to see if a class gets in the way.
              </p>
              <AvailabilitySandbox schedules={schedules} />
            </section>
          </div>
        </>
      )}

      {showAddModal && (
        <AddAttendanceModal
          volunteerId={volunteerId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => setAttempt((n) => n + 1)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  App shell                                                                 */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);
  const [showEventsManager, setShowEventsManager] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-indigo-600" />
            <span className="font-semibold">Volunteer tracker</span>
          </div>
          <button
            onClick={() => setShowEventsManager(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <Calendar className="h-3.5 w-3.5" />
            Manage events
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {selectedVolunteerId === null ? (
          <DirectoryView onSelect={setSelectedVolunteerId} />
        ) : (
          <ProfileView
            key={selectedVolunteerId}
            volunteerId={selectedVolunteerId}
            onBack={() => setSelectedVolunteerId(null)}
          />
        )}
      </main>

      {showEventsManager && <EventsManagerModal onClose={() => setShowEventsManager(false)} />}
    </div>
  );
}
