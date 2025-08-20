"use client"

import { useEffect, useState } from "react"
import { RandomReveal } from "react-random-reveal"

export function Cascade({
  text,
  duration = 2
}: {
  text: string
  duration?: number
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const CHARACTERS = "0123456789$¢%+=".split("")

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return isLoaded ? (
    <span>
      <RandomReveal
        isPlaying
        characters={text}
        duration={duration}
        characterSet={CHARACTERS}
        ignoreCharacterSet={[" "]}
      />
    </span>
  ) : (
    <></>
  )
}
