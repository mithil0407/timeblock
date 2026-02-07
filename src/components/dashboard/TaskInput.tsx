"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskInputProps {
    onSubmit: (input: string, options?: { deadline?: string; context?: string }) => Promise<void>;
    isLoading: boolean;
}

export function TaskInput({ onSubmit, isLoading }: TaskInputProps) {
    const [input, setInput] = useState("");
    const [showDetails, setShowDetails] = useState(false);
    const [deadline, setDeadline] = useState("");
    const [context, setContext] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        await onSubmit(input.trim(), {
            deadline: deadline || undefined,
            context: context || undefined,
        });

        setInput("");
        setDeadline("");
        setContext("");
        setShowDetails(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            if (e.ctrlKey || e.metaKey) {
                setShowDetails(!showDetails);
            } else if (!showDetails) {
                handleSubmit(e);
            }
        }
    };

    return (
        <div className="bg-card rounded-xl border shadow-sm p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
                {/* Main input */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="What do you need to do? (Use ';' or commas for multiple tasks)"
                            className="h-12 text-base pr-10"
                            disabled={isLoading}
                        />
                        <button
                            type="button"
                            onClick={() => setShowDetails(!showDetails)}
                            className={cn(
                                "absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors",
                                showDetails && "text-primary"
                            )}
                        >
                            {showDetails ? (
                                <ChevronUp className="w-4 h-4" />
                            ) : (
                                <ChevronDown className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                    <Button type="submit" size="lg" disabled={!input.trim() || isLoading}>
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Plus className="w-5 h-5" />
                        )}
                    </Button>
                </div>

                {/* Expanded details */}
                {showDetails && (
                    <div className="grid gap-3 pt-2 border-t animate-slide-in">
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Deadline (optional)
                                </label>
                                <Input
                                    type="datetime-local"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    className="h-10"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm text-muted-foreground">
                                    Additional context (optional)
                                </label>
                                <Input
                                    value={context}
                                    onChange={(e) => setContext(e.target.value)}
                                    placeholder="Any extra details..."
                                    className="h-10"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">Enter</kbd> to add task,
                            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono ml-1">⌘+Enter</kbd> to toggle details
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Tip: add multiple tasks in one line using <kbd className="px-1 py-0.5 bg-muted rounded text-xs font-mono">;</kbd> or commas.
                        </p>
                    </div>
                )}
            </form>
        </div>
    );
}
