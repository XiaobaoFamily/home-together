"use client";

import {
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  Droplets,
  Heart,
  Home,
  LayoutList,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  PawPrint,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Sparkles,
  Trash2,
  WashingMachine,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  type AppTask,
  type HouseholdEvent,
  type HouseholdEventType,
  type HouseholdMember,
  type HouseholdSnapshot,
  completeTaskRecord,
  createHouseholdEventRecord,
  createHousehold,
  createTaskRecord,
  deleteHouseholdEventRecord,
  deleteTaskRecord,
  joinHousehold,
  loadHouseholdSnapshot,
  subscribeToHousehold,
  undoTaskCompletion,
  updateCompletionNote,
  updateTaskRecord,
} from "@/lib/supabase/tasks";

type ViewKey = "week" | "timeline" | "tasks";
type TaskEditorMode = "all" | "recurring" | "one_off";
type HouseholdEventDraft = Pick<
  HouseholdEvent,
  "type" | "title" | "description" | "occurredAt" | "amount" | "currency"
>;

const WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function dateInChicago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function mondayWeek(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => addDays(value, mondayOffset + index));
}

const DEMO_TODAY = dateInChicago();
const DEMO_WEEK = mondayWeek(DEMO_TODAY);

type RecurrenceKind = "interval_days" | "weekly" | "monthly";

function recurrenceText(kind: RecurrenceKind, interval: number) {
  if (kind === "weekly") return interval === 1 ? "每周" : `每 ${interval} 周`;
  if (kind === "monthly") return interval === 1 ? "每月" : `每 ${interval} 月`;
  return interval === 1 ? "每天" : `每 ${interval} 天`;
}

function useOverlayScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollY = window.scrollY;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

const DEMO_MEMBERS: HouseholdMember[] = [
  { id: "nicole", displayName: "Nicole", avatarUrl: null },
  { id: "partner", displayName: "伴侣", avatarUrl: null },
];

const EVENT_TYPE_OPTIONS: Array<{
  id: HouseholdEventType;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { id: "family", label: "家庭事项", hint: "共同决定、安排和生活记录", icon: ClipboardCheck },
  { id: "environment", label: "居住环境", hint: "家具、布置和居住状态变化", icon: Home },
  { id: "finance", label: "财务事项", hint: "账单、预算和较大收支", icon: Building2 },
  { id: "maintenance", label: "维修维护", hint: "设备检修、保养和更换", icon: Wrench },
  { id: "milestone", label: "家庭里程碑", hint: "值得一起记住的重要时刻", icon: Sparkles },
];

const DEMO_EVENTS: HouseholdEvent[] = [
  {
    id: "event-demo-1",
    type: "environment",
    title: "客厅换了新的落地灯",
    description: "晚上的阅读光线舒服了很多。",
    occurredAt: `${DEMO_WEEK[1]}T20:10:00-05:00`,
    currency: "USD",
    createdBy: "nicole",
    createdByName: "Nicole",
  },
  {
    id: "event-demo-2",
    type: "finance",
    title: "缴纳本月电费",
    occurredAt: `${DEMO_WEEK[0]}T11:20:00-05:00`,
    amount: 86.42,
    currency: "USD",
    createdBy: "partner",
    createdByName: "伴侣",
  },
];

const DEMO_TASKS: AppTask[] = [
  {
    id: "demo-1",
    title: "换床单",
    category: "bedroom",
    type: "recurring",
    assignee: "共同",
    assigneeMode: "shared",
    dueDate: DEMO_TODAY,
    status: "pending",
    recurrence: "每 14 天",
    recurrenceRule: { kind: "interval_days", interval: 14 },
    lastCompleted: "8 月 1 日",
    nextDue: "今天",
    description: "床单和枕套一起更换。",
  },
  {
    id: "demo-2",
    title: "联系物业确认门禁卡",
    category: "admin",
    type: "one_off",
    oneOffTiming: "deadline",
    assignee: "Nicole",
    assigneeId: "nicole",
    assigneeMode: "member",
    dueDate: DEMO_WEEK[2],
    status: "pending",
    description: "确认补办时间和取卡地点。",
  },
  {
    id: "demo-3",
    title: "清理猫砂盆",
    category: "pet",
    type: "recurring",
    assignee: "伴侣",
    assigneeId: "partner",
    assigneeMode: "member",
    dueDate: DEMO_WEEK[4],
    status: "completed",
    recurrence: "每 3 天",
    recurrenceRule: { kind: "interval_days", interval: 3 },
    completedAt: `${DEMO_WEEK[4]}T19:40:00-05:00`,
    note: "猫砂快用完了，周末补一袋。",
    lastCompleted: "昨天",
    nextDue: "8 月 17 日",
  },
  {
    id: "demo-4",
    title: "给绿植浇水",
    category: "plants",
    type: "recurring",
    assignee: "共同",
    assigneeMode: "shared",
    dueDate: DEMO_WEEK[6],
    status: "pending",
    recurrence: "每周",
    recurrenceRule: { kind: "weekly", interval: 1 },
    lastCompleted: "8 月 9 日",
    nextDue: "明天",
  },
  {
    id: "demo-5",
    title: "清洁洗衣机滤网",
    category: "laundry",
    type: "recurring",
    assignee: "Nicole",
    assigneeId: "nicole",
    assigneeMode: "member",
    dueDate: DEMO_WEEK[0],
    status: "completed",
    recurrence: "每月",
    recurrenceRule: { kind: "monthly", interval: 1 },
    completedAt: `${DEMO_WEEK[0]}T18:15:00-05:00`,
    note: "已冲洗并晾干。",
    lastCompleted: "周一",
    nextDue: "9 月 10 日",
  },
  {
    id: "demo-6",
    title: "整理冰箱过期食材",
    category: "kitchen",
    type: "recurring",
    assignee: "共同",
    assigneeMode: "shared",
    dueDate: DEMO_WEEK[3],
    status: "completed",
    recurrence: "每周",
    recurrenceRule: { kind: "weekly", interval: 1 },
    completedAt: `${DEMO_WEEK[3]}T20:20:00-05:00`,
    note: "下周少买一盒牛奶。",
    lastCompleted: "周四",
    nextDue: "8 月 20 日",
  },
  {
    id: "demo-7",
    title: "预约年度体检",
    category: "admin",
    type: "one_off",
    oneOffTiming: "week",
    assignee: "伴侣",
    assigneeId: "partner",
    assigneeMode: "member",
    dueDate: DEMO_WEEK[0],
    status: "completed",
    completedAt: `${DEMO_WEEK[2]}T09:30:00-05:00`,
    note: "约在 9 月 3 日上午。",
  },
  {
    id: "demo-8",
    title: "更换空调滤芯",
    category: "repair",
    type: "recurring",
    assignee: "共同",
    assigneeMode: "shared",
    dueDate: addDays(DEMO_TODAY, 9),
    status: "pending",
    recurrence: "每 90 天",
    recurrenceRule: { kind: "interval_days", interval: 90 },
    lastCompleted: "5 月 26 日",
    nextDue: "8 月 24 日",
  },
  {
    id: "demo-9",
    title: "整理储物柜",
    category: "home",
    type: "one_off",
    oneOffTiming: "week",
    assignee: "共同",
    assigneeMode: "shared",
    dueDate: DEMO_WEEK[0],
    status: "pending",
    description: "这周找一个合适的时间整理即可。",
  },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  bedroom: BedDouble,
  laundry: WashingMachine,
  pet: PawPrint,
  plants: Droplets,
  admin: Building2,
  repair: Wrench,
  kitchen: Home,
  home: Sparkles,
};

const NAV_ITEMS: Array<{ id: ViewKey; label: string; icon: LucideIcon }> = [
  { id: "week", label: "本周", icon: Home },
  { id: "timeline", label: "时间轴", icon: Clock3 },
  { id: "tasks", label: "周期家务", icon: LayoutList },
];

function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function formatWeekRange(start: string) {
  return `${formatShortDate(start)} — ${formatShortDate(addDays(start, 6))}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function completionDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function taskDisplayDate(task: AppTask) {
  return task.status === "completed" && task.completedAt
    ? completionDateKey(task.completedAt)
    : task.dueDate;
}

function formatStoredMoment(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDate(value);
  return value;
}
function toDateTimeLocal(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function defaultFamilyEventTitle(value: string) {
  const [year = "", month = "", day = ""] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return "家事";
  return year + "年" + Number(month) + "月" + Number(day) + "日家事";
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

function isWeekOneOff(task: AppTask) {
  return task.type === "one_off" && task.oneOffTiming === "week";
}

function isDeadlineOneOff(task: AppTask) {
  return task.type === "one_off" && task.oneOffTiming !== "week";
}

function taskWindowEnd(task: AppTask) {
  return isWeekOneOff(task) ? addDays(task.dueDate, 6) : task.dueDate;
}

function isOverdue(task: AppTask) {
  return task.status === "pending" && taskWindowEnd(task) < DEMO_TODAY;
}

function taskStatus(task: AppTask) {
  if (task.status === "completed") return "completed";
  if (task.status === "skipped") return "skipped";
  if (isOverdue(task)) return "overdue";
  if (!isWeekOneOff(task) && task.dueDate === DEMO_TODAY) return "today";
  return "pending";
}

function taskTimingText(task: AppTask) {
  if (task.status === "completed" && task.completedAt) {
    return formatShortDate(completionDateKey(task.completedAt)) + " 完成";
  }
  if (isWeekOneOff(task)) {
    return task.dueDate === DEMO_WEEK[0] ? "本周内完成" : `${formatWeekRange(task.dueDate)} 内完成`;
  }
  if (isDeadlineOneOff(task)) {
    if (isOverdue(task)) {
      const days = Math.max(1, Math.round(
        (new Date(`${DEMO_TODAY}T12:00:00Z`).getTime() - new Date(`${task.dueDate}T12:00:00Z`).getTime()) / 86400000,
      ));
      return `已逾期 ${days} 天`;
    }
    return task.dueDate === DEMO_TODAY ? "今天截止" : `${formatShortDate(task.dueDate)} 前完成`;
  }
  if (isOverdue(task)) {
    const days = Math.max(1, Math.round(
      (new Date(`${DEMO_TODAY}T12:00:00Z`).getTime() - new Date(`${task.dueDate}T12:00:00Z`).getTime()) / 86400000,
    ));
    return `已经晚了 ${days} 天`;
  }
  return task.dueDate === DEMO_TODAY ? "今天" : formatShortDate(task.dueDate);
}

function taskStatusText(task: AppTask) {
  if (task.status === "completed") return "已完成";
  if (isOverdue(task)) return "等待补上";
  if (isWeekOneOff(task)) return "本周内完成";
  if (isDeadlineOneOff(task) && task.dueDate === DEMO_TODAY) return "今天截止";
  if (task.dueDate === DEMO_TODAY) return "今天";
  return "待办";
}

export function HomeTogetherApp() {
  const configured = isSupabaseConfigured();
  const [authReady, setAuthReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!authReady) return <LoadingScreen />;
  if (configured && !session) return <AuthScreen />;
  return <HouseholdLoader key={session?.user.id ?? "demo"} isDemo={!configured} session={session} />;
}

function LoadingScreen() {
  return (
    <main className="loading-screen" aria-live="polite">
      <BrandMark />
      <p>正在整理今天的家事…</p>
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState(false);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setPassword("");
    setPasswordConfirm("");
    setMessage("");
  }

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (mode === "register" && displayName.trim().length === 0) {
      setMessageKind("error");
      setMessage("请填写你的称呼。");
      return;
    }
    if (password.length < 8) {
      setMessageKind("error");
      setMessage("密码至少需要 8 位。");
      return;
    }
    if (mode === "register" && password !== passwordConfirm) {
      setMessageKind("error");
      setMessage("两次输入的密码不一致。");
      return;
    }

    setBusy(true);
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    const appUrl = window.location.href.split(/[?#]/)[0];

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: appUrl,
          },
        });

    setBusy(false);
    if (result.error) {
      setMessageKind("error");
      setMessage(formatAuthError(result.error.message));
      return;
    }

    if (mode === "register" && !result.data.session) {
      setMessageKind("success");
      setMessage("账号已创建。请先完成一次邮箱确认，然后使用密码登录。");
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-lockup">
          <BrandMark />
          <div><strong>HOME TOGETHER</strong><span>把家里的事，温柔地放在一起</span></div>
        </div>
        <div className="auth-illustration" aria-hidden="true">
          <span className="house-shape"><Heart /></span>
          <span className="plant-shape"><Droplets /></span>
        </div>
        <h1>欢迎回家</h1>
        <p>{mode === "login" ? "使用邮箱账号和密码登录。" : "创建账号后，你可以创建或加入一个家庭。"}</p>
        <div className="segmented-control auth-mode-switch" aria-label="账号操作">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>登录</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>注册</button>
        </div>
        <form onSubmit={submitCredentials} className="auth-form">
          {mode === "register" && <>
            <label htmlFor="display-name">你的称呼</label>
            <div className="input-with-icon"><CircleUserRound aria-hidden="true" /><input id="display-name" type="text" required maxLength={40} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：Nicole" /></div>
          </>}
          <label htmlFor="email">邮箱</label>
          <div className="input-with-icon"><Mail aria-hidden="true" /><input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
          <label htmlFor="password">密码</label>
          <div className="input-with-icon"><LockKeyhole aria-hidden="true" /><input id="password" type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></div>
          {mode === "register" && <>
            <label htmlFor="password-confirm">再次输入密码</label>
            <div className="input-with-icon"><LockKeyhole aria-hidden="true" /><input id="password-confirm" type="password" required minLength={8} autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="再次输入密码" /></div>
          </>}
          <button className="primary-button wide" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录" : "创建账号"}</button>
        </form>
        {message && <p className={`form-message ${messageKind === "error" ? "error" : ""}`} role={messageKind === "error" ? "alert" : "status"}>{message}</p>}
        <p className="tiny-copy">每个账号只能创建或加入一个家庭。</p>
      </section>
    </main>
  );
}

function formatAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "邮箱或密码错误。";
  if (normalized.includes("email not confirmed")) return "请先完成邮箱确认，再使用密码登录。";
  if (normalized.includes("user already registered")) return "这个邮箱已经注册，请直接登录。";
  if (normalized.includes("password") && normalized.includes("weak")) return "密码强度不足，请换一个更复杂的密码。";
  if (normalized.includes("rate limit")) return "操作过于频繁，请稍后再试。";
  return message;
}

function formatAppError(caught: unknown, fallback: string) {
  if (caught instanceof Error) return caught.message;
  if (!caught || typeof caught !== "object") return fallback;

  const record = caught as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";
  const hint = typeof record.hint === "string" ? record.hint : "";
  const code = typeof record.code === "string" ? record.code : "";
  const parts = [message, details, hint].filter(
    (part, index, values) => part && values.indexOf(part) === index,
  );

  if (parts.length === 0) return fallback;
  return `${code ? `[${code}] ` : ""}${parts.join(" · ")}`;
}

function HouseholdLoader({ isDemo, session }: { isDemo: boolean; session: Session | null }) {
  const [snapshot, setSnapshot] = useState<HouseholdSnapshot | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (isDemo) return;
    try {
      const data = await loadHouseholdSnapshot();
      setSnapshot(data);
      setError("");
    } catch (caught) {
      setError(formatAppError(caught, "数据加载失败"));
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!snapshot?.householdId) return;
    const channel = subscribeToHousehold(snapshot.householdId, () => void refresh());
    return () => { if (channel) void getSupabaseClient()?.removeChannel(channel); };
  }, [snapshot?.householdId, refresh]);

  if (loading) return <LoadingScreen />;
  if (!isDemo && !snapshot) return <OnboardingScreen onDone={refresh} error={error} />;

  return (
    <AppShell
      isDemo={isDemo}
      snapshot={snapshot}
      session={session}
      refresh={refresh}
      loadError={error}
    />
  );
}

function OnboardingScreen({ onDone, error }: { onDone: () => Promise<void>; error: string }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [value, setValue] = useState("我们的家");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "create") await createHousehold(value);
      else await joinHousehold(value);
      await onDone();
    } catch (caught) {
      setMessage(formatAppError(caught, "暂时无法完成，请重试"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card onboarding-card">
        <BrandMark />
        <h1>{mode === "create" ? "先给这个家起个名字" : "加入伴侣的家庭"}</h1>
        <p>{mode === "create" ? "创建后可以生成邀请码，邀请另一位成员加入。" : "输入对方分享给你的 8 位邀请码。"}</p>
        <div className="segmented-control">
          <button className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setValue("我们的家"); }}>创建家庭</button>
          <button className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setValue(""); }}>使用邀请码</button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="household-value">{mode === "create" ? "家庭名称" : "邀请码"}</label>
          <input id="household-value" required value={value} onChange={(event) => setValue(event.target.value)} maxLength={mode === "create" ? 60 : 8} />
          <button className="primary-button wide" disabled={busy}>{busy ? "请稍候…" : mode === "create" ? "创建并进入" : "加入家庭"}</button>
        </form>
        {message && <p className="form-message error" role="alert">{message}</p>}
      </section>
    </main>
  );
}

function AppShell({
  isDemo,
  snapshot,
  session,
  refresh,
  loadError,
}: {
  isDemo: boolean;
  snapshot: HouseholdSnapshot | null;
  session: Session | null;
  refresh: () => Promise<void>;
  loadError: string;
}) {
  const householdId = snapshot?.householdId;
  const [view, setView] = useState<ViewKey>("week");
  const [tasks, setTasks] = useState<AppTask[]>(isDemo ? DEMO_TASKS : snapshot?.tasks ?? []);
  const [events, setEvents] = useState<HouseholdEvent[]>(isDemo ? DEMO_EVENTS : snapshot?.events ?? []);
  const [taskEditorMode, setTaskEditorMode] = useState<TaskEditorMode | null>(null);
  const [showEventAdd, setShowEventAdd] = useState(false);
  const [noteTarget, setNoteTarget] = useState<AppTask | null>(null);
  const [detailTarget, setDetailTarget] = useState<AppTask | null>(null);
  const [editTarget, setEditTarget] = useState<AppTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppTask | null>(null);
  const [eventDeleteTarget, setEventDeleteTarget] = useState<HouseholdEvent | null>(null);
  const [toast, setToast] = useState("");

  useOverlayScrollLock(Boolean(
    taskEditorMode
    || showEventAdd
    || noteTarget
    || detailTarget
    || editTarget
    || deleteTarget
    || eventDeleteTarget,
  ));

  useEffect(() => {
    if (isDemo || !snapshot) return;
    const timer = window.setTimeout(() => {
      setTasks(snapshot.tasks);
      setEvents(snapshot.events);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isDemo, snapshot]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentUserId = session?.user.id ?? (isDemo ? DEMO_MEMBERS[0].id : null);
  const members = [...(isDemo ? DEMO_MEMBERS : snapshot?.members ?? [])].sort((left, right) =>
    Number(right.id === currentUserId) - Number(left.id === currentUserId),
  );
  const householdName = isDemo ? "Nicole 的家" : snapshot?.householdName ?? "我们的家";

  async function toggleTask(task: AppTask) {
    const completing = task.status !== "completed";
    const nextStatus: AppTask["status"] = completing ? "completed" : "pending";
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus, completedAt: completing ? new Date().toISOString() : undefined } : item));
    setDetailTarget((current) => current?.id === task.id ? { ...current, status: nextStatus } : current);
    if (completing) {
      setNoteTarget({ ...task, status: "completed" });
      setToast("完成啦，家里又轻松了一点 ✨");
    } else {
      setToast("已撤销完成，任务回到待办");
    }

    if (!isDemo) {
      try {
        if (completing) await completeTaskRecord(task.id);
        else await undoTaskCompletion(task.id);
        await refresh();
      } catch (caught) {
        setTasks((current) => current.map((item) => item.id === task.id ? task : item));
        setToast(formatAppError(caught, "保存失败，已恢复原状态"));
      }
    }
  }

  async function saveNote(note: string) {
    if (!noteTarget) return;
    setTasks((current) => current.map((item) => item.id === noteTarget.id ? { ...item, note } : item));
    if (!isDemo) {
      try { await updateCompletionNote(noteTarget.id, note); }
      catch { setToast("备注暂时没有保存，请稍后重试"); }
    }
    setNoteTarget(null);
    setToast(note ? "完成备注已保存" : "已完成，没有添加备注");
  }

  async function addTask(task: AppTask) {
    setTasks((current) => [...current, task]);
    setTaskEditorMode(null);
    setToast("新事项已加入，一起慢慢完成 🌿");
    if (!isDemo && snapshot) {
      try {
        await createTaskRecord(snapshot.householdId, task);
        await refresh();
      } catch (caught) {
        setTasks((current) => current.filter((item) => item.id !== task.id));
        setToast(formatAppError(caught, "创建失败，请重试"));
      }
    }
  }

  async function editTask(task: AppTask) {
    const previousTasks = tasks;
    setTasks((current) => current.map((item) => {
      if (item.id === task.id) return task;
      if (task.templateId && item.templateId === task.templateId) {
        return {
          ...item,
          title: task.title,
          type: task.type,
          oneOffTiming: task.oneOffTiming,
          assignee: task.assignee,
          assigneeId: task.assigneeId,
          assigneeMode: task.assigneeMode,
          recurrence: task.recurrence,
          recurrenceRule: task.recurrenceRule,
        };
      }
      return item;
    }));
    setEditTarget(null);
    setToast("家务已更新");

    if (!isDemo) {
      try {
        await updateTaskRecord(task);
        await refresh();
      } catch (caught) {
        setTasks(previousTasks);
        setToast(formatAppError(caught, "更新失败，已恢复原内容"));
      }
    }
  }

  async function deleteTask(task: AppTask) {
    const previousTasks = tasks;
    setTasks((current) => current.filter((item) =>
      item.id !== task.id && (!task.templateId || item.templateId !== task.templateId),
    ));
    setDeleteTarget(null);
    setToast("家务已删除");

    if (!isDemo) {
      try {
        await deleteTaskRecord(task.id);
        await refresh();
      } catch (caught) {
        setTasks(previousTasks);
        setToast(formatAppError(caught, "删除失败，家务已恢复"));
      }
    }
  }

  async function addEvent(draft: HouseholdEventDraft) {
    const currentMember = members.find((member) => member.id === currentUserId);
    const event: HouseholdEvent = {
      ...draft,
      id: `event-${Date.now()}`,
      createdBy: currentUserId ?? "demo",
      createdByName: currentMember?.displayName ?? "家庭成员",
    };
    setEvents((current) => [event, ...current]);
    setShowEventAdd(false);
    setToast("家庭事件已记录到时间轴");

    if (!isDemo && householdId) {
      try {
        await createHouseholdEventRecord(householdId, draft);
        await refresh();
      } catch (caught) {
        setEvents((current) => current.filter((item) => item.id !== event.id));
        setToast(formatAppError(caught, "事件记录失败，请重试"));
      }
    }
  }

  async function deleteEvent(event: HouseholdEvent) {
    const previousEvents = events;
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setEventDeleteTarget(null);
    setToast("时间轴记录已删除");

    if (!isDemo) {
      try {
        await deleteHouseholdEventRecord(event.id);
        await refresh();
      } catch (caught) {
        setEvents(previousEvents);
        setToast(formatAppError(caught, "删除失败，事件已恢复"));
      }
    }
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup compact">
          <BrandMark />
          <div><strong>HOME TOGETHER</strong><span>{householdName}</span></div>
        </div>
        <nav className="side-nav" aria-label="主要导航">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-home-card">
          <span className="mini-home"><Home /></span>
          <div><strong>本周一起完成</strong><span>{tasks.filter((task) => task.status === "completed" && DEMO_WEEK.includes(taskDisplayDate(task))).length} 件事</span></div>
          <Heart className="soft-heart" />
        </div>
        <div className="sidebar-members"><Avatar name={members[0]?.displayName ?? "我"} /><Avatar name={members[1]?.displayName ?? "伴侣"} /><span>共享同一份清单</span></div>
      </aside>

      <main className="main-content">
        <header className="mobile-header">
          <div className="brand-lockup compact"><BrandMark /><div><strong>HOME TOGETHER</strong><span>{householdName}</span></div></div>
        </header>
        {loadError && <div className="inline-alert">{loadError}</div>}
        {view === "week" && <WeekView tasks={tasks} members={members} onToggle={toggleTask} onOpen={setDetailTarget} onAdd={() => setTaskEditorMode("all")} />}
        {view === "timeline" && <TimelineView tasks={tasks} events={events} onToggle={toggleTask} onOpenTask={setDetailTarget} onAddOneOff={() => setTaskEditorMode("one_off")} onAddEvent={() => setShowEventAdd(true)} onDeleteEvent={setEventDeleteTarget} />}
        {view === "tasks" && <RecurringTasksView tasks={tasks} onToggle={toggleTask} onOpen={setDetailTarget} onAdd={() => setTaskEditorMode("recurring")} />}
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon /><span>{label}</span></button>
        ))}
      </nav>

      <button className="floating-add" onClick={() => {
        if (view === "timeline") setShowEventAdd(true);
        else setTaskEditorMode(view === "tasks" ? "recurring" : "all");
      }} aria-label={view === "timeline" ? "记录家庭事件" : "添加事项"}><Plus /></button>
      {taskEditorMode && <TaskEditorModal
        members={members}
        defaultType={taskEditorMode === "all" ? undefined : taskEditorMode}
        lockType={taskEditorMode !== "all"}
        onClose={() => setTaskEditorMode(null)}
        onSave={addTask}
      />}
      {showEventAdd && <EventEditorModal onClose={() => setShowEventAdd(false)} onSave={addEvent} />}
      {noteTarget && <CompletionSheet task={noteTarget} onClose={() => setNoteTarget(null)} onSave={saveNote} />}
      {detailTarget && <TaskDetail task={tasks.find((task) => task.id === detailTarget.id) ?? detailTarget} onClose={() => setDetailTarget(null)} onToggle={(task) => { setDetailTarget(null); void toggleTask(task); }} onEdit={(task) => { setDetailTarget(null); setEditTarget(task); }} onDelete={(task) => { setDetailTarget(null); setDeleteTarget(task); }} />}
      {editTarget && <TaskEditorModal initialTask={editTarget} members={members} onClose={() => setEditTarget(null)} onSave={editTask} />}
      {deleteTarget && <DeleteTaskDialog task={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteTask} />}
      {eventDeleteTarget && <DeleteEventDialog event={eventDeleteTarget} onClose={() => setEventDeleteTarget(null)} onConfirm={deleteEvent} />}
      {toast && <div className="toast" role="status"><Check />{toast}</div>}
    </div>
  );
}

function WeekView({ tasks, members, onToggle, onOpen, onAdd }: { tasks: AppTask[]; members: HouseholdMember[]; onToggle: (task: AppTask) => void; onOpen: (task: AppTask) => void; onAdd: () => void }) {
  const [weekStartDate, setWeekStartDate] = useState(DEMO_WEEK[0]);
  const visibleWeek = mondayWeek(weekStartDate);
  const visibleWeekEnd = visibleWeek[6];
  const isCurrentWeek = weekStartDate === DEMO_WEEK[0];
  const weekTasks = tasks.filter((task) => {
    const displayDate = taskDisplayDate(task);
    if (task.status === "completed") return visibleWeek.includes(displayDate);
    return task.status === "pending" && taskWindowEnd(task) <= visibleWeekEnd;
  });
  const completed = weekTasks.filter((task) => task.status === "completed").length;
  const deadlineAlerts = tasks.filter((task) =>
    isDeadlineOneOff(task) && task.status === "pending" && (
      isCurrentWeek ? task.dueDate <= DEMO_TODAY : task.dueDate <= visibleWeekEnd
    ),
  ).sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const weekCompletionTasks = weekTasks.filter((task) =>
    isWeekOneOff(task) || (task.type === "recurring" && task.status === "pending"),
  ).sort((left, right) =>
    taskWindowEnd(left).localeCompare(taskWindowEnd(right)) || left.title.localeCompare(right.title, "zh-CN"),
  );
  const alertIds = new Set(deadlineAlerts.map((task) => task.id));
  const weekCompletionIds = new Set(weekCompletionTasks.map((task) => task.id));
  const progress = weekTasks.length ? Math.round((completed / weekTasks.length) * 100) : 0;

  return (
    <div className="page-shell week-page">
      <section className="page-heading week-heading">
        <div>
          <p className="eyebrow">{formatShortDate(visibleWeek[0])} — {formatShortDate(visibleWeek[6])}</p>
          <h1>{isCurrentWeek ? "这周，我们一起把家照顾好" : "这一周，家里有哪些安排"}</h1>
          <p className="heading-copy">{isCurrentWeek
            ? deadlineAlerts.length ? `今天有 ${deadlineAlerts.length} 件截止事项需要留意。` : "今天没有必须完成的截止事项，按这周的节奏来就好。"
            : `这一周共有 ${weekTasks.filter((task) => task.status === "pending").length} 件待完成事项。`}</p>
        </div>
        <div className="heading-actions"><button className="icon-button" aria-label="上一周" onClick={() => setWeekStartDate((current) => addDays(current, -7))}><ChevronLeft /></button><button className="subtle-button" onClick={() => setWeekStartDate(DEMO_WEEK[0])} disabled={isCurrentWeek}>回到本周</button><button className="icon-button" aria-label="下一周" onClick={() => setWeekStartDate((current) => addDays(current, 7))}><ChevronRight /></button></div>
      </section>

      <section className="progress-card">
        <div className="progress-copy"><span className="progress-icon"><Sparkles /></span><div><strong>已经一起完成 {completed} 件事</strong><span>做得很好，剩下的不用着急</span></div></div>
        <div className="progress-visual"><span>{progress}%</span><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><span>{completed}/{weekTasks.length}</span></div>
        <div className="member-stack">{members.slice(0, 2).map((member) => <Avatar key={member.id} name={member.displayName} />)}</div>
      </section>

      <section className="today-section deadline-section">
        <div className="section-heading"><div><span className="section-dot coral" /><div><h2>{isCurrentWeek ? "今日截止提醒" : "截至本周日的截止事项"}</h2><p>{isCurrentWeek ? "今天必须完成和已经逾期的一次性家务" : "截止日期不晚于这周日且仍未完成的一次性家务"}</p></div></div><span className="count-pill">{deadlineAlerts.length}</span></div>
        <div className="task-list prominent-list">
          {deadlineAlerts.length ? deadlineAlerts.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpen} />) : <EmptyState message={isCurrentWeek ? "今天没有必须完成的截止事项。" : "截至这周日没有待完成的截止事项。"} />}
        </div>
      </section>

      <section className="week-goals">
        <div className="section-heading"><div><span className="section-dot lavender" /><div><h2>本周内完成</h2><p>之前没完成，以及本周应完成的按周事项和周期家务</p></div></div><span className="count-pill">{weekCompletionTasks.filter((task) => task.status === "pending").length}</span></div>
        <div className="task-list">
          {weekCompletionTasks.length ? weekCompletionTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpen} />) : <EmptyState message="截至这周日没有需要补上或完成的按周事项、周期家务。" />}
        </div>
      </section>

      <section className="week-schedule">
        <div className="section-heading"><div><span className="section-dot mauve" /><div><h2>本周日期安排</h2><p>有明确日期的周期家务和截止事项</p></div></div><button className="text-button" onClick={onAdd}><Plus />快速添加</button></div>
        <div className="day-groups">
          {visibleWeek.map((date, index) => {
            const dayTasks = weekTasks.filter((task) =>
              !isWeekOneOff(task) && taskDisplayDate(task) === date && !alertIds.has(task.id) && !weekCompletionIds.has(task.id),
            );
            if (!dayTasks.length && date !== DEMO_TODAY) return null;
            return (
              <div className={`day-group ${date === DEMO_TODAY ? "current" : ""}`} key={date}>
                <div className="day-label"><span>{WEEK_LABELS[index]}</span><strong>{new Date(`${date}T12:00:00`).getDate()}</strong>{date === DEMO_TODAY && <em>今天</em>}</div>
                <div className="task-list">{dayTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} onOpen={onOpen} compact />)}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TaskRow({ task, onToggle, onOpen, compact = false }: { task: AppTask; onToggle: (task: AppTask) => void; onOpen: (task: AppTask) => void; compact?: boolean }) {
  const Icon = CATEGORY_ICONS[task.category] ?? Sparkles;
  const state = taskStatus(task);
  const timing = taskTimingText(task);
  return (
    <div
      className={`task-row ${state} ${compact ? "compact" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(task); }}
    >
      <button className="task-check" onClick={(event) => { event.stopPropagation(); onToggle(task); }} aria-label={task.status === "completed" ? `撤销完成：${task.title}` : `完成：${task.title}`}><Check /></button>
      <span className="task-icon"><Icon aria-hidden="true" /></span>
      <div className="task-main"><div className="task-title-line"><h3>{task.title}</h3>{task.type === "recurring" && <span className="type-pill"><Repeat2 />周期</span>}{isWeekOneOff(task) && <span className="type-pill week"><CalendarDays />按周</span>}{isDeadlineOneOff(task) && <span className="type-pill deadline"><Bell />截止</span>}</div><div className="task-meta"><span className={state === "overdue" ? "overdue-copy" : ""}><Clock3 />{timing}</span><span className="assignee-chip"><Avatar name={task.assignee} small />{task.assignee}</span>{task.recurrence && <span>{task.recurrence}</span>}</div>{task.note && !compact && <p className="task-note">“{task.note}”</p>}</div>
      <button className="more-button" aria-label={`查看 ${task.title} 详情`}><MoreHorizontal /></button>
    </div>
  );
}

type TimelineItem =
  | { kind: "task"; id: string; timestamp: string; task: AppTask }
  | { kind: "event"; id: string; timestamp: string; event: HouseholdEvent };

function TimelineDate({ value }: { value: string }) {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/Chicago",
    month: "short",
  }).format(date);
  const day = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/Chicago",
    day: "numeric",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(date);
  return <time dateTime={value} className="timeline-date"><span>{month}</span><strong>{day}</strong><em>{weekday}</em></time>;
}

function timelineMonthKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return year + "-" + month;
}

function timelineMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return year + " 年 " + Number(month) + " 月";
}

function TimelineView({
  tasks,
  events,
  onToggle,
  onOpenTask,
  onAddOneOff,
  onAddEvent,
  onDeleteEvent,
}: {
  tasks: AppTask[];
  events: HouseholdEvent[];
  onToggle: (task: AppTask) => void;
  onOpenTask: (task: AppTask) => void;
  onAddOneOff: () => void;
  onAddEvent: () => void;
  onDeleteEvent: (event: HouseholdEvent) => void;
}) {
  const [timelineMonthFilter, setTimelineMonthFilter] = useState("all");
  const [timelinePage, setTimelinePage] = useState(0);
  const reminders = tasks
    .filter((task) => task.type === "one_off" && task.status !== "completed")
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title, "zh-CN"));
  const timelineItems: TimelineItem[] = [];

  for (const task of tasks) {
    if (task.type === "one_off" && task.status === "completed" && task.completedAt) {
      timelineItems.push({ kind: "task", id: task.id, timestamp: task.completedAt, task });
    }
  }
  for (const event of events) {
    timelineItems.push({ kind: "event", id: event.id, timestamp: event.occurredAt, event });
  }
  timelineItems.sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const timelineMonthOptions = [...new Set(timelineItems.map((item) => timelineMonthKey(item.timestamp)))];
  const activeTimelineMonthFilter = timelineMonthFilter === "all" || timelineMonthOptions.includes(timelineMonthFilter)
    ? timelineMonthFilter
    : "all";
  const filteredTimelineItems = activeTimelineMonthFilter === "all"
    ? timelineItems
    : timelineItems.filter((item) => timelineMonthKey(item.timestamp) === activeTimelineMonthFilter);
  const timelinePageCount = Math.max(1, Math.ceil(filteredTimelineItems.length / 10));
  const activeTimelinePage = Math.min(timelinePage, timelinePageCount - 1);
  const visibleTimelineItems = filteredTimelineItems.slice(activeTimelinePage * 10, activeTimelinePage * 10 + 10);
  const timelineMonthGroups = visibleTimelineItems.reduce<Array<{ key: string; items: TimelineItem[] }>>((groups, item) => {
    const key = timelineMonthKey(item.timestamp);
    const currentGroup = groups[groups.length - 1];
    if (currentGroup?.key === key) currentGroup.items.push(item);
    else groups.push({ key, items: [item] });
    return groups;
  }, []);

  return (
    <div className="page-shell timeline-page">
      <section className="page-heading">
        <div><p className="eyebrow">家的记忆</p><h1>家庭时间轴</h1><p className="heading-copy">完成的小事和家里的变化，会一起留在这里。</p></div>
        <div className="heading-actions timeline-actions"><button className="secondary-button" onClick={onAddOneOff}><Bell />添加提醒</button><button className="primary-button" onClick={onAddEvent}><Plus />记录事件</button></div>
      </section>

      <section className="timeline-reminders">
        <div className="timeline-section-heading"><div><span className="timeline-heading-icon"><Bell /></span><p><strong>一次性家务提醒</strong><span>只显示尚未完成的事项，按日期从早到晚排列。</span></p></div><span>{reminders.length}</span></div>
        <div className="timeline-reminder-list">{reminders.length ? reminders.map((task) => <TaskRow key={task.id} task={task} compact onToggle={onToggle} onOpen={onOpenTask} />) : <EmptyState message="没有未完成的一次性家务，时间可以留给生活。" />}</div>
      </section>

      <section className="timeline-history">
        <div className="timeline-section-heading history"><div><span className="timeline-heading-icon"><Clock3 /></span><p><strong>家庭记录</strong><span>每页 10 条，可按月份查找，月份之间以分割线区分。</span></p></div><span>{timelineItems.length}</span></div>
        {timelineItems.length ? <>
        <div className="timeline-browser">
          <label className="timeline-month-filter"><span>查看月份</span><select value={activeTimelineMonthFilter} onChange={(event) => { setTimelineMonthFilter(event.target.value); setTimelinePage(0); }}><option value="all">全部月份</option>{timelineMonthOptions.map((month) => <option value={month} key={month}>{timelineMonthLabel(month)}</option>)}</select></label>
          <span>找到 {filteredTimelineItems.length} 条记录</span>
        </div>
        <div className="timeline-list">{timelineMonthGroups.map((group) => <section className="timeline-month-group" key={group.key} aria-label={timelineMonthLabel(group.key)}>
          <div className="timeline-month-divider"><span>{timelineMonthLabel(group.key)}</span><i /></div>
          <div className="timeline-month-entries">{group.items.map((item) => {
          if (item.kind === "task") {
            return (
              <article className="timeline-entry completed-task-entry" key={"task-" + item.id}>
                <TimelineDate value={item.timestamp} />
                <span className="timeline-rail"><i /></span>
                <button className="timeline-card" onClick={() => onOpenTask(item.task)}>
                  <span className="timeline-card-icon completed"><Check /></span>
                  <span className="timeline-card-copy"><span className="timeline-kind">已完成的一次性家事</span><strong>{item.task.title}</strong><small>{formatDateTime(item.timestamp)} · {item.task.assignee}</small>{item.task.note && <em>{item.task.note}</em>}</span>
                  <MoreHorizontal />
                </button>
              </article>
            );
          }

          const option = EVENT_TYPE_OPTIONS.find((entry) => entry.id === item.event.type) ?? EVENT_TYPE_OPTIONS[0];
          const Icon = option.icon;
          return (
            <article className={"timeline-entry event-entry " + item.event.type} key={"event-" + item.id}>
              <TimelineDate value={item.timestamp} />
              <span className="timeline-rail"><i /></span>
              <div className="timeline-card">
                <span className="timeline-card-icon event"><Icon /></span>
                <span className="timeline-card-copy"><span className="timeline-kind">{option.label}</span><strong>{item.event.title}</strong><small>{formatDateTime(item.timestamp)} · {item.event.createdByName}</small>{item.event.description && <em>{item.event.description}</em>}{item.event.amount !== undefined && <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: item.event.currency }).format(item.event.amount)}</b>}</span>
                <button className="timeline-delete" onClick={() => onDeleteEvent(item.event)} aria-label={"删除 " + item.event.title}><Trash2 /></button>
              </div>
            </article>
          );
        })}</div>
        </section>)}</div>
        {timelinePageCount > 1 && <nav className="timeline-page-nav" aria-label="时间轴分页">
          <button className="secondary-button" disabled={activeTimelinePage === 0} onClick={() => setTimelinePage((current) => Math.max(0, current - 1))}><ChevronLeft />上一页</button>
          <span>第 {activeTimelinePage + 1} / {timelinePageCount} 页</span>
          <button className="secondary-button" disabled={activeTimelinePage === timelinePageCount - 1} onClick={() => setTimelinePage((current) => Math.min(timelinePageCount - 1, current + 1))}>下一页<ChevronRight /></button>
        </nav>}</> : <EmptyState message="时间轴还是空的。完成一次性家务，或记录一件家里发生的事吧。" />}
      </section>
    </div>
  );
}

function RecurringTasksView({ tasks, onToggle, onOpen, onAdd }: { tasks: AppTask[]; onToggle: (task: AppTask) => void; onOpen: (task: AppTask) => void; onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const recurringByTemplate = new Map<string, AppTask>();

  for (const task of tasks.filter((item) => item.type === "recurring")) {
    const key = task.templateId ?? task.id;
    const current = recurringByTemplate.get(key);
    if (!current
      || (task.status === "pending" && current.status !== "pending")
      || (task.status === current.status && task.status === "pending" && task.dueDate < current.dueDate)
      || (task.status !== "pending" && current.status !== "pending" && (task.completedAt ?? "") > (current.completedAt ?? ""))) {
      recurringByTemplate.set(key, task);
    }
  }

  const recurringTasks = [...recurringByTemplate.values()]
    .filter((task) => task.title.toLocaleLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title, "zh-CN"));

  return (
    <div className="page-shell recurring-tasks-page">
      <section className="page-heading"><div><p className="eyebrow">家的节奏</p><h1>周期家务</h1><p className="heading-copy">这里只保留会重复发生的家务，按下一次应做日期排列。</p></div><button className="primary-button" onClick={onAdd}><Plus />添加周期家务</button></section>
      <div className="task-tools"><div className="recurring-count"><Repeat2 /><span><strong>{recurringByTemplate.size}</strong> 项周期安排</span></div><label className="search-box"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索周期家务" /><span className="sr-only">搜索周期家务</span></label></div>
      <div className="list-summary"><div><Repeat2 /><p><strong>按照下一次应做日期排列</strong><span>已经晚了的事项会排在最前面；完成历史请点进事项查看。</span></p></div><span>{recurringTasks.length} 项</span></div>
      <section className="catalog-list">{recurringTasks.length ? recurringTasks.map((task) => <TaskRow key={task.templateId ?? task.id} task={task} onToggle={onToggle} onOpen={onOpen} />) : <EmptyState message="没有找到符合条件的周期家务。" />}</section>
    </div>
  );
}

function TaskEditorModal({
  initialTask,
  members,
  defaultType,
  lockType = false,
  onClose,
  onSave,
}: {
  initialTask?: AppTask;
  members: HouseholdMember[];
  defaultType?: AppTask["type"];
  lockType?: boolean;
  onClose: () => void;
  onSave: (task: AppTask) => void;
}) {
  const initialKind = initialTask?.recurrenceRule?.kind;
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [type, setType] = useState<AppTask["type"]>(initialTask?.type ?? defaultType ?? "one_off");
  const [oneOffTiming, setOneOffTiming] = useState<"week" | "deadline">(
    initialTask?.oneOffTiming === "deadline" ? "deadline" : "week",
  );
  const [date, setDate] = useState(initialTask?.dueDate ?? DEMO_TODAY);
  const [completedAt, setCompletedAt] = useState(
    initialTask?.completedAt ? toDateTimeLocal(initialTask.completedAt) : "",
  );
  const [assignee, setAssignee] = useState(
    initialTask?.assigneeMode === "member" ? initialTask.assigneeId ?? "unassigned" : initialTask?.assigneeMode ?? "shared",
  );
  const [interval, setInterval] = useState(Number(initialTask?.recurrenceRule?.interval ?? 14));
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>(
    initialKind === "weekly" || initialKind === "monthly" ? initialKind : "interval_days",
  );
  const editing = Boolean(initialTask);

  function submit(event: FormEvent) {
    event.preventDefault();
    const selected = members.find((member) => member.id === assignee);
    const shared = assignee === "shared";
    const baseTask: AppTask = initialTask ?? {
      id: `new-${Date.now()}`,
      title: "",
      category: "home",
      type: "one_off",
      oneOffTiming: "week",
      assignee: "未分配",
      assigneeMode: "unassigned",
      dueDate: date,
      status: "pending",
    };
    const normalizedInterval = Math.max(1, Math.min(365, interval || 1));
    const normalizedDate = type === "one_off" && oneOffTiming === "week" ? mondayWeek(date)[0] : date;
    onSave({
      ...baseTask,
      title: title.trim(),
      type,
      oneOffTiming: type === "one_off" ? oneOffTiming : null,
      assignee: shared ? "共同" : selected?.displayName ?? "未分配",
      assigneeId: selected?.id ?? null,
      assigneeMode: shared ? "shared" : selected ? "member" : "unassigned",
      dueDate: normalizedDate,
      completedAt: initialTask?.status === "completed" && completedAt
        ? new Date(completedAt).toISOString()
        : initialTask?.completedAt,
      recurrence: type === "recurring" ? recurrenceText(recurrenceKind, normalizedInterval) : undefined,
      recurrenceRule: type === "recurring" ? { kind: recurrenceKind, interval: normalizedInterval } : null,
      lastCompleted: type === "recurring" ? initialTask?.lastCompleted : undefined,
      nextDue: type === "recurring" ? initialTask?.nextDue : undefined,
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-card add-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="modal-heading"><div><span className="modal-icon">{editing ? <Pencil /> : <Plus />}</span><div><p>{editing ? "编辑家务" : "快速添加"}</p><h2 id="add-title">{editing ? "调整这件家务" : defaultType === "recurring" ? "添加周期家务" : defaultType === "one_off" ? "添加一次性家务" : "家里有什么要做？"}</h2></div></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div>
        <form onSubmit={submit}>
          <label className="field"><span>事项名称</span><input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：联系物业" /></label>
          {!lockType && <div className="field"><span>类型</span><div className="type-picker"><button type="button" className={type === "one_off" ? "active" : ""} onClick={() => setType("one_off")}><ClipboardCheck />一次性家事<small>完成后不再重复</small></button><button type="button" className={type === "recurring" ? "active" : ""} onClick={() => setType("recurring")}><Repeat2 />周期家务<small>按节奏自动出现</small></button></div></div>}
          {type === "one_off" && <div className="field"><span>完成方式</span><div className="type-picker timing-picker"><button type="button" className={oneOffTiming === "week" ? "active" : ""} onClick={() => setOneOffTiming("week")}><CalendarDays />按周完成<small>在选定的一周内完成即可</small></button><button type="button" className={oneOffTiming === "deadline" ? "active" : ""} onClick={() => setOneOffTiming("deadline")}><Bell />截止日期<small>必须在指定日期前完成</small></button></div></div>}
          <div className="form-grid"><label className="field"><span>{type === "recurring" ? "首次计划日期" : oneOffTiming === "week" ? "选择所在周" : "截止日期"}</span><span className="native-date-control"><input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></span>{type === "one_off" && oneOffTiming === "week" && <small className="week-preview">将作为 {formatWeekRange(mondayWeek(date)[0])} 的本周事项</small>}</label><label className="field"><span>负责人</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="shared">共同</option>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}<option value="unassigned">未分配</option></select></label></div>
          {initialTask?.status === "completed" && <label className="field"><span>实际完成时间</span><span className="native-date-control"><input type="datetime-local" required max={toDateTimeLocal(new Date().toISOString())} value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} /></span><small className="week-preview">修改后，周期家务的下一次计划日期会同步重新计算。</small></label>}
          {type === "recurring" && <label className="field recurrence-field"><span>重复节奏</span><div><span>每</span><input type="number" min={1} max={365} value={interval} onChange={(event) => setInterval(Number(event.target.value))} /><select aria-label="重复周期单位" value={recurrenceKind} onChange={(event) => setRecurrenceKind(event.target.value as RecurrenceKind)}><option value="interval_days">天</option><option value="weekly">周</option><option value="monthly">月</option></select></div><small>默认从实际完成日重新计算下一次。</small></label>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button">{editing ? <Pencil /> : <Plus />}{editing ? "保存修改" : "加入清单"}</button></div>
        </form>
      </section>
    </div>
  );
}

function EventEditorModal({ onClose, onSave }: { onClose: () => void; onSave: (event: HouseholdEventDraft) => void }) {
  const [type, setType] = useState<HouseholdEventType>("family");
  const [title, setTitle] = useState(() => defaultFamilyEventTitle(toDateTimeLocal(new Date().toISOString())));
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(new Date().toISOString()));
  const [amount, setAmount] = useState("");
  const [usesDefaultFamilyTitle, setUsesDefaultFamilyTitle] = useState(true);

  function chooseType(nextType: HouseholdEventType) {
    setType(nextType);
    if (nextType === "family") {
      if (!title.trim() || usesDefaultFamilyTitle) {
        setTitle(defaultFamilyEventTitle(occurredAt));
        setUsesDefaultFamilyTitle(true);
      }
      return;
    }
    if (usesDefaultFamilyTitle) {
      setTitle("");
      setUsesDefaultFamilyTitle(false);
    }
  }

  function changeOccurredAt(value: string) {
    setOccurredAt(value);
    if (type === "family" && usesDefaultFamilyTitle) {
      setTitle(defaultFamilyEventTitle(value));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedAmount = amount.trim() ? Number(amount) : undefined;
    onSave({
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      occurredAt: new Date(occurredAt).toISOString(),
      amount: type === "finance" && parsedAmount !== undefined && Number.isFinite(parsedAmount)
        ? parsedAmount
        : undefined,
      currency: "USD",
    });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal-card add-modal event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <div className="modal-heading"><div><span className="modal-icon"><Sparkles /></span><div><p>家庭记录</p><h2 id="event-title">记录一件家里的事</h2></div></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div>
        <form onSubmit={submit}>
          <div className="field"><span>事件类型</span><div className="event-type-picker">{EVENT_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return <button key={option.id} type="button" className={type === option.id ? "active" : ""} onClick={() => chooseType(option.id)}><Icon /><span>{option.label}</span><small>{option.hint}</small></button>;
          })}</div></div>
          <label className="field"><span>标题</span><input required maxLength={100} value={title} onChange={(event) => { setTitle(event.target.value); setUsesDefaultFamilyTitle(false); }} placeholder="例如：客厅换了新的落地灯" />{type === "family" && usesDefaultFamilyTitle && <small className="week-preview">已按发生日期生成默认家事日记标题，可直接修改。</small>}</label>
          <label className="field"><span>发生时间</span><span className="native-date-control"><input type="datetime-local" required max={toDateTimeLocal(new Date().toISOString())} value={occurredAt} onChange={(event) => changeOccurredAt(event.target.value)} /></span></label>
          {type === "finance" && <label className="field"><span>金额（可选，USD）</span><input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>}
          <label className="field"><span>补充说明（可选）</span><textarea maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="记录背景、变化或想一起记住的细节" /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button"><Plus />记录到时间轴</button></div>
        </form>
      </section>
    </div>
  );
}

function CompletionSheet({ task, onClose, onSave }: { task: AppTask; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(task.note ?? "");
  return (
    <div className="modal-backdrop celebration-backdrop">
      <section className="completion-sheet" role="dialog" aria-modal="true" aria-labelledby="complete-title">
        <div className="celebration-burst" aria-hidden="true"><Sparkles /><Heart /><Sparkles /></div>
        <button className="icon-button close-sheet" onClick={onClose} aria-label="关闭"><X /></button>
        <span className="complete-check"><Check /></span>
        <p>完成啦</p><h2 id="complete-title">{task.title}</h2><span className="completion-meta">由你完成 · 刚刚</span>
        <label className="field note-field"><span>留一句完成备注 <em>可选</em></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="例如：滤芯快用完了，下次记得补充" /></label>
        <div className="modal-actions"><button className="secondary-button" onClick={() => onSave("")}>跳过备注</button><button className="primary-button" onClick={() => onSave(note)}>保存备注</button></div>
      </section>
    </div>
  );
}

function TaskDetail({ task, onClose, onToggle, onEdit, onDelete }: { task: AppTask; onClose: () => void; onToggle: (task: AppTask) => void; onEdit: (task: AppTask) => void; onDelete: (task: AppTask) => void }) {
  const Icon = CATEGORY_ICONS[task.category] ?? Sparkles;
  const [historyPage, setHistoryPage] = useState(0);
  const history = task.completionHistory?.length
    ? task.completionHistory
    : task.completedAt
      ? [{ id: task.id, completedAt: task.completedAt, note: task.note }]
      : [];
  const historyPageCount = Math.max(1, Math.ceil(history.length / 5));
  const currentHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const visibleHistory = history.slice(currentHistoryPage * 5, currentHistoryPage * 5 + 5);

  return (
    <div className="detail-backdrop">
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail-top"><span className="task-icon large"><Icon /></span><div className="detail-top-actions"><button className="icon-button" onClick={() => onEdit(task)} aria-label="编辑家务"><Pencil /></button><button className="icon-button" onClick={onClose} aria-label="关闭详情"><X /></button></div></div>
        <div className="detail-title"><p>{task.type === "recurring" ? "周期家务" : isWeekOneOff(task) ? "一次性家务 · 按周完成" : "一次性家务 · 截止日期"}</p><h2 id="detail-title">{task.title}</h2><span className={"status-label " + taskStatus(task)}>{taskStatusText(task)}</span></div>
        {task.description && <p className="detail-description">{task.description}</p>}
        <div className="detail-facts"><div><Clock3 /><span>{task.type === "recurring" ? "下一次应做" : isWeekOneOff(task) ? "完成周" : "截止日期"}</span><strong>{isWeekOneOff(task) ? formatWeekRange(task.dueDate) : formatShortDate(task.dueDate)}</strong></div><div><CircleUserRound /><span>负责人</span><strong>{task.assignee}</strong></div>{task.recurrence && <div><Repeat2 /><span>重复规则</span><strong>{task.recurrence}</strong></div>}</div>
        {task.type === "recurring" && <section className="rhythm-card"><h3>这个事项的节奏</h3><div><p><span>上次完成</span><strong>{formatStoredMoment(task.lastCompleted, "还没有记录")}</strong></p><i /><p><span>下次应做</span><strong>{formatStoredMoment(task.nextDue ?? task.dueDate, "还没有安排")}</strong></p></div><small>下一次日期按实际完成日期加上原定周期计算。</small></section>}
        <section className="history-section">
          <div className="history-heading"><h3>完成历史</h3>{history.length > 0 && <span>{history.length} 条记录</span>}</div>
          {visibleHistory.length ? <div className="history-list">{visibleHistory.map((record) => <div className="history-item" key={record.id}><span><Check /></span><div><strong>{formatDateTime(record.completedAt)} 完成</strong><p>{record.note || "没有添加备注"}</p></div></div>)}</div> : <EmptyState message="完成后会在这里留下记录。" />}
          {historyPageCount > 1 && <div className="history-pagination"><button className="secondary-button" disabled={currentHistoryPage === 0} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}><ChevronLeft />上一页</button><span>{currentHistoryPage + 1} / {historyPageCount}</span><button className="secondary-button" disabled={currentHistoryPage >= historyPageCount - 1} onClick={() => setHistoryPage((page) => Math.min(historyPageCount - 1, page + 1))}>下一页<ChevronRight /></button></div>}
        </section>
        <div className="detail-actions"><button className={task.status === "completed" ? "secondary-button wide" : "primary-button wide"} onClick={() => onToggle(task)}>{task.status === "completed" ? "撤销完成" : <><Check />标记完成</>}</button><button className="secondary-button wide" onClick={() => onEdit(task)}><Pencil />编辑家务</button><button className="danger-button wide" onClick={() => onDelete(task)}><Trash2 />删除家务</button></div>
      </aside>
    </div>
  );
}

function DeleteTaskDialog({ task, onClose, onConfirm }: { task: AppTask; onClose: () => void; onConfirm: (task: AppTask) => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
        <span className="delete-icon"><Trash2 /></span>
        <h2 id="delete-title">删除“{task.title}”？</h2>
        <p id="delete-description">这会删除这项家务的安排和全部完成记录，删除后无法恢复。</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="danger-button" onClick={() => onConfirm(task)}><Trash2 />确认删除</button></div>
      </section>
    </div>
  );
}

function DeleteEventDialog({ event, onClose, onConfirm }: { event: HouseholdEvent; onClose: () => void; onConfirm: (event: HouseholdEvent) => void }) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-event-title" aria-describedby="delete-event-description">
        <span className="delete-icon"><Trash2 /></span>
        <h2 id="delete-event-title">删除“{event.title}”？</h2>
        <p id="delete-event-description">这条家庭事件会从时间轴中移除，删除后无法恢复。</p>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="danger-button" onClick={() => onConfirm(event)}><Trash2 />确认删除</button></div>
      </section>
    </div>
  );
}

function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  const tone = name === "Nicole" ? "rose" : name === "共同" ? "shared" : "lavender";
  return <span className={`avatar ${tone} ${small ? "small" : ""}`} aria-label={name}>{name === "共同" ? <Heart /> : initials(name)}</span>;
}

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}home-together-logo.png`} alt="" /></div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><span><Heart /></span><p>{message}</p></div>;
}
