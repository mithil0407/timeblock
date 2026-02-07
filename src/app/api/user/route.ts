import { NextResponse } from "next/server";
import { getOrCreateUserByEmail } from "@/lib/supabase/user";
import { cookies } from "next/headers";

// GET /api/user - Get current user
export async function GET() {
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const user = await getOrCreateUserByEmail(email);

        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                hasCompletedOnboarding: user.has_completed_onboarding,
                hasGoogleCalendar: true, // They authenticated with Google
            },
        });
    } catch (error) {
        console.error("Failed to load user:", error);
        return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
}

// POST /api/user/logout - Logout
export async function POST() {
    const cookieStore = await cookies();
    cookieStore.delete("tb_email");

    return NextResponse.json({ success: true });
}
