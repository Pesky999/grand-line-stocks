import { useState } from "react";
import { getAchievementMedallionPath } from "@/lib/achievements/medallions";

const SIZE_CLASS = {
  sm: "size-8",
  md: "size-11",
  lg: "size-14",
} as const;

export function AchievementMedallion({
  code,
  name,
  icon,
  size = "md",
  className = "",
}: {
  code: string;
  name: string;
  icon?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imagePath = getAchievementMedallionPath(code);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]} ${className}`}
      title={name}
    >
      {imagePath && !imageFailed ? (
        <img
          src={imagePath}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true" className="text-base leading-none">
          {icon ?? "*"}
        </span>
      )}
    </span>
  );
}
