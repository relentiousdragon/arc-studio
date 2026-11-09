import { Pencil } from 'lucide-react';
//
export function ColorSwatchPicker({ className = '', color, value, onChange, onBlur, title, ariaLabel, ...rest }) {
  return (
    <span className={`color-swatch-picker ${className}`} {...rest}>
      <span className="color-swatch-face" style={color ? { backgroundColor: color } : undefined} aria-hidden="true" />
      <Pencil strokeWidth={2} className="color-swatch-pencil" aria-hidden="true" />
      <input
        type="color"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        title={title}
        aria-label={ariaLabel || title}
      />
    </span>
  );
}
