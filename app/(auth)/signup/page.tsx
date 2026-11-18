import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Start free" };

export default function SignupPage() {
  return (
    <>
      <h1 className="display mb-2 text-5xl">
        Start <em>free.</em>
      </h1>
      <p className="mb-8 text-sm text-muted">Create your account, then set up your organisation in two minutes.</p>
      <AuthForm mode="signup" />
    </>
  );
}
