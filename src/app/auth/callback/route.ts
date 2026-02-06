import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokensFromCode } from "@/lib/google-auth";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
        console.error("OAuth error:", error);
        return NextResponse.redirect(new URL("/login?error=oauth_error", request.url));
    }

    if (!code) {
        return NextResponse.redirect(new URL("/login?error=no_code", request.url));
    }

    try {
        // Exchange code for tokens
        const tokens = await getTokensFromCode(code);

        if (!tokens.access_token) {
            throw new Error("No access token received");
        }

        // Get user info from Google
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        if (!userInfo.email) {
            throw new Error("No email received from Google");
        }

        // Create or update user in Supabase
        const supabase = await createClient();

        // Sign in with Supabase using Google OAuth
        // Since we're doing manual OAuth, we'll create a magic link session
        // For now, let's use a different approach - directly create/update the user

        // Check if user exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("id, has_completed_onboarding")
            .eq("email", userInfo.email)
            .single();

        let isNewUser = false;
        let hasCompletedOnboarding = false;

        if (existingUser) {
            // Update existing user with new tokens
            await supabase
                .from("users")
                .update({
                    google_access_token: tokens.access_token,
                    google_refresh_token: tokens.refresh_token || undefined,
                    google_token_expiry: tokens.expiry_date
                        ? new Date(tokens.expiry_date).toISOString()
                        : null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", existingUser.id);
            hasCompletedOnboarding = existingUser.has_completed_onboarding || false;
        } else {
            // Create new user
            await supabase.from("users").insert({
                email: userInfo.email,
                google_access_token: tokens.access_token,
                google_refresh_token: tokens.refresh_token,
                google_token_expiry: tokens.expiry_date
                    ? new Date(tokens.expiry_date).toISOString()
                    : null,
            });
            isNewUser = true;
        }

        // Sign in with Supabase Auth
        const { error: signInError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
            },
        });

        if (signInError) {
            console.error("Supabase sign in error:", signInError);
            // Continue anyway - we have the user data
        }

        // Set a cookie to indicate authenticated state
        // Redirect new users or those who haven't completed onboarding
        const redirectPath = (isNewUser || !hasCompletedOnboarding) ? "/onboarding" : "/dashboard";
        const response = NextResponse.redirect(new URL(redirectPath, request.url));
        response.cookies.set("tb_email", userInfo.email, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
    } catch (err) {
        console.error("Auth callback error:", err);
        return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
    }
}
