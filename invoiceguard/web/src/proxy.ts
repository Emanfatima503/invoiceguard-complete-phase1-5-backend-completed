import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// Refreshes the Supabase session cookie and sends logged-out visitors to /login.
// Real protection is Row Level Security in the database; this is the UX layer.
export async function proxy(req: NextRequest) {
  if (!URL_ || !KEY) return NextResponse.next(); // preview mode, no auth yet

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await sb.auth.getUser();
  const isProcessApi = req.nextUrl.pathname.startsWith("/api/invoices/process");
  const onLogin = req.nextUrl.pathname.startsWith("/login");
  if (!data.user && !onLogin && !isProcessApi) {
  return NextResponse.redirect(new URL("/login", req.url));
}
  if (data.user && onLogin) return NextResponse.redirect(new URL("/dashboard", req.url));
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)"],
};
