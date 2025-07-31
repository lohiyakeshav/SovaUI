import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type AnimateBy = 'words' | 'letters';
type Direction = 'top' | 'bottom';

interface BlurTextProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: AnimateBy;
  direction?: Direction;
  threshold?: number;
  rootMargin?: string;
  onAnimationComplete?: () => void;
  stepDuration?: number;
}

export function BlurText({
  text = '',
  delay = 200,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  onAnimationComplete,
  stepDuration = 0.35,
}: BlurTextProps) {
  const [isInView, setIsInView] = useState(false);
  const rootRef = useRef<HTMLParagraphElement>(null);
  const completedAnimations = useRef(new Set<number>());

  const elements = animateBy === 'words' ? text.split(' ') : text.split('');

  const fromAnimation = direction === 'top' 
    ? { filter: 'blur(10px)', opacity: 0, y: -50 }
    : { filter: 'blur(10px)', opacity: 0, y: 50 };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (rootRef.current) {
      observer.observe(rootRef.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  const handleAnimationComplete = (index: number) => {
    completedAnimations.current.add(index);
    if (completedAnimations.current.size === elements.length && onAnimationComplete) {
      onAnimationComplete();
    }
  };

  return (
    <p ref={rootRef} className={`flex flex-wrap ${className}`}>
      <AnimatePresence>
        {elements.map((segment, index) => (
          <motion.span
            key={`${text}-${index}`}
            initial={fromAnimation}
            animate={isInView ? {
              filter: ['blur(10px)', 'blur(5px)', 'blur(0px)'],
              opacity: [0, 0.5, 1],
              y: [
                direction === 'top' ? -50 : 50,
                direction === 'top' ? 5 : -5,
                0
              ]
            } : fromAnimation}
            transition={{
              duration: stepDuration * 2,
              delay: (index * delay) / 1000,
              ease: [0.4, 0, 0.2, 1],
            }}
            onAnimationComplete={() => handleAnimationComplete(index)}
            style={{
              display: 'inline-block',
              willChange: 'transform, filter, opacity'
            }}
          >
            {segment === ' ' ? '\u00A0' : segment}
            {animateBy === 'words' && index < elements.length - 1 ? '\u00A0' : ''}
          </motion.span>
        ))}
      </AnimatePresence>
    </p>
  );
} 