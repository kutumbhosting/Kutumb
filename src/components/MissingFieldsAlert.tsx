import { AlertCircle } from "lucide-react";

export interface FieldProblem {
  /** DOM id of the input to focus / highlight */
  id: string;
  /** Human-friendly field name, e.g. "Phone Number" */
  label: string;
  /** Optional specific message, e.g. "Please enter a valid email address" */
  message?: string;
}

/**
 * Inline, always-visible list of what still needs to be filled in. Shown right
 * above the submit button so a failed submit can never look like "nothing
 * happened" (toasts alone are easy to miss behind a dialog).
 */
const MissingFieldsAlert = ({ problems }: { problems: FieldProblem[] }) => {
  if (!problems.length) return null;
  return (
    <div
      id="missing-fields-alert"
      role="alert"
      className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle size={16} className="shrink-0" />
        Please complete the following before submitting:
      </p>
      <ul className="mt-2 list-disc pl-6 space-y-1">
        {problems.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="text-left underline underline-offset-2 hover:text-red-950"
              onClick={() => {
                const el = document.getElementById(p.id);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                (el as HTMLElement | null)?.focus?.();
              }}
            >
              {p.message || `${p.label} is required`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MissingFieldsAlert;
