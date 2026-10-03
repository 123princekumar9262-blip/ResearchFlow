// Database types in the shape `supabase gen types typescript` emits.
// Written by hand to match supabase/migrations; once a Supabase project is
// linked, regenerate with `npm run db:types` and this file is replaced.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: Database["public"]["Enums"]["user_role"];
          join_code: string | null;
          timezone: string;
          digest_email: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role: Database["public"]["Enums"]["user_role"];
          join_code?: string | null;
          timezone?: string;
          created_at?: string;
        };
        Update: {
          full_name?: string;
          timezone?: string;
          digest_email?: boolean;
        };
        Relationships: [];
      };
      supervisions: {
        Row: { professor_id: string; student_id: string; created_at: string };
        Insert: { professor_id: string; student_id: string; created_at?: string };
        Update: { professor_id?: string; student_id?: string };
        Relationships: [
          Rel<"supervisions_professor_id_fkey", "professor_id", "profiles">,
          Rel<"supervisions_student_id_fkey", "student_id", "profiles">,
        ];
      };
      projects: {
        Row: {
          id: string;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["project_status"];
          start_date: string;
          target_end_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          status?: Database["public"]["Enums"]["project_status"];
          start_date?: string;
          target_end_date?: string | null;
          created_by: string;
        };
        Update: {
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["project_status"];
          start_date?: string;
          target_end_date?: string | null;
        };
        Relationships: [Rel<"projects_created_by_fkey", "created_by", "profiles">];
      };
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          role: Database["public"]["Enums"]["user_role"];
          added_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: { role?: Database["public"]["Enums"]["user_role"] };
        Relationships: [
          Rel<"project_members_project_id_fkey", "project_id", "projects">,
          Rel<"project_members_user_id_fkey", "user_id", "profiles">,
        ];
      };
      milestones: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          description: string;
          due_date: string | null;
          position: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          description?: string;
          due_date?: string | null;
          position?: number;
          created_by: string;
        };
        Update: {
          title?: string;
          description?: string;
          due_date?: string | null;
          position?: number;
        };
        Relationships: [Rel<"milestones_project_id_fkey", "project_id", "projects">];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          milestone_id: string | null;
          title: string;
          description: string;
          status: Database["public"]["Enums"]["task_status"];
          priority: Database["public"]["Enums"]["task_priority"];
          assignee_id: string | null;
          created_by: string;
          professor_deadline: string | null;
          personal_deadline: string | null;
          effective_deadline: string | null;
          requires_review: boolean;
          estimate_hours: number | null;
          source_remark_id: string | null;
          position: number;
          submitted_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          milestone_id?: string | null;
          title: string;
          description?: string;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["task_priority"];
          assignee_id?: string | null;
          created_by: string;
          professor_deadline?: string | null;
          personal_deadline?: string | null;
          requires_review?: boolean;
          estimate_hours?: number | null;
          source_remark_id?: string | null;
          position?: number;
        };
        Update: {
          milestone_id?: string | null;
          title?: string;
          description?: string;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: Database["public"]["Enums"]["task_priority"];
          assignee_id?: string | null;
          professor_deadline?: string | null;
          personal_deadline?: string | null;
          requires_review?: boolean;
          estimate_hours?: number | null;
          position?: number;
        };
        Relationships: [
          Rel<"tasks_project_id_fkey", "project_id", "projects">,
          Rel<"tasks_milestone_id_fkey", "milestone_id", "milestones">,
          Rel<"tasks_assignee_id_fkey", "assignee_id", "profiles">,
          Rel<"tasks_created_by_fkey", "created_by", "profiles">,
          Rel<"tasks_source_remark_fk", "source_remark_id", "remarks">,
        ];
      };
      task_dependencies: {
        Row: { task_id: string; depends_on_id: string; created_at: string };
        Insert: { task_id: string; depends_on_id: string; created_at?: string };
        Update: { task_id?: string; depends_on_id?: string };
        Relationships: [
          Rel<"task_dependencies_task_id_fkey", "task_id", "tasks">,
          Rel<"task_dependencies_depends_on_id_fkey", "depends_on_id", "tasks">,
        ];
      };
      deadline_changes: {
        Row: {
          id: number;
          task_id: string;
          project_id: string;
          field: Database["public"]["Enums"]["deadline_field"];
          old_value: string | null;
          new_value: string | null;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: {
          task_id: string;
          project_id: string;
          field: Database["public"]["Enums"]["deadline_field"];
          old_value?: string | null;
          new_value?: string | null;
          changed_by?: string | null;
        };
        Update: { old_value?: string | null; new_value?: string | null };
        Relationships: [
          Rel<"deadline_changes_task_id_fkey", "task_id", "tasks">,
          Rel<"deadline_changes_changed_by_fkey", "changed_by", "profiles">,
        ];
      };
      progress_logs: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          log_date: string;
          completed_work: string;
          problems: string;
          next_steps: string;
          minutes_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          log_date: string;
          completed_work: string;
          problems?: string;
          next_steps?: string;
          minutes_spent?: number;
        };
        Update: {
          completed_work?: string;
          problems?: string;
          next_steps?: string;
          minutes_spent?: number;
        };
        Relationships: [
          Rel<"progress_logs_project_id_fkey", "project_id", "projects">,
          Rel<"progress_logs_author_id_fkey", "author_id", "profiles">,
        ];
      };
      progress_log_tasks: {
        Row: { log_id: string; task_id: string };
        Insert: { log_id: string; task_id: string };
        Update: { log_id?: string; task_id?: string };
        Relationships: [
          Rel<"progress_log_tasks_log_id_fkey", "log_id", "progress_logs">,
          Rel<"progress_log_tasks_task_id_fkey", "task_id", "tasks">,
        ];
      };
      remarks: {
        Row: {
          id: string;
          project_id: string;
          task_id: string | null;
          progress_log_id: string | null;
          parent_id: string | null;
          author_id: string;
          kind: Database["public"]["Enums"]["remark_kind"];
          source: Database["public"]["Enums"]["remark_source"];
          body: string;
          addressed_at: string | null;
          addressed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_id?: string | null;
          progress_log_id?: string | null;
          parent_id?: string | null;
          author_id: string;
          kind?: Database["public"]["Enums"]["remark_kind"];
          source?: Database["public"]["Enums"]["remark_source"];
          body: string;
        };
        Update: { addressed_at?: string | null };
        Relationships: [
          Rel<"remarks_project_id_fkey", "project_id", "projects">,
          Rel<"remarks_task_id_fkey", "task_id", "tasks">,
          Rel<"remarks_progress_log_id_fkey", "progress_log_id", "progress_logs">,
          Rel<"remarks_parent_id_fkey", "parent_id", "remarks">,
          Rel<"remarks_author_id_fkey", "author_id", "profiles">,
          Rel<"remarks_addressed_by_fkey", "addressed_by", "profiles">,
        ];
      };
      attachments: {
        Row: {
          id: string;
          project_id: string;
          uploader_id: string;
          kind: Database["public"]["Enums"]["attachment_kind"];
          name: string;
          storage_path: string | null;
          url: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          task_id: string | null;
          progress_log_id: string | null;
          remark_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          uploader_id: string;
          kind: Database["public"]["Enums"]["attachment_kind"];
          name: string;
          storage_path?: string | null;
          url?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          task_id?: string | null;
          progress_log_id?: string | null;
          remark_id?: string | null;
        };
        Update: {
          name?: string;
          task_id?: string | null;
          progress_log_id?: string | null;
          remark_id?: string | null;
        };
        Relationships: [
          Rel<"attachments_project_id_fkey", "project_id", "projects">,
          Rel<"attachments_uploader_id_fkey", "uploader_id", "profiles">,
          Rel<"attachments_task_id_fkey", "task_id", "tasks">,
          Rel<"attachments_progress_log_id_fkey", "progress_log_id", "progress_logs">,
        ];
      };
      blockers: {
        Row: {
          id: string;
          project_id: string;
          task_id: string | null;
          raised_by: string;
          title: string;
          description: string;
          severity: Database["public"]["Enums"]["blocker_severity"];
          needs_professor: boolean;
          status: Database["public"]["Enums"]["blocker_status"];
          resolution: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_id?: string | null;
          raised_by: string;
          title: string;
          description?: string;
          severity?: Database["public"]["Enums"]["blocker_severity"];
          needs_professor?: boolean;
        };
        Update: {
          title?: string;
          description?: string;
          severity?: Database["public"]["Enums"]["blocker_severity"];
          needs_professor?: boolean;
          status?: Database["public"]["Enums"]["blocker_status"];
          resolution?: string | null;
          task_id?: string | null;
        };
        Relationships: [
          Rel<"blockers_project_id_fkey", "project_id", "projects">,
          Rel<"blockers_task_id_fkey", "task_id", "tasks">,
          Rel<"blockers_raised_by_fkey", "raised_by", "profiles">,
          Rel<"blockers_resolved_by_fkey", "resolved_by", "profiles">,
        ];
      };
      decisions: {
        Row: {
          id: string;
          project_id: string;
          author_id: string;
          title: string;
          context: string;
          decision: string;
          alternatives: string;
          decided_on: string;
          superseded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          author_id: string;
          title: string;
          context?: string;
          decision: string;
          alternatives?: string;
          decided_on?: string;
        };
        Update: { superseded_by?: string | null };
        Relationships: [
          Rel<"decisions_project_id_fkey", "project_id", "projects">,
          Rel<"decisions_author_id_fkey", "author_id", "profiles">,
          Rel<"decisions_superseded_by_fkey", "superseded_by", "decisions">,
        ];
      };
      weekly_reports: {
        Row: {
          id: string;
          student_id: string;
          week_start: string;
          stats: Json;
          highlights: string;
          student_note: string;
          submitted_at: string | null;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          share_enabled: boolean;
          share_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          week_start: string;
          stats?: Json;
          highlights?: string;
          student_note?: string;
          submitted_at?: string | null;
        };
        Update: {
          stats?: Json;
          highlights?: string;
          student_note?: string;
          submitted_at?: string | null;
          acknowledged_at?: string | null;
          share_enabled?: boolean;
          share_token?: string;
        };
        Relationships: [
          Rel<"weekly_reports_student_id_fkey", "student_id", "profiles">,
          Rel<"weekly_reports_acknowledged_by_fkey", "acknowledged_by", "profiles">,
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string;
        };
        Update: { user_agent?: string };
        Relationships: [Rel<"push_subscriptions_user_id_fkey", "user_id", "profiles">];
      };
      extension_requests: {
        Row: {
          id: string;
          project_id: string;
          task_id: string;
          requested_by: string;
          current_deadline: string | null;
          proposed_deadline: string;
          reason: string;
          status: Database["public"]["Enums"]["extension_status"];
          response: string | null;
          decided_by: string | null;
          decided_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_id: string;
          requested_by: string;
          proposed_deadline: string;
          reason: string;
        };
        Update: { status?: Database["public"]["Enums"]["extension_status"] };
        Relationships: [
          Rel<"extension_requests_project_id_fkey", "project_id", "projects">,
          Rel<"extension_requests_task_id_fkey", "task_id", "tasks">,
          Rel<"extension_requests_requested_by_fkey", "requested_by", "profiles">,
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_project: {
        Args: {
          p_title: string;
          p_description?: string;
          p_start_date?: string;
          p_target_end_date?: string | null;
          p_member_ids?: string[];
        };
        Returns: string;
      };
      add_project_member: { Args: { p_project: string; p_user: string }; Returns: undefined };
      join_professor: { Args: { p_code: string }; Returns: string };
      regenerate_join_code: { Args: Record<string, never>; Returns: string };
      review_task: { Args: { p_task: string; p_approve: boolean; p_comment?: string }; Returns: undefined };
      convert_remark_to_task: {
        Args: {
          p_remark: string;
          p_title: string;
          p_description?: string;
          p_priority?: Database["public"]["Enums"]["task_priority"];
          p_personal_deadline?: string | null;
        };
        Returns: string;
      };
      get_shared_report: { Args: { p_token: string }; Returns: Json };
      respond_extension: { Args: { p_request: string; p_approve: boolean; p_response?: string }; Returns: undefined };
      linked_people: {
        Args: Record<string, never>;
        Returns: { id: string; full_name: string; role: Database["public"]["Enums"]["user_role"] }[];
      };
    };
    Enums: {
      user_role: "student" | "professor";
      project_status: "active" | "on_hold" | "completed" | "archived";
      task_status: "todo" | "in_progress" | "in_review" | "changes_requested" | "done";
      task_priority: "low" | "medium" | "high" | "urgent";
      remark_kind: "comment" | "change_request" | "question" | "approval";
      remark_source: "app" | "meeting";
      blocker_severity: "low" | "medium" | "high";
      blocker_status: "open" | "resolved";
      attachment_kind: "file" | "link";
      deadline_field: "professor" | "personal";
      extension_status: "pending" | "approved" | "declined";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type Project = Tables<"projects">;
export type ProjectMember = Tables<"project_members">;
export type Milestone = Tables<"milestones">;
export type Task = Tables<"tasks">;
export type TaskDependency = Tables<"task_dependencies">;
export type DeadlineChange = Tables<"deadline_changes">;
export type ProgressLog = Tables<"progress_logs">;
export type Remark = Tables<"remarks">;
export type Attachment = Tables<"attachments">;
export type Blocker = Tables<"blockers">;
export type Decision = Tables<"decisions">;
export type WeeklyReport = Tables<"weekly_reports">;
export type ExtensionRequest = Tables<"extension_requests">;

export type UserRole = Enums<"user_role">;
export type TaskStatus = Enums<"task_status">;
export type TaskPriority = Enums<"task_priority">;
export type RemarkKind = Enums<"remark_kind">;
export type ProjectStatus = Enums<"project_status">;
export type BlockerSeverity = Enums<"blocker_severity">;
