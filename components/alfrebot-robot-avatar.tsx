/** Icono robot simple de alfrebot (sin marcas Meta). */
export function AlfrebotRobotAvatar({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/alfrebot-robot.svg"
      alt=""
      width={size}
      height={size}
      className={`block shrink-0 self-start rounded-full object-cover ${className}`}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
      aria-hidden
    />
  );
}
