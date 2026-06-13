"use client";

/**
 * HeaderAuthClient — resolves auth + role in the browser so the persistent shell
 * reads no cookies and stays static/instant (public pages can prerender).
 *
 * Renders the auth-dependent header cells: the wordmark (admin tint), the desktop
 * auth cluster (AccountMenu / SignInLink), and the mobile drawer. Until auth
 * resolves it renders the wordmark (text is identical for everyone) plus a
 * fixed-size invisible placeholder in the control cell — no layout shift, no
 * wrong-state flash. Resolution uses `getSession()` (the local cookie read; NOT
 * `getClaims`/`getUser`, which can hit the network on HS256 projects) plus
 * `onAuthStateChange`. All state writes happen in async callbacks, never
 * synchronously in the effect body, so the repo's set-state-in-effect ban holds.
 *
 * Security note: this controls only DISPLAY. The account/admin layouts keep their
 * server-side auth gates/redirects, and the mobile badge counts come from an
 * admin-gated server action — a tampered client can't surface protected data.
 */

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchAttentionCounts } from "@/features/admin";
import { AccountMenu } from "./account-menu";
import { SiteNavMobile } from "./site-nav";
import { SignInLink } from "@/components/layout/sign-in-link";
import { Wordmark } from "@/components/layout/wordmark";
import type { NavItem, NavBadges } from "@/components/layout/nav-config";

interface ResolvedAuth {
  isSignedIn: boolean;
  isAdmin: boolean;
  email: string | null;
  fullName: string | null;
}

export function HeaderAuthClient({ navLinks }: { navLinks: NavItem[] }) {
  const [auth, setAuth] = useState<ResolvedAuth | null>(null);
  const [navBadges, setNavBadges] = useState<NavBadges | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Fetch role + admin badges. Kept OUT of the auth-state callback below:
    // awaiting a Supabase call inside an onAuthStateChange handler deadlocks the
    // auth client's lock (the `.from()` query needs the same lock to attach the
    // token), which left the control stuck on its placeholder.
    const loadRole = (userId: string, email: string | null) => {
      void supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", userId)
        .single()
        .then(({ data: profile }) => {
          if (!active) return;
          const isAdmin = profile?.role === "admin";
          setAuth({
            isSignedIn: true,
            isAdmin,
            email,
            fullName: (profile?.full_name as string | null) ?? null,
          });
          if (isAdmin) {
            fetchAttentionCounts()
              .then((counts) => {
                if (!active) return;
                setNavBadges({
                  "/admin/bookings": {
                    count: counts.pendingApprovals,
                    label: "awaiting approval",
                  },
                  "/admin/inquiries": {
                    count: counts.newInquiries,
                    label: "new",
                  },
                });
              })
              .catch(() => {
                /* badges are best-effort; ignore failures */
              });
          }
        });
    };

    // Synchronous: set the signed-in/out state immediately so the control
    // renders without waiting on (or blocking) the role query.
    const apply = (session: Session | null) => {
      if (!active) return;
      if (!session?.user) {
        setAuth({
          isSignedIn: false,
          isAdmin: false,
          email: null,
          fullName: null,
        });
        setNavBadges(undefined);
        return;
      }
      // Show the account control right away; admin tint / name / badges refine
      // once loadRole resolves.
      setAuth({
        isSignedIn: true,
        isAdmin: false,
        email: session.user.email ?? null,
        fullName: null,
      });
      loadRole(session.user.id, session.user.email ?? null);
    };

    // getSession() reads the local cookie (no network on HS256). onAuthStateChange
    // keeps the header in sync with sign-in/out within the session.
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => apply(session));

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const resolved = auth !== null;
  const isAdmin = auth?.isAdmin ?? false;

  return (
    <>
      {/* col 1: wordmark — tint depends on role. Until resolved, isAdmin is
          undefined so it falls back to the optimistic admin hint. */}
      <div className="col-start-1 row-start-1 min-w-0 justify-self-start">
        <Wordmark isAdmin={resolved ? isAdmin : undefined} />
      </div>

      {/* col 3: desktop auth cluster + mobile drawer; reserved space until resolved */}
      <div className="col-start-3 row-start-1 flex items-center justify-end">
        {resolved && auth ? (
          <>
            <div className="hidden lg:block">
              <div className="flex items-center gap-5 text-sm">
                {auth.isSignedIn ? (
                  <AccountMenu fullName={auth.fullName} email={auth.email} />
                ) : (
                  <SignInLink />
                )}
              </div>
            </div>
            <div className="lg:hidden">
              <SiteNavMobile
                links={navLinks}
                navBadges={navBadges}
                isSignedIn={auth.isSignedIn}
                isAdmin={isAdmin}
              />
            </div>
          </>
        ) : (
          // Disc / burger footprint reserved so the control fills in without CLS.
          <div aria-hidden="true" className="size-11" />
        )}
      </div>
    </>
  );
}
