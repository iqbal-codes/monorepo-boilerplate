import * as React from "react";
import { useStore } from "@tanstack/react-form";
import { cn } from "cn";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Progress } from "@monorepo-boilerplate/ui/components/progress";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

import { extractErrorMessages } from "./error-utils";
import { SubmitButton } from "./form-actions";
import { useFormContext } from "./form-context";

export type WizardStepConfig = {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Field names belonging to this step; validated before advancing with Next. */
  fields?: ReadonlyArray<string>;
  /** Optional custom async/sync step guard run on Next. Return `false` to block. */
  validate?: () => Promise<boolean> | boolean;
};

type WizardContextValue = {
  steps: ReadonlyArray<WizardStepConfig>;
  stepIndex: number;
  currentStep: WizardStepConfig;
  completedSteps: ReadonlySet<number>;
  highestVisited: number;
  isFirst: boolean;
  isLast: boolean;
  isValidating: boolean;
  next: () => Promise<boolean>;
  back: () => void;
  goTo: (index: number) => void;
  stepHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  stepContainerRef: React.RefObject<HTMLDivElement | null>;
};

const WizardContext = React.createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = React.useContext(WizardContext);
  if (!ctx) {
    throw new Error("Wizard sub-blocks must be rendered inside <Wizard>.");
  }
  return ctx;
}

type DynamicWizardFormApi = {
  setFieldMeta: (
    name: string,
    updater: (prev: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
  validate: (cause: "submit" | "change" | "blur") => Promise<unknown>;
  validateField: (name: string, cause: "submit" | "change" | "blur") => Promise<unknown>;
  getFieldMeta: (name: string) => { errors?: ReadonlyArray<unknown> } | undefined;
};

export type WizardProps = {
  steps: ReadonlyArray<WizardStepConfig>;
  /** Controlled 0-based active step index. */
  step?: number;
  /** Initial 0-based active step when uncontrolled. Defaults to `0`. */
  defaultStep?: number;
  onStepChange?: (nextStep: number) => void;
  className?: string;
  children: React.ReactNode;
};

/**
 * Form Wizard Block. Coordinates multi-step navigation and per-step validation
 * over one shared `useAppForm` instance (mounted inside `<Form form={form}>`)
 * without touching router or URL state (ADR 0002 & ADR 0008).
 */
export function Wizard({
  steps,
  step: controlledStep,
  defaultStep = 0,
  onStepChange,
  className,
  children,
}: WizardProps) {
  const form = useFormContext();
  const [internalStep, setInternalStep] = React.useState(defaultStep);
  const [completedSteps, setCompletedSteps] = React.useState<Set<number>>(() => new Set());
  const [highestVisited, setHighestVisited] = React.useState(defaultStep);
  const [isValidating, setIsValidating] = React.useState(false);

  const stepHeadingRef = React.useRef<HTMLHeadingElement | null>(null);
  const stepContainerRef = React.useRef<HTMLDivElement | null>(null);
  const isInitialMountRef = React.useRef(true);

  const maxIndex = Math.max(0, steps.length - 1);
  const rawStep = controlledStep ?? internalStep;
  const stepIndex = Math.min(maxIndex, Math.max(0, rawStep));
  const currentStep = steps[stepIndex] ?? { id: "step-0", title: "Step 1" };

  const setStepIndex = React.useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(maxIndex, Math.max(0, nextIndex));
      if (controlledStep === undefined) {
        setInternalStep(clamped);
      }
      setHighestVisited((prev) => Math.max(prev, clamped));
      onStepChange?.(clamped);
    },
    [controlledStep, maxIndex, onStepChange],
  );

  // Move focus to the newly active step heading after step transitions.
  React.useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [stepIndex]);

  const validateCurrentStep = React.useCallback(async (): Promise<boolean> => {
    const stepFields = currentStep.fields ?? [];
    const dynamicForm = form as unknown as DynamicWizardFormApi;
    setIsValidating(true);
    try {
      let allValid = true;

      if (stepFields.length > 0) {
        // Re-run form-level validators across change/blur/submit so stale
        // errors from an earlier cause (e.g. onBlur) clear once fixed.
        await dynamicForm.validate("change");
        await dynamicForm.validate("blur");
        await dynamicForm.validate("submit");
      }

      for (const fieldName of stepFields) {
        // Mark field touched so Field Blocks reveal errors immediately.
        dynamicForm.setFieldMeta(fieldName, (prev) => ({
          ...prev,
          isTouched: true,
        }));

        await dynamicForm.validateField(fieldName, "change");
        await dynamicForm.validateField(fieldName, "blur");
        const validated = await dynamicForm.validateField(fieldName, "submit");
        const metaErrors = dynamicForm.getFieldMeta(fieldName)?.errors;

        const fieldErrors = extractErrorMessages([
          ...(Array.isArray(validated) ? validated : []),
          ...(metaErrors ?? []),
        ]);
        if (fieldErrors.length > 0) {
          allValid = false;
        }
      }

      if (allValid && currentStep.validate) {
        const customOk = await currentStep.validate();
        if (!customOk) allValid = false;
      }

      if (!allValid) {
        queueMicrotask(() => {
          const firstInvalid = stepContainerRef.current?.querySelector<HTMLElement>(
            '[aria-invalid="true"]:not([disabled])',
          );
          firstInvalid?.focus();
        });
      }

      return allValid;
    } finally {
      setIsValidating(false);
    }
  }, [currentStep, form]);

  const next = React.useCallback(async (): Promise<boolean> => {
    if (stepIndex >= maxIndex) return false;
    const valid = await validateCurrentStep();
    if (!valid) return false;

    setCompletedSteps((prev) => {
      const copy = new Set(prev);
      copy.add(stepIndex);
      return copy;
    });
    setStepIndex(stepIndex + 1);
    return true;
  }, [maxIndex, setStepIndex, stepIndex, validateCurrentStep]);

  const back = React.useCallback(() => {
    if (stepIndex <= 0) return;
    setStepIndex(stepIndex - 1);
  }, [setStepIndex, stepIndex]);

  const goTo = React.useCallback(
    (targetIndex: number) => {
      if (targetIndex === stepIndex) return;
      if (targetIndex < 0 || targetIndex > maxIndex) return;
      if (targetIndex <= highestVisited || completedSteps.has(targetIndex)) {
        setStepIndex(targetIndex);
      }
    },
    [completedSteps, highestVisited, maxIndex, setStepIndex, stepIndex],
  );

  const isLast = stepIndex >= maxIndex;

  // Prevent pressing Enter inside an input on non-final steps from submitting the full form.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || isLast || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
    if (target.getAttribute("role") === "combobox" || target.getAttribute("role") === "option") {
      return;
    }
    if (target.tagName === "INPUT") {
      event.preventDefault();
      void next();
    }
  }

  const value = React.useMemo<WizardContextValue>(
    () => ({
      steps,
      stepIndex,
      currentStep,
      completedSteps,
      highestVisited,
      isFirst: stepIndex === 0,
      isLast,
      isValidating,
      next,
      back,
      goTo,
      stepHeadingRef,
      stepContainerRef,
    }),
    [
      back,
      completedSteps,
      currentStep,
      goTo,
      highestVisited,
      isLast,
      isValidating,
      next,
      stepIndex,
      steps,
    ],
  );

  return (
    <WizardContext.Provider value={value}>
      <div
        data-slot="wizard"
        onKeyDown={handleKeyDown}
        className={cn("flex flex-col gap-6", className)}
      >
        {children}
      </div>
    </WizardContext.Provider>
  );
}

export type WizardStepperProps = {
  /** Allows clicking previously visited or completed steps to navigate back. Defaults to `true`. */
  allowStepClick?: boolean;
  className?: string;
};

/**
 * Accessible step progress indicator. Shows a compact bar on small viewports
 * and a horizontal step list on desktop, using `aria-current="step"`.
 */
export function WizardStepper({ allowStepClick = true, className }: WizardStepperProps) {
  const { steps, stepIndex, currentStep, completedSteps, highestVisited, goTo } = useWizard();
  const progressPercent = steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 0;

  return (
    <nav
      aria-label="Progress"
      data-slot="wizard-stepper"
      className={cn("flex flex-col gap-3", className)}
    >
      {/* Compact mobile progress header */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <span className="truncate font-medium text-foreground">{currentStep.title}</span>
        </div>
        <Progress value={progressPercent} aria-label={`Step ${stepIndex + 1} of ${steps.length}`} />
      </div>

      {/* Desktop horizontal stepper */}
      <ol className="hidden items-start gap-2 sm:flex">
        {steps.map((step, index) => {
          const isCurrent = index === stepIndex;
          const isDone = completedSteps.has(index) && !isCurrent;
          const canClick =
            allowStepClick && !isCurrent && (index <= highestVisited || completedSteps.has(index));

          const content = (
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-xs font-semibold tabular-nums transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && "border-primary bg-primary/10 text-primary",
                  !isCurrent && !isDone && "border-border text-muted-foreground",
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col text-start">
                <span
                  className={cn(
                    "truncate text-xs font-semibold uppercase tracking-wider",
                    isCurrent ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </span>
                {step.description ? (
                  <span className="truncate text-xs text-muted-foreground">{step.description}</span>
                ) : null}
              </span>
            </span>
          );

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              {canClick ? (
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  className="group flex min-w-0 items-center rounded-none text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-w-0 items-center">{content}</div>
              )}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px flex-1 transition-colors",
                    isDone ? "bg-primary" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type WizardStepProps = {
  /** Matches `step.id` in `<Wizard steps={...}>`. */
  id: string;
  /** Optional heading rendered at the top of the step (receives focus on transition). */
  heading?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * Renders its children only while active so inactive steps are kept out of the
 * keyboard Tab order and accessibility tree while form state stays intact.
 */
export function WizardStep({ id, heading, description, className, children }: WizardStepProps) {
  const { currentStep, stepHeadingRef, stepContainerRef } = useWizard();

  if (currentStep.id !== id) return null;

  const resolvedHeading = heading ?? currentStep.title;
  const resolvedDescription = description ?? currentStep.description;

  return (
    <div
      ref={stepContainerRef}
      data-slot="wizard-step"
      data-step-id={id}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-1">
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="font-heading text-base font-semibold tracking-wider uppercase outline-none"
        >
          {resolvedHeading}
        </h2>
        {resolvedDescription ? (
          <p className="text-sm text-muted-foreground">{resolvedDescription}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export type WizardActionsProps = {
  backLabel?: React.ReactNode;
  nextLabel?: React.ReactNode;
  submitLabel?: React.ReactNode;
  loadingLabel?: React.ReactNode;
  className?: string;
};

export function WizardActions({
  backLabel = "Back",
  nextLabel = "Next",
  submitLabel = "Submit",
  loadingLabel,
  className,
}: WizardActionsProps) {
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const { isFirst, isLast, isValidating, back, next } = useWizard();

  return (
    <div
      data-slot="wizard-actions"
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-2", className)}
    >
      <div>
        {!isFirst ? (
          <Button
            type="button"
            variant="outline"
            disabled={isValidating || isSubmitting}
            onClick={back}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            {backLabel}
          </Button>
        ) : null}
      </div>
      <div>
        {isLast ? (
          <SubmitButton loadingLabel={loadingLabel}>{submitLabel}</SubmitButton>
        ) : (
          <Button
            type="button"
            disabled={isValidating}
            onClick={() => {
              void next();
            }}
          >
            {isValidating ? <Spinner data-icon="inline-start" /> : null}
            {nextLabel}
            {!isValidating ? <ArrowRightIcon data-icon="inline-end" /> : null}
          </Button>
        )}
      </div>
    </div>
  );
}
