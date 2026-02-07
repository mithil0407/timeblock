import { createAdminClient } from "@/lib/supabase/server";

export async function getOrCreateUserByEmail(email: string) {
    const supabase = createAdminClient();

    const { data: existing, error } = await supabase
        .from("users")
        .select("id, email, has_completed_onboarding, created_at")
        .eq("email", email)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (existing) {
        return existing;
    }

    const { data: created, error: insertError } = await supabase
        .from("users")
        .insert({ email })
        .select("id, email, has_completed_onboarding, created_at")
        .single();

    if (insertError || !created) {
        throw insertError || new Error("Failed to create user");
    }

    return created;
}
