import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} linkError={error === "link"} />;
}
