import { Button } from "@monorepo-boilerplate/ui/components/button";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import { Form, useAppForm } from "@monorepo-boilerplate/ui/components/form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export default function SignUpForm() {
  const navigate = useNavigate();
  const { isPending } = authClient.useSession();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onChange: signUpSchema,
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      setServerError(null);
      const { error } = await authClient.signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
      });

      if (error) {
        const message = error.message || error.statusText || "Sign up failed.";
        setServerError(message);
        toast.error(message);
        return;
      }

      toast.success("Sign up successful");
      await navigate({ to: "/dashboard" });
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 id="sign-up-heading" className="mb-6 text-center text-3xl font-bold">
        Create Account
      </h1>

      <Form form={form} aria-labelledby="sign-up-heading">
        <form.FormError error={serverError} title="Could not create account" />

        <FieldGroup className="gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField label="Full name" autoComplete="name" enterKeyHint="next" required />
            )}
          </form.AppField>

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
                description="Use at least 8 characters."
                autoComplete="new-password"
                enterKeyHint="done"
                required
              />
            )}
          </form.AppField>
        </FieldGroup>

        <form.SubmitButton className="w-full" loadingLabel="Creating account…">
          Create Account
        </form.SubmitButton>
      </Form>

      <div className="mt-4 text-center">
        <Button nativeButton={false} variant="link" render={<Link to="/sign-in" />}>
          Already have an account? Sign In
        </Button>
      </div>
    </div>
  );
}
