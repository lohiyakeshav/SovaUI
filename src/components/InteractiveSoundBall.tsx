"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "@/contexts/ThemeContext"

interface InteractiveSoundBallProps {
  isListening?: boolean;
}

export function InteractiveSoundBall({ isListening = false }: InteractiveSoundBallProps) {
  const { isDark } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const asciiRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>()
  const audioContextRef = useRef<AudioContext>()
  const analyserRef = useRef<AnalyserNode>()
  const dataArrayRef = useRef<Uint8Array>()
  const sourceRef = useRef<MediaStreamAudioSourceNode>()
  const streamRef = useRef<MediaStream>()

  // ASCII characters from darkest to lightest
  const asciiChars = " .:-=+*#%@"

  // Ball properties
  const ballRef = useRef({
    x: 0,
    y: 0,
    baseRadius: 100,
    currentRadius: 100,
    targetRadius: 100,
    hue: 200,
    targetHue: 200,
    particles: [] as Array<{
      x: number
      y: number
      vx: number
      vy: number
      life: number
      maxLife: number
      size: number
    }>,
  })

  const addParticles = (intensity: number, canvas: HTMLCanvasElement) => {
    const ball = ballRef.current
    const particleCount = Math.floor(intensity * 5)

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 4
      ball.particles.push({
        x: ball.x + Math.cos(angle) * ball.currentRadius,
        y: ball.y + Math.sin(angle) * ball.currentRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 60,
        maxLife: 60,
        size: 2 + Math.random() * 3,
      })
    }

    if (ball.particles.length > 200) {
      ball.particles.splice(0, ball.particles.length - 200)
    }
  }

  const convertToAscii = () => {
    const canvas = canvasRef.current
    const asciiDiv = asciiRef.current
    if (!canvas || !asciiDiv) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Check if canvas has valid dimensions
    if (canvas.width <= 0 || canvas.height <= 0) return

    // ASCII grid dimensions - adjusted for better aspect ratio
    const charWidth = 3 // Increased from 3 to make characters less wide
    const charHeight = 6
    const cols = Math.floor(canvas.width / charWidth)
    const rows = Math.floor(canvas.height / charHeight)

    // Ensure we have valid grid dimensions
    if (cols <= 0 || rows <= 0) return

    // Get image data with error handling
    let imageData
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    } catch (error) {
      console.warn("Failed to get image data:", error)
      return
    }

    const pixels = imageData.data

    let asciiString = ""

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Sample pixel from the center of each character cell
        const pixelX = Math.floor(x * charWidth + charWidth / 2)
        const pixelY = Math.floor(y * charHeight + charHeight / 2)

        // Ensure pixel coordinates are within bounds
        if (pixelX >= canvas.width || pixelY >= canvas.height) {
          asciiString += " "
          continue
        }

        const pixelIndex = (pixelY * canvas.width + pixelX) * 4

        // Ensure pixel index is within bounds
        if (pixelIndex >= pixels.length) {
          asciiString += " "
          continue
        }

        // Calculate brightness (0-255)
        const r = pixels[pixelIndex] || 0
        const g = pixels[pixelIndex + 1] || 0
        const b = pixels[pixelIndex + 2] || 0
        const brightness = (r + g + b) / 3

        // Map brightness to ASCII character
        const charIndex = Math.floor((brightness / 255) * (asciiChars.length - 1))
        asciiString += asciiChars[charIndex]
      }
      asciiString += "\n"
    }

    // Update ASCII display
    asciiDiv.textContent = asciiString
  }

  const animate = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Check if canvas has valid dimensions before proceeding
    if (canvas.width <= 0 || canvas.height <= 0) {
      animationRef.current = requestAnimationFrame(animate)
      return
    }

    const ball = ballRef.current

    // Clear canvas
    ctx.fillStyle = isDark ? "rgba(0, 0, 0, 1)" : "rgba(0, 0, 0, 0)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Analyze audio if available
    let volume = 0
    let dominantFreq = 0

    if (analyserRef.current && dataArrayRef.current && isListening) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current)

      const sum = dataArrayRef.current.reduce((a, b) => a + b, 0)
      volume = sum / dataArrayRef.current.length / 255

      // Boost volume by 3x for all devices
      volume = Math.min(1, volume * 3)

      let maxAmplitude = 0
      let maxIndex = 0
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        if (dataArrayRef.current[i] > maxAmplitude) {
          maxAmplitude = dataArrayRef.current[i]
          maxIndex = i
        }
      }
      dominantFreq = maxIndex / dataArrayRef.current.length

      ball.targetRadius = ball.baseRadius + volume * 120
      ball.targetHue = 200 + dominantFreq * 160

      // Lower threshold for particle creation
      const particleThreshold = 0.05
      if (volume > particleThreshold) {
        addParticles(volume, canvas)
      }
    } else {
      // Add subtle animation when no audio is available
      const time = Date.now() / 1000
      const pulseFactor = Math.sin(time) * 0.1 + 0.9
      ball.targetRadius = ball.baseRadius * pulseFactor
    }

    // Smooth transitions
    ball.currentRadius += (ball.targetRadius - ball.currentRadius) * 0.1
    ball.hue += (ball.targetHue - ball.hue) * 0.1

    // Update ball position
    ball.x = canvas.width / 2
    ball.y = canvas.height / 2

    // Draw ball with grayscale gradient
    const gradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.currentRadius)

    gradient.addColorStop(0, `rgba(255, 255, 255, 1)`)
    gradient.addColorStop(0.7, `rgba(180, 180, 180, 0.8)`)
    gradient.addColorStop(1, `rgba(80, 80, 80, 0.2)`)

    // Enhanced glow for better ASCII visibility
    ctx.shadowColor = `rgba(255, 255, 255, 0.8)`
    ctx.shadowBlur = 30
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.currentRadius, 0, Math.PI * 2)
    ctx.fill()

    // Brighter inner core
    ctx.shadowBlur = 0
    const coreGradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.currentRadius * 0.3)
    coreGradient.addColorStop(0, `rgba(255, 255, 255, 1)`)
    coreGradient.addColorStop(1, `rgba(255, 255, 255, 0.3)`)

    ctx.fillStyle = coreGradient
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.currentRadius * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Draw particles with grayscale
    ball.particles.forEach((particle, index) => {
      particle.x += particle.vx
      particle.y += particle.vy
      particle.life--

      const alpha = particle.life / particle.maxLife
      ctx.fillStyle = `rgba(220, 220, 220, ${alpha})`
      ctx.shadowColor = `rgba(255, 255, 255, ${alpha})`
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2)
      ctx.fill()

      if (particle.life <= 0) {
        ball.particles.splice(index, 1)
      }
    })

    // Draw enhanced frequency bars in grayscale
    if (analyserRef.current && dataArrayRef.current) {
      const barCount = 32
      const angleStep = (Math.PI * 2) / barCount

      for (let i = 0; i < barCount; i++) {
        const angle = i * angleStep

        // Get amplitude with boost
        let amplitude = dataArrayRef.current[i * 4] / 255
        amplitude = Math.min(1, amplitude * 3)

        const barLength = amplitude * 60

        const startX = ball.x + Math.cos(angle) * (ball.currentRadius + 10)
        const startY = ball.y + Math.sin(angle) * (ball.currentRadius + 10)
        const endX = ball.x + Math.cos(angle) * (ball.currentRadius + 10 + barLength)
        const endY = ball.y + Math.sin(angle) * (ball.currentRadius + 10 + barLength)

        const grayValue = Math.floor(200 * amplitude)
        ctx.strokeStyle = `rgba(${grayValue}, ${grayValue}, ${grayValue}, ${amplitude * 1.5})`
        ctx.lineWidth = 3
        ctx.shadowColor = `rgba(255, 255, 255, ${amplitude})`
        ctx.shadowBlur = 4
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.stroke()
      }
    }

    ctx.shadowBlur = 0

    // Convert to ASCII
    convertToAscii()

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    // Get canvas context with willReadFrequently for better performance
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      // Set willReadFrequently to true for better performance with getImageData
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.imageSmoothingEnabled = false
      }
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    const initAudio = async () => {
      if (!isListening) return;
      
      // Prevent multiple initializations
      if (audioContextRef.current || streamRef.current) {
        console.log('Audio already initialized, skipping...');
        return;
      }
      
      try {
        // Request microphone with optimized constraints for all devices
        const constraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            // Try to get the best possible audio quality
            sampleRate: 48000,
            channelCount: 1,
            volume: 1.0,
          },
        }

        // Don't request mic permission here - it's handled by MicButton
        // We'll use the existing stream if available
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          // Higher sample rate for better quality
          sampleRate: 48000,
        })

        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)

        // Adjust analyser settings for better sensitivity
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.5 // Less smoothing for more responsiveness

        // Add gain to boost the signal for all devices
        const gainNode = audioContext.createGain()
        gainNode.gain.value = 3.0 // Boost the signal
        source.connect(gainNode)
        gainNode.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser
        sourceRef.current = source
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)

        console.log("Audio initialized with high sensitivity for all devices")
      } catch (err) {
        console.error("Error accessing microphone:", err)
      }
    }

    if (isListening) {
      initAudio()
    } else {
      // Clean up audio when not listening
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => {
          console.warn('Error closing audio context:', err)
        })
        audioContextRef.current = null
      }
    }

    // Add a small delay to ensure canvas is properly sized before starting animation
    setTimeout(() => {
      animate()
    }, 100)

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => {
          console.warn('Error closing audio context:', err)
        })
        audioContextRef.current = null
      }
    }
  }, [isListening])

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="w-full h-full opacity-0" />
      <div
        ref={asciiRef}
        className={`absolute inset-0 font-mono whitespace-pre overflow-hidden pointer-events-none flex items-center justify-center transition-colors duration-300 ${
          isDark ? 'text-white' : 'text-blue-900'
        }`}
        style={{
          fontSize: "5px",
          lineHeight: "5px",
          letterSpacing: "-0.5px",
        }}
      />
    </div>
  )
}