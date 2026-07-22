import { useEffect, useState, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface MeteorsProps {
  number?: number
  minDelay?: number
  maxDelay?: number
  minDuration?: number
  maxDuration?: number
  angle?: number
  className?: string
}

// Adapted from magicui Meteors (https://magicui.design/docs/components/meteors)
export function Meteors({
  number = 20,
  minDelay = 0.2,
  maxDelay = 1.2,
  minDuration = 2,
  maxDuration = 10,
  angle = 215,
  className
}: MeteorsProps) {
  const [meteorStyles, setMeteorStyles] = useState<CSSProperties[]>([])

  useEffect(() => {
    const styles = [...new Array(number)].map(
      () =>
        ({
          "--angle": `${-angle}deg`,
          "--base-opacity": `${(Math.random() * 0.6 + 0.4).toFixed(2)}`,
          top: "-5%",
          left: `calc(0% + ${Math.floor(Math.random() * window.innerWidth)}px)`,
          animationDelay: `${Math.random() * (maxDelay - minDelay) + minDelay}s`,
          animationDuration: `${Math.floor(Math.random() * (maxDuration - minDuration) + minDuration)}s`
        }) as CSSProperties
    )
    setMeteorStyles(styles)
  }, [number, minDelay, maxDelay, minDuration, maxDuration, angle])

  return (
    <>
      {meteorStyles.map((style, idx) => (
        <span
          key={idx}
          style={style}
          className={cn(
            "animate-meteor pointer-events-none absolute size-[2px] rotate-(--angle) rounded-full bg-foreground/40 shadow-[0_0_0_1px_#ffffff10]",
            className
          )}
        >
          {/* Meteor Tail */}
          <div className="pointer-events-none absolute top-1/2 -z-10 h-px w-[50px] -translate-y-1/2 bg-linear-to-r from-foreground/40 to-transparent" />
        </span>
      ))}
    </>
  )
}
