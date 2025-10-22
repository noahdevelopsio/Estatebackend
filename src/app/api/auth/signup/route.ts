import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabaseServer";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  phone: z.string().min(10),
  role: z.enum(["tenant", "landlord", "admin", "maintenance", "accountant"]),
});

export async function POST(req: Request) {
  const supabaseAuth = await createClient();
  const body = await req.json();
  const validated = signupSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.issues[0].message },
      { status: 400 },
    );
  }

  const { email, password, full_name, phone, role } = validated.data;

  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      data: { full_name, phone, role },
    },
  });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, user: data.user });
}
