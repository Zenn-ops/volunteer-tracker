import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
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
  event: { id: "id", title: "title", date: "event_date" }, // timestamptz or date
  schedule: {
    id: "id",
    volunteerId: "volunteer_id",
    course: "course_name",
    day: "day_of_week", // 0 = Sunday ... 6 = Saturday (matches JS Date.getDay())
    start: "start_time", // Postgres TIME, e.g. "08:30:00"
    end: "end_time",
  },
};

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

function HistoryList({ history }) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No events attended yet.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6">
      {history.map((row) => {
        const ev = row.events;
        const date = parseEventDate(ev?.[COL.event.date]);
        const hasTime = date && !/^\d{4}-\d{2}-\d{2}$/.test(ev[COL.event.date]);
        return (
          <li key={row.id} className="relative">
            <span className="absolute -left-[31px] top-4 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{ev?.[COL.event.title] ?? "Untitled event"}</p>
                {row.role_assigned && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    {row.role_assigned}
                  </span>
                )}
              </div>
              {date && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
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
                      {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
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
            `id, role_assigned, events ( ${COL.event.id}, ${COL.event.title}, ${COL.event.date} )`
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
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                <History className="h-5 w-5 text-slate-400" />
                Event history
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {history.length}
                </span>
              </h2>
              <HistoryList history={history} />
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  App shell                                                                 */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [selectedVolunteerId, setSelectedVolunteerId] = useState(null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <CalendarCheck className="h-5 w-5 text-indigo-600" />
          <span className="font-semibold">Volunteer tracker</span>
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
    </div>
  );
}