import { useId, type SelectHTMLAttributes } from 'react';

export function SelectField({
  label,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className="edit-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props} />
    </div>
  );
}
