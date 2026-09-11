import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export type HouseholdMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TaskCompletion = {
  id: string;
  completedAt: string;
  note?: string;
};

export type AppTask = {
  id: string;
  templateId?: string;
  title: string;
  category: string;
  type: "recurring" | "one_off";
  oneOffTiming?: "week" | "deadline" | null;
  assignee: string;
  assigneeId?: string | null;
  assigneeMode: "member" | "shared" | "unassigned";
  dueDate: string;
  status: "pending" | "completed" | "skipped";
  recurrence?: string;
  recurrenceRule?: Record<string, unknown> | null;
  note?: string;
  description?: string;
  completedAt?: string;
  completionHistory?: TaskCompletion[];
  lastCompleted?: string;
  nextDue?: string;
};

export type HouseholdSnapshot = {
  householdId: string;
  householdName: string;
  timezone: string;
  weekStart: number;
  members: HouseholdMember[];
  tasks: AppTask[];
};

type JoinedInstance = {
  id: string;
  template_id: string;
  scheduled_date: string;
  status: "pending" | "completed" | "skipped";
  assignee_profile_id: string | null;
  task_templates: {
    title: string;
    category: string | null;
    type: "recurring" | "one_off";
    one_off_timing: "week" | "deadline" | null;
    assignee_mode: "member" | "shared" | "unassigned";
    recurrence_rule: Record<string, unknown> | null;
    description: string | null;
  };
  completion_records: Array<{
    id: string;
    note: string | null;
    completed_at: string;
    is_voided: boolean;
  }>;
};

function recurrenceLabel(rule: Record<string, unknown> | null) {
  if (!rule) return undefined;
  const kind = rule.kind;
  if (kind === "daily") return "每天";
  if (kind === "weekly") return `每 ${Number(rule.interval ?? 1)} 周`;
  if (kind === "monthly") return `每 ${Number(rule.interval ?? 1)} 月`;
  if (kind === "interval_days") return `每 ${Number(rule.interval ?? 1)} 天`;
  return "自定义周期";
}

export async function loadHouseholdSnapshot(): Promise<HouseholdSnapshot | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, households(name, timezone, week_start)")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) return null;

  const household = Array.isArray(membership.households)
    ? membership.households[0]
    : membership.households;
  const householdId = membership.household_id as string;

  const [{ data: memberRows, error: memberError }, { data: instanceRows, error: taskError }] =
    await Promise.all([
      supabase
        .from("household_members")
        .select("profile_id, profiles(display_name, avatar_url)")
        .eq("household_id", householdId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("task_instances")
        .select(
          "id, template_id, scheduled_date, status, assignee_profile_id, task_templates!inner(title, category, type, one_off_timing, assignee_mode, recurrence_rule, description), completion_records!completion_records_instance_id_fkey(id, note, completed_at, is_voided)",
        )
        .eq("household_id", householdId)
        .order("scheduled_date", { ascending: true }),
    ]);

  if (memberError) throw memberError;
  if (taskError) throw taskError;

  const members: HouseholdMember[] = (memberRows ?? []).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.profile_id,
      displayName: profile?.display_name ?? "家庭成员",
      avatarUrl: profile?.avatar_url ?? null,
    };
  });

  const rows = (instanceRows ?? []) as unknown as JoinedInstance[];
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const historyByTemplate = new Map<string, TaskCompletion[]>();
  const nextDueByTemplate = new Map<string, string>();

  for (const row of rows) {
    const history = historyByTemplate.get(row.template_id) ?? [];
    for (const completion of row.completion_records ?? []) {
      if (completion.is_voided) continue;
      history.push({
        id: completion.id,
        completedAt: completion.completed_at,
        note: completion.note ?? undefined,
      });
    }
    historyByTemplate.set(row.template_id, history);

    if (row.task_templates.type === "recurring" && row.status === "pending") {
      const currentNextDue = nextDueByTemplate.get(row.template_id);
      if (!currentNextDue || row.scheduled_date < currentNextDue) {
        nextDueByTemplate.set(row.template_id, row.scheduled_date);
      }
    }
  }

  for (const history of historyByTemplate.values()) {
    history.sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  }

  const tasks = rows.map((row) => {
    const completion = row.completion_records
      ?.filter((item) => !item.is_voided)
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0];
    const assignee =
      row.task_templates.assignee_mode === "shared"
        ? "共同"
        : row.assignee_profile_id
          ? memberNames.get(row.assignee_profile_id) ?? "家庭成员"
          : "未分配";

    const completionHistory = historyByTemplate.get(row.template_id) ?? [];

    return {
      id: row.id,
      templateId: row.template_id,
      title: row.task_templates.title,
      category: row.task_templates.category ?? "home",
      type: row.task_templates.type,
      oneOffTiming: row.task_templates.type === "one_off"
        ? row.task_templates.one_off_timing ?? "deadline"
        : null,
      assignee,
      assigneeId: row.assignee_profile_id,
      assigneeMode: row.task_templates.assignee_mode,
      dueDate: row.scheduled_date,
      status: row.status,
      recurrence: recurrenceLabel(row.task_templates.recurrence_rule),
      recurrenceRule: row.task_templates.recurrence_rule,
      note: completion?.note ?? undefined,
      description: row.task_templates.description ?? undefined,
      completedAt: completion?.completed_at,
      completionHistory,
      lastCompleted: completionHistory[0]?.completedAt,
      nextDue: nextDueByTemplate.get(row.template_id),
    } satisfies AppTask;
  });

  return {
    householdId,
    householdName: household?.name ?? "我们的家",
    timezone: household?.timezone ?? "America/Chicago",
    weekStart: household?.week_start ?? 1,
    members,
    tasks,
  };
}

export async function createHousehold(name: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { data, error } = await supabase.rpc("create_household", {
    p_name: name,
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw householdMembershipError(error);
  return data as string;
}

export async function joinHousehold(code: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { data, error } = await supabase.rpc("join_household_by_invite", {
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw householdMembershipError(error);
  return data as string;
}

function householdMembershipError(error: {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}) {
  if (
    error.code === "23505" ||
    error.message.includes("每个账号只能属于一个家庭") ||
    error.message.includes("household_members_one_household_per_profile")
  ) {
    return new Error("这个账号已经属于一个家庭，不能再创建或加入其他家庭。");
  }
  const context = [error.message, error.details, error.hint]
    .filter((part, index, values): part is string => Boolean(part) && values.indexOf(part) === index)
    .join(" · ");
  return new Error(`${error.code ? `[${error.code}] ` : ""}${context || "家庭操作失败"}`);
}

export async function createInvite(householdId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { data, error } = await supabase.rpc("create_household_invite", {
    p_household_id: householdId,
  });
  if (error) throw error;
  return data as string;
}

export async function createTaskRecord(
  householdId: string,
  task: Pick<
    AppTask,
    "title" | "category" | "type" | "oneOffTiming" | "assigneeMode" | "assigneeId" | "dueDate" | "recurrenceRule"
  >,
) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("请先登录");

  const { data: template, error: templateError } = await supabase
    .from("task_templates")
    .insert({
      household_id: householdId,
      title: task.title,
      category: task.category,
      type: task.type,
      one_off_timing: task.type === "one_off" ? task.oneOffTiming ?? "deadline" : null,
      assignee_mode: task.assigneeMode,
      assignee_profile_id: task.assigneeId ?? null,
      recurrence_rule: task.type === "recurring" ? task.recurrenceRule : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (templateError) throw templateError;

  const { error: instanceError } = await supabase.from("task_instances").insert({
    household_id: householdId,
    template_id: template.id,
    scheduled_date: task.dueDate,
    assignee_profile_id: task.assigneeId ?? null,
  });
  if (instanceError) throw instanceError;
}

export async function updateTaskRecord(task: Pick<
  AppTask,
  "id" | "title" | "type" | "oneOffTiming" | "assigneeMode" | "assigneeId" | "dueDate" | "recurrenceRule" | "completedAt"
>) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { error } = await supabase.rpc("update_household_task", {
    p_instance_id: task.id,
    p_title: task.title,
    p_type: task.type,
    p_one_off_timing: task.type === "one_off" ? task.oneOffTiming ?? "deadline" : null,
    p_assignee_mode: task.assigneeMode,
    p_assignee_profile_id: task.assigneeId ?? null,
    p_scheduled_date: task.dueDate,
    p_recurrence_rule: task.type === "recurring" ? task.recurrenceRule : null,
    p_completed_at: task.completedAt ?? null,
  });
  if (error) throw error;
}

export async function deleteTaskRecord(instanceId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { error } = await supabase.rpc("delete_household_task", {
    p_instance_id: instanceId,
  });
  if (error) throw error;
}

export async function completeTaskRecord(instanceId: string, note?: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { error } = await supabase.rpc("complete_task", {
    p_instance_id: instanceId,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function updateCompletionNote(instanceId: string, note: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { error } = await supabase
    .from("completion_records")
    .update({ note })
    .eq("instance_id", instanceId)
    .eq("is_voided", false);
  if (error) throw error;
}

export async function undoTaskCompletion(instanceId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 尚未配置");
  const { error } = await supabase.rpc("undo_task_completion", {
    p_instance_id: instanceId,
  });
  if (error) throw error;
}

export function subscribeToHousehold(householdId: string, refresh: () => void) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const channel = supabase
    .channel(`household-${householdId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_instances", filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "completion_records", filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${householdId}` },
      refresh,
    )
    .subscribe();

  return channel as RealtimeChannel;
}
