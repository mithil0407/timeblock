import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// GET /api/notifications - List notifications
export async function GET(request: NextRequest) {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get("unread") === "true";

    let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

    if (unreadOnly) {
        query = query.eq("is_read", false);
    }

    const { data: notifications, error } = await query;

    if (error) {
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }

    return NextResponse.json({ notifications });
}
