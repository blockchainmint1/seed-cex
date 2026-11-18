import { fieldLabel, inputCls } from "@/components/account/ui";

/** Six-digit authenticator code box (phones get the number pad and code autofill). */
export function CodeField({ value, onChange, label = "Code from your authenticator app", id }: { value: string; onChange: (v: string) => void; label?: string; id?: string }) {
  return (
    <label className="block" htmlFor={id}>
      <span className={fieldLabel}>{label}</span>
      <input
        id={id}
        className={`${inputCls} mt-1 w-40 text-center font-mono text-lg tracking-[0.3em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="000000"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
      />
    </label>
  );
}
