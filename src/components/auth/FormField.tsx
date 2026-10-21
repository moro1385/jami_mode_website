import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
}

const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, hint, trailing, leading, className, id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className="space-y-2">
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-foreground/80"
        >
          {label}
        </label>
        <div className="relative">
          {leading && (
            <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 text-muted-foreground pointer-events-none">
              {leading}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={cn(
              "w-full h-12 bg-white border border-foreground/25 shadow-xs rounded-xl px-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-hidden transition-colors hover:border-foreground/45 focus:border-accent focus:ring-2 focus:ring-accent/20",
              error && "border-destructive focus:border-destructive focus:ring-destructive/20",
              disabled && "opacity-60 cursor-not-allowed",
              leading && "ps-11",
              trailing && "pe-12",
              className
            )}
            {...props}
          />
          {trailing && (
            <div className="absolute inset-y-0 end-0 flex items-center pe-3">{trailing}</div>
          )}
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
FormField.displayName = "FormField";

export default FormField;
