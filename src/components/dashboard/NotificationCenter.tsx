"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Check, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

interface NotificationCenterProps {
    notifications: Notification[];
    unreadCount: number;
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
}

export function NotificationCenter({
    notifications,
    unreadCount,
    onMarkAsRead,
    onMarkAllAsRead,
}: NotificationCenterProps) {
    const [isOpen, setIsOpen] = useState(false);

    const getIcon = (type: string) => {
        switch (type) {
            case "schedule_updated":
                return <RefreshCw className="w-4 h-4 text-blue-500" />;
            case "task_blocked":
                return <Check className="w-4 h-4 text-green-500" />;
            case "conflict_detected":
                return <AlertTriangle className="w-4 h-4 text-orange-500" />;
            case "working_hours_extended":
                return <Clock className="w-4 h-4 text-purple-500" />;
            default:
                return <Bell className="w-4 h-4" />;
        }
    };

    const formatTime = (date: string) => {
        const d = new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return d.toLocaleDateString();
    };

    return (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <Badge
                            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
                            variant="default"
                        >
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="font-medium text-sm">Notifications</span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                                onMarkAllAsRead();
                            }}
                        >
                            Mark all read
                        </Button>
                    )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            No notifications
                        </div>
                    ) : (
                        notifications.slice(0, 10).map((notification) => (
                            <DropdownMenuItem
                                key={notification.id}
                                className={cn(
                                    "flex items-start gap-3 p-3 cursor-pointer",
                                    !notification.is_read && "bg-blue-50/50"
                                )}
                                onClick={() => {
                                    if (!notification.is_read) {
                                        onMarkAsRead(notification.id);
                                    }
                                }}
                            >
                                <div className="mt-0.5">{getIcon(notification.type)}</div>
                                <div className="flex-1 space-y-1">
                                    <p className="text-sm font-medium leading-tight">
                                        {notification.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {notification.message}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {formatTime(notification.created_at)}
                                    </p>
                                </div>
                                {!notification.is_read && (
                                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1" />
                                )}
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
