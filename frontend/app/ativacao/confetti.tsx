"use client"

import { useState, useEffect } from "react"

export function Confetti() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(true)
    const timer = setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-50">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2.5 h-2.5"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-10px`,
              backgroundColor: ["#25D366", "#128C7E", "#075E54", "#FFD700", "#FF6B6B"][Math.floor(Math.random() * 5)],
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              animation: `fall ${2 + Math.random() * 2}s linear forwards`,
              animationDelay: `${Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
      <style jsx>{`@keyframes fall { to { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style>
    </>
  )
}
