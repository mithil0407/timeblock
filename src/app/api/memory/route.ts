import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrCreateUserByEmail } from "@/lib/supabase/user";
import { cookies } from "next/headers";

// GET /api/memory - Get user memory
export async function GET() {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUserByEmail(email);

    const { data: memory, error } = await supabase
        .from("user_memory")
        .select("*")
        .eq("user_id", user.id);

    if (error) {
        console.error("Error fetching memory:", error);
        return NextResponse.json({ error: "Failed to fetch memory" }, { status: 500 });
    }

    // Transform into structured format
    const structured = {
        energyLevels: {} as Record<string, unknown>,
        taskDurations: {} as Record<string, unknown>,
        workingHours: { start: 9, end: 18, maxExtension: 3 },
        preferences: {} as Record<string, unknown>,
    };

    for (const mem of memory || []) {
        switch (mem.memory_type) {
            case "energy_levels":
                structured.energyLevels[mem.key] = mem.value;
                break;
            case "task_duration":
                structured.taskDurations[mem.key] = mem.value;
                break;
            case "working_hours":
                structured.workingHours = mem.value as typeof structured.workingHours;
                break;
            case "preferences":
                structured.preferences[mem.key] = mem.value;
                break;
        }
    }

    return NextResponse.json(structured);
}

// PUT /api/memory - Update user memory
export async function PUT(request: NextRequest) {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUserByEmail(email);

    try {
        const body = await request.json();
        const { memoryType, key, value } = body;

        if (!memoryType || !key || value === undefined) {
            return NextResponse.json(
                { error: "memoryType, key, and value are required" },
                { status: 400 }
            );
        }

        // Upsert memory
        const { error } = await supabase.from("user_memory").upsert(
            {
                user_id: user.id,
                memory_type: memoryType,
                key,
                value,
            },
            { onConflict: "user_id,memory_type,key" }
        );

        if (error) {
            console.error("Error updating memory:", error);
            return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Error updating memory:", err);
        return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
    }
}
