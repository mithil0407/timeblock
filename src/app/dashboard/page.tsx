"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TaskInput, TaskList, CalendarView, NotificationCenter } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { useTaskStore, useNotificationStore, useUserStore, useMemoryStore } from "@/lib/store";
import { LogOut, CalendarDays, ListTodo, Loader2 } from "lucide-react";
import type { Task, Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
    const router = useRouter();
    const { toast } = useToast();

    // Stores
    const { tasks, setTasks, addTask, updateTask, removeTask, isLoading: tasksLoading, setLoading: setTasksLoading } = useTaskStore();
    const { notifications, unreadCount, setNotifications, markAsRead, markAllAsRead } = useNotificationStore();
    const { user, setUser, setLoading: setUserLoading, isLoading: userLoading } = useUserStore();
    const { memory, setMemory } = useMemoryStore();

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [view, setView] = useState<"list" | "calendar">("list");
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    // Fetch user data
    useEffect(() => {
        async function fetchUser() {
            try {
                const res = await fetch("/api/user");
                if (!res.ok) {
                    router.push("/login");
                    return;
                }
                const data = await res.json();
                setUser({
                    id: data.user.id,
                    email: data.user.email,
                    hasGoogleCalendar: data.user.hasGoogleCalendar,
                    hasCompletedOnboarding: data.user.hasCompletedOnboarding,
                });
            } catch {
                router.push("/login");
            }
        }
        fetchUser();
    }, [router, setUser]);

    // Fetch tasks
    useEffect(() => {
        if (!user) return;

        async function fetchTasks() {
            setTasksLoading(true);
            try {
                const date = new Date().toISOString().split("T")[0];
                const res = await fetch(`/api/tasks?date=${date}`);
                if (res.ok) {
                    const data = await res.json();
                    setTasks(data.tasks);
                }
            } catch (err) {
                console.error("Failed to fetch tasks:", err);
            } finally {
                setTasksLoading(false);
            }
        }
        fetchTasks();
    }, [user, setTasks, setTasksLoading]);

    // Fetch notifications
    useEffect(() => {
        if (!user) return;

        async function fetchNotifications() {
            try {
                const res = await fetch("/api/notifications");
                if (res.ok) {
                    const data = await res.json();
                    setNotifications(data.notifications);
                }
            } catch (err) {
                console.error("Failed to fetch notifications:", err);
            }
        }
        fetchNotifications();
    }, [user, setNotifications]);

    // Fetch memory
    useEffect(() => {
        if (!user) return;

        async function fetchMemory() {
            try {
                const res = await fetch("/api/memory");
                if (res.ok) {
                    const data = await res.json();
                    setMemory(data);
                }
            } catch (err) {
                console.error("Failed to fetch memory:", err);
            }
        }
        fetchMemory();
    }, [user, setMemory]);

    // Handlers
    const handleSubmit = useCallback(async (input: string, options?: { deadline?: string; context?: string }) => {
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input,
                    deadline: options?.deadline,
                    context: options?.context,
                }),
            });

            if (!res.ok) {
                throw new Error("Failed to create task");
            }

            const data = await res.json();
            addTask(data.task as Task);

            toast({
                title: "Task Created",
                description: data.notification.message,
                variant: "success",
            });
        } catch (err) {
            console.error("Failed to create task:", err);
            toast({
                title: "Error",
                description: "Failed to create task. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }, [addTask, toast]);

    const handleComplete = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/tasks/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "completed" }),
            });

            if (!res.ok) throw new Error("Failed to update task");

            const data = await res.json();
            updateTask(id, data.task);

            toast({
                title: "Task Completed!",
                description: "Great job! Your schedule has been updated.",
                variant: "success",
            });
        } catch (err) {
            console.error("Failed to complete task:", err);
            toast({
                title: "Error",
                description: "Failed to complete task.",
                variant: "destructive",
            });
        }
    }, [updateTask, toast]);

    const handleDelete = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete task");

            removeTask(id);
            toast({
                title: "Task Deleted",
                description: "The task has been removed from your schedule.",
            });
        } catch (err) {
            console.error("Failed to delete task:", err);
            toast({
                title: "Error",
                description: "Failed to delete task.",
                variant: "destructive",
            });
        }
    }, [removeTask, toast]);

    const handlePriorityChange = useCallback(async (id: string, priority: number) => {
        try {
            const res = await fetch(`/api/tasks/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ priority }),
            });

            if (!res.ok) throw new Error("Failed to update priority");

            const data = await res.json();
            updateTask(id, data.task);
        } catch (err) {
            console.error("Failed to update priority:", err);
            toast({
                title: "Error",
                description: "Failed to update priority.",
                variant: "destructive",
            });
        }
    }, [updateTask, toast]);

    const handleMarkAsRead = useCallback(async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
            markAsRead(id);
        } catch (err) {
            console.error("Failed to mark notification as read:", err);
        }
    }, [markAsRead]);

    const handleMarkAllAsRead = useCallback(async () => {
        // Mark all unread as read
        const unread = notifications.filter(n => !n.is_read);
        for (const n of unread) {
            await fetch(`/api/notifications/${n.id}/read`, { method: "PATCH" });
        }
        markAllAsRead();
    }, [notifications, markAllAsRead]);

    const handleLogout = useCallback(async () => {
        await fetch("/api/user", { method: "POST" });
        router.push("/login");
    }, [router]);

    // Loading state
    if (userLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                            <CalendarDays className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="font-semibold text-lg leading-tight">TimeBlock AI</h1>
                            <p className="text-xs text-muted-foreground">{today}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View toggle */}
                        <div className="flex bg-muted rounded-lg p-1">
                            <Button
                                variant={view === "list" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-8"
                                onClick={() => setView("list")}
                            >
                                <ListTodo className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={view === "calendar" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-8"
                                onClick={() => setView("calendar")}
                            >
                                <CalendarDays className="w-4 h-4" />
                            </Button>
                        </div>

                        <NotificationCenter
                            notifications={notifications as Notification[]}
                            unreadCount={unreadCount}
                            onMarkAsRead={handleMarkAsRead}
                            onMarkAllAsRead={handleMarkAllAsRead}
                        />

                        <Button variant="ghost" size="icon" onClick={handleLogout}>
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="max-w-6xl mx-auto px-4 py-6">
                <div className={cn(
                    "grid gap-6",
                    view === "calendar" ? "lg:grid-cols-[1fr,400px]" : ""
                )}>
                    {/* Task input & list */}
                    <div className="space-y-6">
                        <TaskInput onSubmit={handleSubmit} isLoading={isSubmitting} />

                        {tasksLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <TaskList
                                tasks={tasks as Task[]}
                                onComplete={handleComplete}
                                onDelete={handleDelete}
                                onPriorityChange={handlePriorityChange}
                            />
                        )}
                    </div>

                    {/* Calendar view (side panel on large screens) */}
                    {view === "calendar" && (
                        <div className="hidden lg:block h-[calc(100vh-140px)] sticky top-[88px]">
                            <CalendarView
                                tasks={tasks as Task[]}
                                workingHours={memory?.workingHours}
                                energyLevels={memory?.energyLevels}
                            />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
