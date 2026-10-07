/**
 * Icons — simple SVG icon components for UI elements.
 * Zero-dependency, hand-crafted SVGs for crisp rendering.
 */

interface IconProps {
  className?: string;
  size?: number;
}

export function SunIcon({ className, size = 18 }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function MoonIcon({ className, size = 18 }: IconProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 0 0 21 12.79z" />
      <path d="M11.21 3v1.5M11.21 19.5v1.5M5.99 5.99l1.06 1.06M16.95 16.95l1.06 1.06M3 12h1.5M19.5 12h1.5M5.99 18.01l1.06-1.06M16.95 3.05l1.06-1.06" />
    </svg>
  );
}
