/** Avatar del dueño en chat: foto Clerk o silueta genérica (estilo WA). */
export function OwnerChatAvatar({
  imageUrl,
  size = 28,
  className = "",
}: {
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const src =
    imageUrl && imageUrl.trim().length > 0
      ? imageUrl
      : "/icons/person-silhouette.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`block shrink-0 self-start rounded-full object-cover ${className}`}
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
      aria-hidden
      referrerPolicy="no-referrer"
    />
  );
}
