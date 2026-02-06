import { create } from "zustand";
import type { Task, Notification, UserMemory } from "./types";

interface TaskStore {
    tasks: Task[];
    isLoading: boolean;
    error: string | null;
    setTasks: (tasks: Task[]) => void;
    addTask: (task: Task) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    removeTask: (id: string) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
    tasks: [],
    isLoading: false,
    error: null,
    setTasks: (tasks) => set({ tasks }),
    addTask: (task) =>
        set((state) => ({
            tasks: [...state.tasks, task].sort((a, b) => {
                if (!a.scheduled_start) return 1;
                if (!b.scheduled_start) return -1;
                return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
            }),
        })),
    updateTask: (id, updates) =>
        set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
    removeTask: (id) =>
        set((state) => ({
            tasks: state.tasks.filter((t) => t.id !== id),
        })),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),
}));

interface NotificationStore {
    notifications: Notification[];
    unreadCount: number;
    setNotifications: (notifications: Notification[]) => void;
    addNotification: (notification: Notification) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
    notifications: [],
    unreadCount: 0,
    setNotifications: (notifications) =>
        set({
            notifications,
            unreadCount: notifications.filter((n) => !n.is_read).length,
        }),
    addNotification: (notification) =>
        set((state) => ({
            notifications: [notification, ...state.notifications],
            unreadCount: state.unreadCount + (notification.is_read ? 0 : 1),
        })),
    markAsRead: (id) =>
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, is_read: true } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - 1),
        })),
    markAllAsRead: () =>
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
            unreadCount: 0,
        })),
}));

interface MemoryStore {
    memory: UserMemory[];
    isLoading: boolean;
    setMemory: (memory: UserMemory[]) => void;
    updateMemory: (type: string, key: string, value: Record<string, unknown>) => void;
    setLoading: (loading: boolean) => void;
}

export const useMemoryStore = create<MemoryStore>((set) => ({
    memory: [],
    isLoading: false,
    setMemory: (memory) => set({ memory }),
    updateMemory: (type, key, value) =>
        set((state) => {
            const existingIndex = state.memory.findIndex(
                (m) => m.memory_type === type && m.key === key
            );
            if (existingIndex >= 0) {
                const newMemory = [...state.memory];
                newMemory[existingIndex] = {
                    ...newMemory[existingIndex],
                    value,
                    updated_at: new Date().toISOString(),
                };
                return { memory: newMemory };
            }
            return state;
        }),
    setLoading: (isLoading) => set({ isLoading }),
}));

interface UserStore {
    user: {
        id: string;
        email: string;
        hasGoogleCalendar: boolean;
        hasCompletedOnboarding: boolean;
    } | null;
    isLoading: boolean;
    setUser: (user: UserStore["user"]) => void;
    setLoading: (loading: boolean) => void;
    logout: () => void;
}

export const useUserStore = create<UserStore>((set) => ({
    user: null,
    isLoading: true,
    setUser: (user) => set({ user, isLoading: false }),
    setLoading: (isLoading) => set({ isLoading }),
    logout: () => set({ user: null, isLoading: false }),
}));
