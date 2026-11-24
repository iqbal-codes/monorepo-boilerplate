import { Button } from "@monorepo-boilerplate/ui/components/button";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import { Form, useAppForm } from "@monorepo-boilerplate/ui/components/form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onChange: signInSchema,
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({ to: "/dashboard" });
            toast.success("Sign in successful");
          },
          onError: (error) => {
            const message = error.error.message || error.error.statusText || "Sign in failed.";
            setServerError(message);
            toast.error(message);
          },
        },
      );
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 id="sign-in-heading" className="mb-6 text-center text-3xl font-bold">
        Welcome Back
      </h1>

      <Form form={form} aria-labelledby="sign-in-heading">
        <form.FormError error={serverError} title="Sign in failed" />

        <FieldGroup className="gap-4">
          <form.AppField name="email">
            {(field) => (
              <field.TextField
                label="Email"
                type="email"
                autoComplete="username"
                enterKeyHint="next"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="password">
            {(field) => (
              <field.PasswordField
                label="Password"
                autoComplete="current-password"
                enterKeyHint="done"
                required
              />
            )}
          </form.AppField>
        </FieldGroup>

        <form.SubmitButton className="w-full" loadingLabel="Signing in…">
          Sign In
        </form.SubmitButton>
      </Form>

      <div className="mt-4 text-center">
        <Button type="button" variant="link" onClick={onSwitchToSignUp}>
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
