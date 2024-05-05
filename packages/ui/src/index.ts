import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { CopyButton } from "./copy-button";
export { Link } from "./link";
export { Button } from "./button";
export { Switch, SwitchField, SwitchGroup } from "./switch";
export { SpinnerIcon } from "./spinner";
