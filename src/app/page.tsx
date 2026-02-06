import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function HomePage() {
    // Check if user is authenticated
    const cookieStore = await cookies();
    const email = cookieStore.get("tb_email")?.value;

    if (email) {
        // Verify user still exists
        const supabase = await createClient();
        const { data: user } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

        if (user) {
            redirect("/dashboard");
        }
    }

    redirect("/login");
}
