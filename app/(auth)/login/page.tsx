import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="display mb-2 text-5xl">
        Welcome <em>back.</em>
      </h1>
      <p className="mb-8 text-sm text-muted">Sign in to your product workspace.</p>
      <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />
    </>
  );
}
