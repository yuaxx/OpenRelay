import { useId, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes } from "react";
import { Switch } from "../../ui";

type Tone = "neutral" | "accent" | "ok" | "warn" | "error";

export function Button({ variant = "secondary", size = "md", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return <button {...props} type={type} className={`or-button or-button--${variant} or-button--${size} or:inline-flex or:items-center or:justify-center or:gap-2 ${className}`} />;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`or-card or:min-w-0 ${className}`} />;
}

export function Badge({ tone = "neutral", className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span {...props} className={`or-badge or-badge--${tone} or:inline-flex or:items-center or:gap-1 ${className}`} />;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`or-input ${className}`} />;
}

export function Tabs({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} role="tablist" className={`or-tabs or:flex or:gap-1 ${className}`} />;
}

export function Tab({ active, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return <button {...props} type={type} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className={`or-tab ${className}`} />;
}

export function Toggle(props: ComponentProps<typeof Switch>) {
  return <span className="or-toggle"><Switch {...props} /></span>;
}

/** Native disclosure keeps expanding accounts independent of data fetching. */
export function AccountDetails({ label, count, children, status }: {
  label: string; count: number; children: React.ReactNode; status?: React.ReactNode;
}) {
  const id = useId();
  return <details className="or-account-details">
    <summary aria-controls={id} className="or:flex or:items-center or:gap-2">
      <span>{label}</span><Badge>{count}</Badge><span className="or-account-summary-status">{status}</span>
      <span className="or-disclosure-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div id={id} className="pws-dashboard-account-list">{children}</div>
  </details>;
}
