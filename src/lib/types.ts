export interface User {
    id: string;
    email: string;
    google_calendar_id: string | null;
    google_refresh_token: string | null;
    google_access_token: string | null;
    google_token_expiry: string | null;
    created_at: string;
    updated_at: string;
}

export interface UserMemory {
    id: string;
    user_id: string;
    memory_type: "task_duration" | "energy_levels" | "task_energy" | "preferences" | "working_hours";
    key: string;
    value: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Task {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    estimated_duration_minutes: number;
    actual_duration_minutes: number | null;
    priority: number;
    deadline: string | null;
    scheduled_start: string | null;
    scheduled_end: string | null;
    status: "scheduled" | "in_progress" | "completed" | "cancelled";
    google_calendar_event_id: string | null;
    task_category: string | null;
    energy_requirement: "high" | "medium" | "low" | null;
    context: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface ScheduleChange {
    id: string;
    user_id: string;
    trigger_type: "task_added" | "task_completed_early" | "priority_changed" | "deadline_changed" | "task_deleted";
    trigger_task_id: string | null;
    changes_made: Array<{
        taskId: string;
        previousStart?: string;
        previousEnd?: string;
        newStart?: string;
        newEnd?: string;
        action: "created" | "updated" | "deleted";
    }>;
    ai_reasoning: string | null;
    created_at: string;
}

export interface Notification {
    id: string;
    user_id: string;
    type: "schedule_updated" | "task_blocked" | "conflict_detected" | "working_hours_extended";
    title: string;
    message: string;
    related_task_id: string | null;
    is_read: boolean;
    created_at: string;
}

// Memory value types
export interface TaskDurationMemory {
    average_minutes: number;
    sample_count: number;
    last_updated: string;
}

export interface EnergyLevelMemory {
    level: "high" | "medium" | "low";
    suitable_for: string[];
}

export interface TaskEnergyMemory {
    energy_requirement: "high" | "medium" | "low";
    task_category: string;
}

export interface WorkingHoursMemory {
    start: number; // Hour (0-23)
    end: number;   // Hour (0-23)
    days: number[]; // Day of week (0-6, Sunday-Saturday)
    max_extension_hours: number;
}

export interface PreferencesMemory {
    break_duration_minutes: number;
    break_frequency_hours: number;
    buffer_between_tasks_minutes: number;
    timezone: string;
}

// API request/response types
export interface CreateTaskRequest {
    input: string;
    deadline?: string;
    context?: string;
}

export interface CreateTaskResponse {
    task: Task;
    notification: {
        message: string;
    };
}

export interface UpdateTaskRequest {
    status?: Task["status"];
    priority?: number;
    deadline?: string;
    scheduled_start?: string;
    scheduled_end?: string;
}
