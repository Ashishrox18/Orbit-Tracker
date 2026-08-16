import type { ReactNode } from "react";

/**
 * The primitive set. Small on purpose — a handful of composable pieces beats a
 * component library for an app this size, and it keeps the bundle honest.
 */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({
  children,
  hint,
  id,
}: {
  children: ReactNode;
  hint?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-sm font-semibold tracking-wide text-ink-soft uppercase">
        {children}
      </h2>
      {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-3 py-1.5 text-sm min-h-9", md: "px-4 py-2.5 text-sm min-h-11" };
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-ink hover:border-accent",
    ghost: "text-ink-soft hover:bg-accent-soft hover:text-accent",
    danger: "border border-line-strong bg-surface text-danger hover:bg-danger-soft",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/**
 * Anchor styled as a button. Kept separate rather than polymorphic on Button:
 * nesting an <a> inside a <button> is invalid HTML and breaks keyboard
 * semantics, and a shared component makes that mistake easy to write.
 */
export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const sizes = { sm: "px-3 py-1.5 text-sm min-h-9", md: "px-4 py-2.5 text-sm min-h-11" };
  const variants = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-ink hover:border-accent",
  };
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ${sizes[size]} ${variants[variant]}`}
    >
      {children}
    </a>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

/** Status text is never colour-only — every variant carries a word. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "physical" | "mental" | "emotional" | "accent" | "danger" | "streak";
}) {
  const tones = {
    neutral: "border-line-strong text-ink-soft",
    physical: "border-physical/40 bg-physical-soft text-physical",
    mental: "border-mental/40 bg-mental-soft text-mental",
    emotional: "border-emotional/40 bg-emotional-soft text-emotional",
    accent: "border-accent/40 bg-accent-soft text-accent",
    danger: "border-danger/40 bg-danger-soft text-danger",
    streak: "border-streak/40 bg-streak-soft text-streak",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children ? <p className="mt-1 text-sm text-ink-faint">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** A single headline figure. Shared by the day-close summary and the Reports page. */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <p className="text-2xl font-semibold break-words tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
      {hint ? <p className="text-[11px] text-ink-faint break-words">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${safe}%` }} />
    </div>
  );
}

/** Groq is optional; when a panel fell back, say so rather than hiding it. */
export function FallbackNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink-faint">
      {children}
    </p>
  );
}
