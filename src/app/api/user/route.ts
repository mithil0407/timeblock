import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

// GET /api/user - Get current user
export async function GET() {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: user, error } = await supabase
        .from("users")
        .select("id, email, has_completed_onboarding, created_at")
        .eq("email", email)
        .single();

    if (error || !user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
        user: {
            id: user.id,
            email: user.email,
            hasCompletedOnboarding: user.has_completed_onboarding,
            hasGoogleCalendar: true, // They authenticated with Google
        },
    });
}

// POST /api/user/logout - Logout
export async function POST() {
    const cookieStore = await cookies();
    cookieStore.delete("tb_email");

    return NextResponse.json({ success: true });
}
