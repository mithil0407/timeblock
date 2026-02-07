import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrCreateUserByEmail } from "@/lib/supabase/user";
import { cookies } from "next/headers";

export const runtime = "nodejs";

// POST /api/user/onboarding - Mark onboarding as complete
export async function POST() {
    const supabase = createAdminClient();
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (!email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrCreateUserByEmail(email);
    const { error } = await supabase
        .from("users")
        .update({ has_completed_onboarding: true })
        .eq("id", user.id);

    if (error) {
        console.error("Error updating onboarding status:", error);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
