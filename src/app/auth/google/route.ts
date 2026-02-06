import { redirect } from "next/navigation";
import { getAuthUrl } from "@/lib/google-auth";

export async function GET() {
    const authUrl = getAuthUrl();
    redirect(authUrl);
}
