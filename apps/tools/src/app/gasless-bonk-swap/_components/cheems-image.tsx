/* eslint-disable jsx-a11y/interactive-supports-focus */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import CheemsPng from "@/../public/cheems.png";
import { cn } from "@blastctrl/ui";
import Image from "next/image";
import { useRef, useState } from "react";

export const CheemsImage = () => {
  const cheemsRef = useRef<HTMLDivElement | null>(null);
  const [bonkCounter, setBonkCounter] = useState(0);
  const [bonkAnimate, setBonkAnimate] = useState(false);

  const handleCheemsBonk = () => {
    if (!cheemsRef?.current) return;
    const wrapperRef = cheemsRef.current.parentElement;
    if (!wrapperRef) return;

    // Start animating
    setBonkAnimate(true);

    // Trigger the "jello" animation
    cheemsRef.current.style.animation = "none";
    cheemsRef.current.offsetHeight; /* trigger reflow */
    cheemsRef.current.style.removeProperty("animation");

    // Eyes trigger
    setBonkCounter((prev) => prev + 1);

    // Text bubbles
    const randomX = Math.round(Math.random() * 100); // [0, 100]
    const randomY = Math.round(Math.random() * 80); // [0, 80]
    const turnDeg = Math.round(Math.random() * 120 - 60); // [-60, 60]
    const el = document.createElement("span");
    el.textContent = "BONK";
    el.classList.add(
      "absolute",
      "text-orange-400",
      "text-sm",
      "font-semibold",
      "border-2",
      "border-orange-400",
      "px-1.5",
      "py-0.5",
      "rounded-xl",
      "pointer-events-none",
    );
    el.style.setProperty("transform", `rotate(${turnDeg}deg)`);
    el.style.setProperty("top", `${randomY}%`);
    el.style.setProperty("left", `${randomX}%`);
    wrapperRef.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 1000);
  };

  return (
    <div
      ref={cheemsRef}
      role="button"
      aria-label="Bonk!"
      className={cn(
        bonkAnimate && "jello-horizontal",
        "p-8 hover:cursor-pointer",
      )}
      onClick={handleCheemsBonk}
    >
      <div className="relative">
        <Image
          src={CheemsPng}
          alt=""
          height={320}
          width={320}
          className="size-[320px]"
        />
        {/* Eyes */}
        <div
          className={cn(
            "absolute left-[64%] top-[8%] text-sm",
            bonkCounter >= 20 ? "fire-in" : "opacity-0",
          )}
        >
          🔥
        </div>
        <div
          className={cn(
            "absolute left-[81%] top-[7.5%] text-sm",
            bonkCounter >= 20 ? "fire-in" : "opacity-0",
          )}
        >
          🔥
        </div>
      </div>
    </div>
  );
};
