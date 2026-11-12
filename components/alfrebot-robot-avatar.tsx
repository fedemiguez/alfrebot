/** Icono robot simple de Alfre (sin marcas Meta). */
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
      className={`rounded-full ${className}`}
      aria-hidden
    />
  );
}
